import assert from "node:assert";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const approvalArtifactRoot = join(
  process.cwd(),
  "provider-write-general-availability-approval-artifacts",
);
const closeoutArtifactRoot = join(
  process.cwd(),
  "provider-write-graduated-rollout-closeout-review-artifacts",
);
const runLedgerArtifactRoot = join(
  process.cwd(),
  "provider-write-graduated-rollout-run-ledger-artifacts",
);
const changeTicket = "chg-20260608-general-availability-approval";
const auditExportSha256 =
  "3b64db95cb55c763391c707108489ae18b4112d783300de38e033b4c98c3deaf";
const productionLaunchSha256 =
  "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f53";
const productionStaticCiSha256 =
  "a7b7e060570c4eb6723c99c7f45315b926f145730ad4a6c36bb1c58a72a1cf95";

test("provider write general availability approval verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write general availability approval verification passed\./,
  );
  assert.match(result.stdout, /approval=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write general availability approval safe mode requires evidence chain", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write general availability approval evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write graduated rollout closeout review evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write graduated rollout run ledger evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write general availability approval verifier accepts sanitized approval evidence", async () => {
  await withGeneralAvailabilityApprovalFixture(
    async ({ approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const result = await execVerifier(["--from-env"], {
        SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_FILE:
          approvalFile,
        SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_CLOSEOUT_REVIEW_FILE:
          closeoutReviewFile,
        SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_RUN_LEDGER_FILE:
          runLedgerFile,
        SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_REQUIRE_PASS:
          "true",
      });

      assert.match(
        result.stdout,
        /Provider write general availability approval verification passed\./,
      );
      assert.match(result.stdout, /rollout=general_availability/);
      assert.match(result.stdout, /approval=verified/);
      assert.strictEqual(result.stderr, "");
      assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
    },
  );
});

test("provider write general availability approval verifier rejects forged closeout and ledger bindings", async () => {
  await withGeneralAvailabilityApprovalFixture(
    async ({ approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        `--closeout-review=${closeoutReviewFile}`,
        `--run-ledger=${runLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /artifactBindings\.providerWriteGraduatedRolloutCloseoutReviewSha256 must match the closeout review file sha256/,
      );
      assert.match(
        failed.stderr,
        /closeout review artifactBindings\.providerWriteGraduatedRolloutRunLedgerSha256 must match the run ledger file sha256/,
      );
      assert.match(
        failed.stderr,
        /target\.changeTicket must match closeout review target\.changeTicket/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approval: {
        target: {
          changeTicket: "chg-different",
        },
        artifactBindings: {
          providerWriteGraduatedRolloutCloseoutReviewSha256:
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        },
      },
      closeoutReview: {
        artifactBindings: {
          providerWriteGraduatedRolloutRunLedgerSha256:
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        },
      },
    },
  );
});

test("provider write general availability approval verifier accepts rejected approval outside pass mode", async () => {
  await withGeneralAvailabilityApprovalFixture(
    async ({ approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const result = await execVerifier([
        `--approval=${approvalFile}`,
        `--closeout-review=${closeoutReviewFile}`,
        `--run-ledger=${runLedgerFile}`,
      ]);

      assert.match(
        result.stdout,
        /Provider write general availability approval verification passed\./,
      );
      assert.match(result.stdout, /approval=verified/);
      assert.strictEqual(result.stderr, "");
      assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
    },
    {
      approval: {
        approval: {
          approvalStatus: "rejected_needs_investigation",
        },
      },
    },
  );
});

test("provider write general availability approval verifier rejects weak approval and launch controls", async () => {
  await withGeneralAvailabilityApprovalFixture(
    async ({ approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        `--closeout-review=${closeoutReviewFile}`,
        `--run-ledger=${runLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /approval\.approvalStatus must be approved/);
      assert.match(failed.stderr, /approval reviewers must be distinct/);
      assert.match(failed.stderr, /approval\.secondReviewCompleted must be true/);
      assert.match(
        failed.stderr,
        /expansionScope\.automaticActivationEnabled must be false/,
      );
      assert.match(
        failed.stderr,
        /rolloutControls\.automaticActivationEnabled must be false/,
      );
      assert.match(
        failed.stderr,
        /rolloutControls\.manualApprovalBeforeMerchantActivation must be true/,
      );
      assert.match(
        failed.stderr,
        /operationalControls\.liveExecutorKillSwitchDefaultOn must be true/,
      );
      assert.match(failed.stderr, /commercialReadiness\.legalReviewCompleted must be true/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approval: {
        expansionScope: {
          automaticActivationEnabled: true,
        },
        approval: {
          approvalStatus: "rejected_needs_investigation",
          requestedByFingerprint: "abcdef123456",
          approvedByFingerprint: "abcdef123456",
          securityReviewerFingerprint: "abcdef123456",
          operationsReviewerFingerprint: "abcdef123456",
          commercialReviewerFingerprint: "abcdef123456",
          secondReviewCompleted: false,
        },
        operationalControls: {
          liveExecutorKillSwitchDefaultOn: false,
        },
        commercialReadiness: {
          legalReviewCompleted: false,
        },
        rolloutControls: {
          automaticActivationEnabled: true,
          manualApprovalBeforeMerchantActivation: false,
        },
      },
    },
  );
});

test("provider write general availability approval verifier rejects unsafe safety flags and sensitive evidence", async () => {
  await withGeneralAvailabilityApprovalFixture(
    async ({ approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        `--closeout-review=${closeoutReviewFile}`,
        `--run-ledger=${runLedgerFile}`,
      ]);

      assert.match(failed.stderr, /safety\.secretsInEvidence must be false/);
      assert.match(failed.stderr, /safety\.providerWriteExecutedByVerifier must be false/);
      assert.match(
        failed.stderr,
        /provider write general availability approval contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write general availability approval field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write general availability approval value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approval: {
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

test("provider write general availability approval verifier rejects unsafe paths and redacts arguments", async () => {
  const outside = await execVerifierFailure(["--approval=task_plan.md"]);
  assert.match(
    outside.stderr,
    /--approval must be inside provider-write-general-availability-approval-artifacts/,
  );

  const unsafeCloseout = await execVerifierFailure([
    "--closeout-review=https://user:secret@example.test/review.json",
  ]);
  assert.match(unsafeCloseout.stderr, /--closeout-review must be a safe local path/);
  assertNoSecretMarkers(`${unsafeCloseout.stdout}\n${unsafeCloseout.stderr}`);
  assert.ok(!unsafeCloseout.stderr.includes("user:secret"));

  const unknown = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
  ]);
  assert.match(unknown.stderr, /Unknown argument: --unknown=<redacted>/);
  assertNoSecretMarkers(`${unknown.stdout}\n${unknown.stderr}`);
});

async function withGeneralAvailabilityApprovalFixture(callback, overrides = {}) {
  await mkdir(approvalArtifactRoot, { recursive: true });
  await mkdir(closeoutArtifactRoot, { recursive: true });
  await mkdir(runLedgerArtifactRoot, { recursive: true });
  const approvalDir = await mkdtemp(join(approvalArtifactRoot, "test-"));
  const closeoutDir = await mkdtemp(join(closeoutArtifactRoot, "test-"));
  const runLedgerDir = await mkdtemp(join(runLedgerArtifactRoot, "test-"));
  const approvalFile = join(approvalDir, "general-availability-approval.json");
  const closeoutReviewFile = join(closeoutDir, "graduated-rollout-closeout-review.json");
  const runLedgerFile = join(runLedgerDir, "graduated-rollout-run-ledger.json");

  try {
    await writeJson(
      runLedgerFile,
      deepMerge(validGraduatedRunLedger(), overrides.runLedger ?? {}),
    );
    const runLedgerSha256 = await sha256File(runLedgerFile);
    await writeJson(
      closeoutReviewFile,
      deepMerge(
        validGraduatedCloseoutReview({
          providerWriteGraduatedRolloutRunLedgerSha256: runLedgerSha256,
        }),
        overrides.closeoutReview ?? {},
      ),
    );
    const closeoutReviewSha256 = await sha256File(closeoutReviewFile);
    await writeJson(
      approvalFile,
      deepMerge(
        validGeneralAvailabilityApproval({
          providerWriteGraduatedRolloutCloseoutReviewSha256:
            closeoutReviewSha256,
        }),
        overrides.approval ?? {},
      ),
    );

    await callback({
      approvalFile: relative(process.cwd(), approvalFile),
      closeoutReviewFile: relative(process.cwd(), closeoutReviewFile),
      runLedgerFile: relative(process.cwd(), runLedgerFile),
    });
  } finally {
    await rm(approvalDir, { recursive: true, force: true });
    await rm(closeoutDir, { recursive: true, force: true });
    await rm(runLedgerDir, { recursive: true, force: true });
  }
}

function validGeneralAvailabilityApproval({
  providerWriteGraduatedRolloutCloseoutReviewSha256,
}) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-general-availability-approval.v1",
    generatedAt: "2026-06-08T18:30:00.000Z",
    target: {
      rolloutIdFingerprint: "6a805e005e94",
      fromRolloutTrack: "graduated_multi_merchant",
      toRolloutTrack: "general_availability",
      changeTicket,
    },
    expansionScope: {
      merchantFingerprints: ["123456abcdef", "abcdef123456", "fedcba654321"],
      channels: ["taobao", "douyin"],
      allowedActions: ["modify_address", "issue_coupon", "urge_logistics"],
      maxMerchants: 25,
      maxDailyProviderWrites: 500,
      maxDailyProviderWritesPerMerchant: 50,
      maxCouponAmountCents: 5000,
      businessHoursOnly: true,
      automaticActivationEnabled: false,
      manualMerchantActivationRequired: true,
    },
    approval: {
      approvalStatus: "approved",
      requestedByFingerprint: "111111abcdef",
      approvedByFingerprint: "222222abcdef",
      securityReviewerFingerprint: "333333abcdef",
      operationsReviewerFingerprint: "444444abcdef",
      commercialReviewerFingerprint: "555555abcdef",
      approvedAt: "2026-06-08T18:45:00.000Z",
      secondReviewCompleted: true,
    },
    prerequisiteEvidence: {
      providerWriteGraduatedRolloutCloseoutReviewVerifierPassed: true,
      productionLaunchVerifierPassed: true,
      productionStaticCiVerifierPassed: true,
      productionBranchProtectionVerifierPassed: true,
      productionAlertingVerifierPassed: true,
      productionCanaryVerifierPassed: true,
      providerWriteKillSwitchControlPlaneVerifierPassed: true,
      providerWriteLiveExecutorControlPlaneVerifierPassed: true,
      providerWriteExecutionAttemptVisibilityVerifierPassed: true,
    },
    operationalControls: {
      operatorCoverageMinutes: 10080,
      namedOpsLeadFingerprint: "666666abcdef",
      incidentOwnerFingerprint: "777777abcdef",
      rollbackOwnerFingerprint: "888888abcdef",
      killSwitchOwnerFingerprint: "999999abcdef",
      billingOwnerFingerprint: "aaaaaaabcdef",
      supportOwnerFingerprint: "bbbbbbabcdef",
      merchantSuccessOwnerFingerprint: "ccccccabcdef",
      rollbackPlaybookReviewed: true,
      alertRoutesReviewed: true,
      rateLimitReviewed: true,
      supportEscalationReady: true,
      merchantNotificationPlanReady: true,
      noAutomaticCustomerVisibleReplies: true,
      liveExecutorKillSwitchDefaultOn: true,
      perMerchantActivationRequired: true,
    },
    commercialReadiness: {
      customerContractReviewed: true,
      billingPlanConfigured: true,
      supportSlaReviewed: true,
      merchantNotificationPlanReviewed: true,
      pricingReviewed: true,
      legalReviewCompleted: true,
      dataRetentionReviewed: true,
    },
    rolloutControls: {
      automaticActivationEnabled: false,
      automaticNextWaveEnabled: false,
      manualApprovalBeforeMerchantActivation: true,
      rollbackOnAnyFailedMutation: true,
      stopOnCustomerComplaint: true,
      stopOnRejectedCompensation: true,
      generalAvailabilityBroadcastReady: true,
    },
    artifactBindings: {
      providerWriteGraduatedRolloutCloseoutReviewSha256,
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

function validGraduatedCloseoutReview({
  providerWriteGraduatedRolloutRunLedgerSha256,
}) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1",
    target: {
      rolloutIdFingerprint: "6a805e005e94",
      rolloutTrack: "graduated_multi_merchant",
      changeTicket,
    },
    runSummary: {
      allRunsReviewed: true,
      failedRunsHaveIncidentNotes: true,
      rollbackActionsVerified: true,
      customerComplaintsStoppedRollout: true,
      compensationRejectionsStoppedRollout: true,
      merchantNotificationCompleted: true,
      billingImpactReviewed: true,
      supportSlaMaintained: true,
      noAutoCustomerReplies: true,
    },
    closeout: {
      decision: "approved_for_general_availability_review",
      outstandingActions: [],
    },
    evidence: {
      graduatedRolloutRunLedgerVerifierPassed: true,
    },
    artifactBindings: {
      providerWriteGraduatedRolloutRunLedgerSha256,
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

function validGraduatedRunLedger() {
  return {
    schemaVersion: "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1",
    target: {
      rolloutIdFingerprint: "6a805e005e94",
      rolloutTrack: "graduated_multi_merchant",
      changeTicket,
    },
    summary: {
      allRunsReviewed: true,
      customerComplaintsStoppedRollout: true,
      compensationRejectionsStoppedRollout: true,
      merchantNotificationCompleted: true,
      billingImpactReviewed: true,
      supportSlaMaintained: true,
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
    "scripts/verify-provider-write-general-availability-approval.mjs",
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
    assert.fail(`Expected general availability approval verification to fail, got stdout: ${result.stdout}`);
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
    if (
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
