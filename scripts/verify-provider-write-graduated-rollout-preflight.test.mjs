import assert from "node:assert";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const preflightArtifactRoot = join(
  process.cwd(),
  "provider-write-graduated-rollout-preflight-artifacts",
);
const approvalArtifactRoot = join(
  process.cwd(),
  "provider-write-graduated-rollout-approval-artifacts",
);
const closeoutReviewArtifactRoot = join(
  process.cwd(),
  "provider-write-controlled-expansion-closeout-review-artifacts",
);
const runLedgerArtifactRoot = join(
  process.cwd(),
  "provider-write-controlled-expansion-run-ledger-artifacts",
);
const changeTicket = "chg-20260608-graduated-rollout-preflight";
const auditExportSha256 =
  "3b64db95cb55c763391c707108489ae18b4112d783300de38e033b4c98c3deaf";
const productionLaunchSha256 =
  "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f53";
const productionStaticCiSha256 =
  "a7b7e060570c4eb6723c99c7f45315b926f145730ad4a6c36bb1c58a72a1cf95";

test("provider write graduated rollout preflight verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write graduated rollout preflight verification passed\./,
  );
  assert.match(result.stdout, /preflight=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write graduated rollout preflight safe mode requires evidence chain", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write graduated rollout preflight evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write graduated rollout approval evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write controlled expansion closeout review evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write controlled expansion run ledger evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write graduated rollout preflight verifier accepts sanitized launch-window evidence", async () => {
  await withGraduatedPreflightFixture(async ({
    preflightFile,
    approvalFile,
    closeoutReviewFile,
    runLedgerFile,
  }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_FILE: preflightFile,
      SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_APPROVAL_FILE:
        approvalFile,
      SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_CLOSEOUT_REVIEW_FILE:
        closeoutReviewFile,
      SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_RUN_LEDGER_FILE:
        runLedgerFile,
      SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_REQUIRE_PASS: "true",
    });

    assert.match(
      result.stdout,
      /Provider write graduated rollout preflight verification passed\./,
    );
    assert.match(result.stdout, /rollout=graduated_multi_merchant/);
    assert.match(result.stdout, /merchants=3/);
    assert.match(result.stdout, /preflight=verified/);
    assert.strictEqual(result.stderr, "");
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write graduated rollout preflight verifier rejects forged approval and closeout bindings", async () => {
  await withGraduatedPreflightFixture(
    async ({ preflightFile, approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        `--approval=${approvalFile}`,
        `--closeout-review=${closeoutReviewFile}`,
        `--run-ledger=${runLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /prerequisiteEvidence\.providerWriteGraduatedRolloutApprovalSha256 must match the approval file sha256/,
      );
      assert.match(
        failed.stderr,
        /approval prerequisiteEvidence\.providerWriteControlledExpansionCloseoutReviewSha256 must match the closeout review file sha256/,
      );
      assert.match(
        failed.stderr,
        /closeout review artifactBindings\.providerWriteControlledExpansionRunLedgerSha256 must match the run ledger file sha256/,
      );
      assert.match(
        failed.stderr,
        /target\.changeTicket must match approval target\.changeTicket/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      preflight: {
        target: {
          changeTicket: "chg-different",
        },
        prerequisiteEvidence: {
          providerWriteGraduatedRolloutApprovalSha256:
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        },
      },
      approval: {
        prerequisiteEvidence: {
          providerWriteControlledExpansionCloseoutReviewSha256:
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        },
      },
      closeoutReview: {
        artifactBindings: {
          providerWriteControlledExpansionRunLedgerSha256:
            "300000000000000000000000000000000000000000000000000000000000abcd",
        },
      },
    },
  );
});

test("provider write graduated rollout preflight verifier rejects scope outside PR77 approval", async () => {
  await withGraduatedPreflightFixture(
    async ({ preflightFile, approvalFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        `--approval=${approvalFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /target\.rolloutTrack must be graduated_multi_merchant/);
      assert.match(
        failed.stderr,
        /expansionScope\.merchantFingerprints must stay inside the approved merchant scope/,
      );
      assert.match(
        failed.stderr,
        /expansionScope\.allowedActions contains unsupported value/,
      );
      assert.match(
        failed.stderr,
        /expansionScope\.maxDailyProviderWrites must not exceed approval limit/,
      );
      assert.match(
        failed.stderr,
        /expansionScope\.maxCouponAmountCents must not exceed approval limit/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      preflight: {
        target: {
          rolloutTrack: "general_availability",
        },
        expansionScope: {
          merchantFingerprints: ["123456abcdef", "abcdef123456", "999999abcdef"],
          allowedActions: ["modify_address", "refund_order"],
          maxDailyProviderWrites: 250,
          maxCouponAmountCents: 6000,
        },
      },
    },
  );
});

test("provider write graduated rollout preflight verifier rejects unsafe window and rollout plan", async () => {
  await withGraduatedPreflightFixture(
    async ({ preflightFile, approvalFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        `--approval=${approvalFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /launchWindow\.durationMinutes must be an integer between 30 and 240/,
      );
      assert.match(failed.stderr, /launchWindow\.freezeWindowActive must be true/);
      assert.match(
        failed.stderr,
        /rolloutPlan\.automaticNextWaveEnabled must be false/,
      );
      assert.match(
        failed.stderr,
        /rolloutPlan\.rollbackOnAnyFailedMutation must be true/,
      );
      assert.match(
        failed.stderr,
        /rolloutPlan\.manualApprovalBeforeNextWave must be true/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      preflight: {
        launchWindow: {
          durationMinutes: 300,
          freezeWindowActive: false,
        },
        rolloutPlan: {
          automaticNextWaveEnabled: true,
          rollbackOnAnyFailedMutation: false,
          manualApprovalBeforeNextWave: false,
        },
      },
    },
  );
});

test("provider write graduated rollout preflight verifier rejects weak operations and commercial readiness", async () => {
  await withGraduatedPreflightFixture(
    async ({ preflightFile, approvalFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        `--approval=${approvalFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /operationalControls\.operatorCoverageMinutes must be an integer between 480 and 10080/,
      );
      assert.match(failed.stderr, /operationalControls owners must be distinct/);
      assert.match(
        failed.stderr,
        /operationalControls\.supportEscalationReady must be true/,
      );
      assert.match(
        failed.stderr,
        /commercialReadiness\.merchantNotificationPlanReviewed must be true/,
      );
      assert.match(
        failed.stderr,
        /commercialReadiness\.billingPlanConfigured must be true/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      preflight: {
        operationalControls: {
          operatorCoverageMinutes: 120,
          incidentOwnerFingerprint: "444444abcdef",
          rollbackOwnerFingerprint: "444444abcdef",
          killSwitchOwnerFingerprint: "444444abcdef",
          billingOwnerFingerprint: "444444abcdef",
          supportEscalationReady: false,
        },
        commercialReadiness: {
          merchantNotificationPlanReviewed: false,
          billingPlanConfigured: false,
        },
      },
    },
  );
});

test("provider write graduated rollout preflight verifier rejects unsafe safety flags and sensitive evidence", async () => {
  await withGraduatedPreflightFixture(
    async ({ preflightFile, approvalFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        `--approval=${approvalFile}`,
      ]);

      assert.match(failed.stderr, /safety\.secretsInEvidence must be false/);
      assert.match(failed.stderr, /safety\.providerWriteExecutedByVerifier must be false/);
      assert.match(
        failed.stderr,
        /provider write graduated rollout preflight contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write graduated rollout preflight field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write graduated rollout preflight value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      preflight: {
        tenantId: "tenant_launch_secret",
        providerToken: "actual_provider_token_must_not_leak",
        safety: {
          secretsInEvidence: true,
          providerWriteExecutedByVerifier: true,
        },
      },
    },
  );
});

test("provider write graduated rollout preflight verifier rejects unsafe paths and redacts arguments", async () => {
  const outside = await execVerifierFailure(["--preflight=task_plan.md"]);
  assert.match(
    outside.stderr,
    /--preflight must be inside provider-write-graduated-rollout-preflight-artifacts/,
  );

  const unsafeApproval = await execVerifierFailure([
    "--approval=https://user:secret@example.test/approval.json",
  ]);
  assert.match(unsafeApproval.stderr, /--approval must be a safe local path/);
  assertNoSecretMarkers(`${unsafeApproval.stdout}\n${unsafeApproval.stderr}`);
  assert.ok(!unsafeApproval.stderr.includes("user:secret"));

  const unknown = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
  ]);
  assert.match(unknown.stderr, /Unknown argument: --unknown=<redacted>/);
  assertNoSecretMarkers(`${unknown.stdout}\n${unknown.stderr}`);
});

async function withGraduatedPreflightFixture(callback, overrides = {}) {
  await mkdir(preflightArtifactRoot, { recursive: true });
  await mkdir(approvalArtifactRoot, { recursive: true });
  await mkdir(closeoutReviewArtifactRoot, { recursive: true });
  await mkdir(runLedgerArtifactRoot, { recursive: true });
  const preflightDir = await mkdtemp(join(preflightArtifactRoot, "test-"));
  const approvalDir = await mkdtemp(join(approvalArtifactRoot, "test-"));
  const closeoutDir = await mkdtemp(join(closeoutReviewArtifactRoot, "test-"));
  const runLedgerDir = await mkdtemp(join(runLedgerArtifactRoot, "test-"));
  const preflightFile = join(preflightDir, "graduated-rollout-preflight.json");
  const approvalFile = join(approvalDir, "graduated-rollout-approval.json");
  const closeoutReviewFile = join(closeoutDir, "controlled-expansion-closeout-review.json");
  const runLedgerFile = join(runLedgerDir, "controlled-expansion-run-ledger.json");

  try {
    await writeJson(
      runLedgerFile,
      deepMerge(validRunLedger(), overrides.runLedger ?? {}),
    );
    const runLedgerSha256 = await sha256File(runLedgerFile);
    await writeJson(
      closeoutReviewFile,
      deepMerge(
        validCloseoutReview({
          providerWriteControlledExpansionRunLedgerSha256: runLedgerSha256,
        }),
        overrides.closeoutReview ?? {},
      ),
    );
    const closeoutReviewSha256 = await sha256File(closeoutReviewFile);
    await writeJson(
      approvalFile,
      deepMerge(
        validApproval({
          providerWriteControlledExpansionCloseoutReviewSha256: closeoutReviewSha256,
        }),
        overrides.approval ?? {},
      ),
    );
    const approvalSha256 = await sha256File(approvalFile);
    await writeJson(
      preflightFile,
      deepMerge(
        validPreflight({
          providerWriteGraduatedRolloutApprovalSha256: approvalSha256,
        }),
        overrides.preflight ?? {},
      ),
    );

    await callback({
      preflightFile: relative(process.cwd(), preflightFile),
      approvalFile: relative(process.cwd(), approvalFile),
      closeoutReviewFile: relative(process.cwd(), closeoutReviewFile),
      runLedgerFile: relative(process.cwd(), runLedgerFile),
    });
  } finally {
    await rm(preflightDir, { recursive: true, force: true });
    await rm(approvalDir, { recursive: true, force: true });
    await rm(closeoutDir, { recursive: true, force: true });
    await rm(runLedgerDir, { recursive: true, force: true });
  }
}

function validPreflight({ providerWriteGraduatedRolloutApprovalSha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-graduated-rollout-preflight.v1",
    generatedAt: "2026-06-08T20:00:00.000Z",
    target: {
      rolloutIdFingerprint: "6a805e005e94",
      rolloutTrack: "graduated_multi_merchant",
      changeTicket,
    },
    expansionScope: {
      merchantFingerprints: ["123456abcdef", "abcdef123456", "fedcba654321"],
      channels: ["taobao", "douyin"],
      allowedActions: ["modify_address", "issue_coupon"],
      maxMerchants: 3,
      maxDailyProviderWrites: 120,
      maxDailyProviderWritesPerMerchant: 8,
      maxCouponAmountCents: 3000,
      businessHoursOnly: true,
    },
    launchWindow: {
      startsAt: "2026-06-08T21:00:00.000Z",
      endsAt: "2026-06-08T23:00:00.000Z",
      durationMinutes: 120,
      freezeWindowActive: true,
      businessHoursOnly: true,
    },
    prerequisiteEvidence: {
      providerWriteGraduatedRolloutApprovalVerifierPassed: true,
      providerWriteGraduatedRolloutApprovalSha256,
      productionLaunchVerifierPassed: true,
      productionStaticCiVerifierPassed: true,
      productionBranchProtectionVerifierPassed: true,
      productionAlertingVerifierPassed: true,
      productionCanaryVerifierPassed: true,
      providerWriteKillSwitchControlPlaneVerifierPassed: true,
      providerWriteLiveExecutorControlPlaneVerifierPassed: true,
      providerWritePayloadEscrowBoundaryVerifierPassed: true,
      providerWriteExecutionAttemptVisibilityVerifierPassed: true,
    },
    rolloutPlan: {
      waveCount: 1,
      maxMerchantsPerWave: 3,
      holdMinutesBetweenWaves: 240,
      automaticNextWaveEnabled: false,
      manualApprovalBeforeNextWave: true,
      rollbackOnAnyFailedMutation: true,
      stopOnCustomerComplaint: true,
      stopOnRejectedCompensation: true,
    },
    operationalControls: {
      operatorCoverageMinutes: 480,
      namedOpsLeadFingerprint: "444444abcdef",
      incidentOwnerFingerprint: "555555abcdef",
      rollbackOwnerFingerprint: "666666abcdef",
      killSwitchOwnerFingerprint: "777777abcdef",
      billingOwnerFingerprint: "888888abcdef",
      supportOwnerFingerprint: "999999abcdef",
      merchantNotificationPlanReady: true,
      supportEscalationReady: true,
      rollbackPlaybookReviewed: true,
      alertRoutesReviewed: true,
      rateLimitReviewed: true,
      noAutomaticCustomerVisibleReplies: true,
    },
    commercialReadiness: {
      billingPlanConfigured: true,
      merchantNotificationPlanReviewed: true,
      supportSlaReviewed: true,
      pricingReviewed: true,
    },
    safety: {
      secretsInEvidence: false,
      rawTenantIdsInEvidence: false,
      rawMerchantIdsInEvidence: false,
      customerDataInEvidence: false,
      providerPayloadsInEvidence: false,
      providerResponsesInEvidence: false,
      rawIdempotencyKeysInEvidence: false,
      networkExecutedByVerifier: false,
      providerWriteExecutedByVerifier: false,
      payloadEscrowOpenedByVerifier: false,
      credentialsReadByVerifier: false,
      customerVisibleActionsSentByVerifier: false,
    },
  };
}

function validApproval({ providerWriteControlledExpansionCloseoutReviewSha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-graduated-rollout-approval.v1",
    generatedAt: "2026-06-08T18:30:00.000Z",
    target: {
      rolloutIdFingerprint: "6a805e005e94",
      fromRolloutTrack: "controlled_multi_merchant",
      toRolloutTrack: "graduated_multi_merchant",
      changeTicket,
    },
    expansionScope: {
      merchantFingerprints: [
        "123456abcdef",
        "abcdef123456",
        "fedcba654321",
        "456789abcdef",
      ],
      channels: ["taobao", "douyin"],
      allowedActions: ["modify_address", "issue_coupon", "urge_logistics"],
      maxMerchants: 10,
      maxDailyProviderWrites: 200,
      maxDailyProviderWritesPerMerchant: 10,
      maxCouponAmountCents: 5000,
      businessHoursOnly: true,
      automaticNextWaveEnabled: false,
    },
    approval: {
      approvalStatus: "approved",
      requestedByFingerprint: "111111abcdef",
      approvedByFingerprint: "222222abcdef",
      secondReviewerFingerprint: "333333abcdef",
      approvedAt: "2026-06-08T18:45:00.000Z",
    },
    prerequisiteEvidence: {
      providerWriteControlledExpansionCloseoutReviewVerifierPassed: true,
      providerWriteControlledExpansionCloseoutReviewSha256,
      productionLaunchVerifierPassed: true,
      productionStaticCiVerifierPassed: true,
      productionBranchProtectionVerifierPassed: true,
      productionAlertingVerifierPassed: true,
      productionCanaryVerifierPassed: true,
      providerWriteKillSwitchControlPlaneVerifierPassed: true,
      providerWriteLiveExecutorControlPlaneVerifierPassed: true,
    },
    operationalControls: {
      operatorCoverageMinutes: 480,
      namedOpsLeadFingerprint: "444444abcdef",
      incidentOwnerFingerprint: "555555abcdef",
      rollbackOwnerFingerprint: "666666abcdef",
      killSwitchOwnerFingerprint: "777777abcdef",
      billingOwnerFingerprint: "888888abcdef",
      supportOwnerFingerprint: "999999abcdef",
      rollbackPlaybookReviewed: true,
      alertRoutesReviewed: true,
      rateLimitReviewed: true,
      supportEscalationReady: true,
      merchantNotificationPlanReady: true,
      noAutomaticCustomerVisibleReplies: true,
    },
    commercialReadiness: {
      customerContractReviewed: true,
      billingPlanConfigured: true,
      supportSlaReviewed: true,
      merchantNotificationPlanReviewed: true,
      pricingReviewed: true,
    },
    artifactBindings: {
      auditExportSha256,
      productionLaunchSha256,
      productionStaticCiSha256,
    },
    safety: {
      secretsInEvidence: false,
      rawTenantIdsInEvidence: false,
      rawMerchantIdsInEvidence: false,
      customerDataInEvidence: false,
      providerPayloadsInEvidence: false,
      providerResponsesInEvidence: false,
      rawIdempotencyKeysInEvidence: false,
      networkExecutedByVerifier: false,
      providerWriteExecutedByVerifier: false,
      payloadEscrowOpenedByVerifier: false,
      credentialsReadByVerifier: false,
      customerVisibleActionsSentByVerifier: false,
    },
  };
}

function validCloseoutReview({ providerWriteControlledExpansionRunLedgerSha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-controlled-expansion-closeout-review.v1",
    target: {
      rolloutIdFingerprint: "6a805e005e94",
      rolloutTrack: "controlled_multi_merchant",
      changeTicket,
    },
    runSummary: {
      allRunsReviewed: true,
      customerComplaintsStoppedRollout: true,
      rejectedCompensationReviewed: true,
      noAutoCustomerReplies: true,
    },
    closeout: {
      decision: "approved_for_next_expansion_review",
      outstandingActions: [],
    },
    artifactBindings: {
      providerWriteControlledExpansionRunLedgerSha256,
    },
    safety: {
      secretsInReview: false,
      rawTenantIdsInReview: false,
      rawMerchantIdsInReview: false,
      customerDataInReview: false,
      providerPayloadsInReview: false,
      providerResponsesInReview: false,
      rawIdempotencyKeysInReview: false,
      networkExecutedByVerifier: false,
      providerWriteExecutedByVerifier: false,
      payloadEscrowOpenedByVerifier: false,
      credentialsReadByVerifier: false,
      customerVisibleActionsSentByVerifier: false,
    },
  };
}

function validRunLedger() {
  return {
    schemaVersion: "smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1",
    target: {
      rolloutIdFingerprint: "6a805e005e94",
      rolloutTrack: "controlled_multi_merchant",
      changeTicket,
    },
    summary: {
      allRunsReviewed: true,
      customerComplaintsStoppedRollout: true,
      noAutoCustomerReplies: true,
    },
    safety: {
      secretsInLedger: false,
      rawTenantIdsInLedger: false,
      rawMerchantIdsInLedger: false,
      customerDataInLedger: false,
      providerPayloadsInLedger: false,
      providerResponsesInLedger: false,
      rawIdempotencyKeysInLedger: false,
      networkExecutedByVerifier: false,
      providerWriteExecutedByVerifier: false,
      payloadEscrowOpenedByVerifier: false,
      credentialsReadByVerifier: false,
      customerVisibleActionsSentByVerifier: false,
    },
  };
}

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-graduated-rollout-preflight.mjs",
    ...args,
  ], {
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function execVerifierFailure(args, env = {}) {
  try {
    const result = await execVerifier(args, env);
    assert.fail(`Expected graduated rollout preflight verification to fail, got stdout: ${result.stdout}`);
  } catch (error) {
    assert.notStrictEqual(error.code, 0);
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

function assertNoSecretMarkers(value) {
  for (const marker of [
    "actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "tenant_launch_secret",
    "tenant_1",
    "user:secret",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function deepMerge(base, overrides) {
  const output = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      output[key] = value;
    } else if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      output[key] = deepMerge(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}
