import assert from "node:assert";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const runLedgerArtifactRoot = join(
  process.cwd(),
  "provider-write-graduated-rollout-run-ledger-artifacts",
);
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
const controlledRunLedgerArtifactRoot = join(
  process.cwd(),
  "provider-write-controlled-expansion-run-ledger-artifacts",
);
const changeTicket = "chg-20260608-graduated-rollout-run-ledger";
const auditExportSha256 =
  "3b64db95cb55c763391c707108489ae18b4112d783300de38e033b4c98c3deaf";
const productionLaunchSha256 =
  "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f53";
const productionStaticCiSha256 =
  "a7b7e060570c4eb6723c99c7f45315b926f145730ad4a6c36bb1c58a72a1cf95";

test("provider write graduated rollout run ledger verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write graduated rollout run ledger verification passed\./,
  );
  assert.match(result.stdout, /run-ledger=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write graduated rollout run ledger safe mode requires evidence chain", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write graduated rollout run ledger evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write graduated rollout preflight evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write graduated rollout preflight approval evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write graduated rollout preflight closeout review evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write graduated rollout preflight controlled run ledger evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write graduated rollout run ledger verifier accepts sanitized post-window evidence", async () => {
  await withGraduatedRunLedgerFixture(async ({
    runLedgerFile,
    preflightFile,
    approvalFile,
    closeoutReviewFile,
    controlledRunLedgerFile,
  }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_FILE: runLedgerFile,
      SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_FILE:
        preflightFile,
      SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE:
        approvalFile,
      SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_CLOSEOUT_REVIEW_FILE:
        closeoutReviewFile,
      SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_RUN_LEDGER_FILE:
        controlledRunLedgerFile,
      SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_REQUIRE_PASS: "true",
    });

    assert.match(
      result.stdout,
      /Provider write graduated rollout run ledger verification passed\./,
    );
    assert.match(result.stdout, /rollout=graduated_multi_merchant/);
    assert.match(result.stdout, /merchants=3/);
    assert.match(result.stdout, /run-ledger=verified/);
    assert.strictEqual(result.stderr, "");
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write graduated rollout run ledger verifier rejects forged preflight and approval bindings", async () => {
  await withGraduatedRunLedgerFixture(
    async ({
      runLedgerFile,
      preflightFile,
      approvalFile,
      closeoutReviewFile,
      controlledRunLedgerFile,
    }) => {
      const failed = await execVerifierFailure([
        `--run-ledger=${runLedgerFile}`,
        `--preflight=${preflightFile}`,
        `--preflight-approval=${approvalFile}`,
        `--preflight-closeout-review=${closeoutReviewFile}`,
        `--preflight-run-ledger=${controlledRunLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /evidence\.providerWriteGraduatedRolloutPreflightSha256 must match the preflight file sha256/,
      );
      assert.match(
        failed.stderr,
        /preflight\.prerequisiteEvidence\.providerWriteGraduatedRolloutApprovalSha256 must match the approval file sha256/,
      );
      assert.match(
        failed.stderr,
        /approval prerequisiteEvidence\.providerWriteControlledExpansionCloseoutReviewSha256 must match the closeout review file sha256/,
      );
      assert.match(
        failed.stderr,
        /closeout review artifactBindings\.providerWriteControlledExpansionRunLedgerSha256 must match the controlled run ledger file sha256/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      runLedger: {
        evidence: {
          providerWriteGraduatedRolloutPreflightSha256:
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        },
      },
      preflight: {
        prerequisiteEvidence: {
          providerWriteGraduatedRolloutApprovalSha256:
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        },
      },
      approval: {
        prerequisiteEvidence: {
          providerWriteControlledExpansionCloseoutReviewSha256:
            "300000000000000000000000000000000000000000000000000000000000abcd",
        },
      },
      closeoutReview: {
        artifactBindings: {
          providerWriteControlledExpansionRunLedgerSha256:
            "400000000000000000000000000000000000000000000000000000000000abcd",
        },
      },
    },
  );
});

test("provider write graduated rollout run ledger verifier rejects scope and launch-window drift", async () => {
  await withGraduatedRunLedgerFixture(
    async ({ runLedgerFile, preflightFile }) => {
      const failed = await execVerifierFailure([
        `--run-ledger=${runLedgerFile}`,
        `--preflight=${preflightFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /target\.changeTicket must match preflight target\.changeTicket/,
      );
      assert.match(
        failed.stderr,
        /expansionScope\.merchantFingerprints must stay inside preflight scope/,
      );
      assert.match(
        failed.stderr,
        /runRecords\[0\]\.createdAt must be inside launchWindow/,
      );
      assert.match(
        failed.stderr,
        /runRecords\[0\]\.channel must stay inside expansionScope\.channels/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      runLedger: {
        target: {
          changeTicket: "chg-different",
        },
        expansionScope: {
          merchantFingerprints: ["123456abcdef", "999999abcdef"],
        },
        runRecords: [
          safeRun({
            merchantFingerprint: "999999abcdef",
            channel: "jd",
            createdAt: "2026-06-08T23:30:00.000Z",
            completedAt: "2026-06-08T23:40:00.000Z",
          }),
        ],
      },
    },
  );
});

test("provider write graduated rollout run ledger verifier rejects weak closeout controls", async () => {
  await withGraduatedRunLedgerFixture(
    async ({ runLedgerFile, preflightFile }) => {
      const failed = await execVerifierFailure([
        `--run-ledger=${runLedgerFile}`,
        `--preflight=${preflightFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /summary\.totalRuns must match runRecords length/);
      assert.match(
        failed.stderr,
        /summary\.customerComplaintsStoppedRollout must be true when complaintCount is greater than 0/,
      );
      assert.match(
        failed.stderr,
        /summary\.compensationRejectionsStoppedRollout must be true when customerRejectedCompensationCount is greater than 0/,
      );
      assert.match(
        failed.stderr,
        /summary\.rollbackActionsVerified must be true when failed provider mutations exist/,
      );
      assert.match(
        failed.stderr,
        /runRecords\[0\]\.status cannot remain failed after providerMutationExecuted=true/,
      );
      assert.match(failed.stderr, /summary\.merchantNotificationCompleted must be true/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      runLedger: {
        summary: {
          totalRuns: 9,
          succeededRuns: 0,
          failedRuns: 1,
          rolledBackRuns: 0,
          blockedRuns: 0,
          complaintCount: 1,
          customerRejectedCompensationCount: 1,
          rollbackActionsVerified: false,
          customerComplaintsStoppedRollout: false,
          compensationRejectionsStoppedRollout: false,
          merchantNotificationCompleted: false,
        },
        runRecords: [
          safeRun({
            status: "failed",
            providerMutationExecuted: true,
            complaintRaised: true,
            compensationRejected: true,
          }),
        ],
      },
    },
  );
});

test("provider write graduated rollout run ledger verifier rejects unsafe records and sensitive evidence", async () => {
  await withGraduatedRunLedgerFixture(
    async ({ runLedgerFile, preflightFile }) => {
      const failed = await execVerifierFailure([
        `--run-ledger=${runLedgerFile}`,
        `--preflight=${preflightFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /runRecords\[0\]\.customerVisibleMessageSent must be false/,
      );
      assert.match(
        failed.stderr,
        /runRecords\[0\]\.providerPayloadStored must be false/,
      );
      assert.match(failed.stderr, /safety\.secretsInLedger must be false/);
      assert.match(
        failed.stderr,
        /provider write graduated rollout run ledger contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write graduated rollout run ledger field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write graduated rollout run ledger value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      runLedger: {
        tenantId: "tenant_launch_secret",
        providerToken: "actual_provider_token_must_not_leak",
        runRecords: [
          {
            customerVisibleMessageSent: true,
            providerPayloadStored: true,
          },
        ],
        safety: {
          secretsInLedger: true,
        },
        notes: "plain_secret_token_must_not_leak",
      },
    },
  );
});

test("provider write graduated rollout run ledger verifier rejects unsafe paths and redacts arguments", async () => {
  const outside = await execVerifierFailure(["--run-ledger=task_plan.md"]);
  assert.match(
    outside.stderr,
    /--run-ledger must be inside provider-write-graduated-rollout-run-ledger-artifacts/,
  );

  const unsafePreflight = await execVerifierFailure([
    "--preflight=https://user:secret@example.test/preflight.json",
  ]);
  assert.match(unsafePreflight.stderr, /--preflight must be a safe local path/);
  assertNoSecretMarkers(`${unsafePreflight.stdout}\n${unsafePreflight.stderr}`);
  assert.ok(!unsafePreflight.stderr.includes("user:secret"));

  const unknown = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
  ]);
  assert.match(unknown.stderr, /Unknown argument: --unknown=<redacted>/);
  assertNoSecretMarkers(`${unknown.stdout}\n${unknown.stderr}`);
});

async function withGraduatedRunLedgerFixture(callback, overrides = {}) {
  await mkdir(runLedgerArtifactRoot, { recursive: true });
  await mkdir(preflightArtifactRoot, { recursive: true });
  await mkdir(approvalArtifactRoot, { recursive: true });
  await mkdir(closeoutReviewArtifactRoot, { recursive: true });
  await mkdir(controlledRunLedgerArtifactRoot, { recursive: true });
  const runLedgerDir = await mkdtemp(join(runLedgerArtifactRoot, "test-"));
  const preflightDir = await mkdtemp(join(preflightArtifactRoot, "test-"));
  const approvalDir = await mkdtemp(join(approvalArtifactRoot, "test-"));
  const closeoutDir = await mkdtemp(join(closeoutReviewArtifactRoot, "test-"));
  const controlledRunLedgerDir = await mkdtemp(
    join(controlledRunLedgerArtifactRoot, "test-"),
  );
  const runLedgerFile = join(runLedgerDir, "graduated-rollout-run-ledger.json");
  const preflightFile = join(preflightDir, "graduated-rollout-preflight.json");
  const approvalFile = join(approvalDir, "graduated-rollout-approval.json");
  const closeoutReviewFile = join(
    closeoutDir,
    "controlled-expansion-closeout-review.json",
  );
  const controlledRunLedgerFile = join(
    controlledRunLedgerDir,
    "controlled-expansion-run-ledger.json",
  );

  try {
    await writeJson(
      controlledRunLedgerFile,
      deepMerge(validControlledRunLedger(), overrides.controlledRunLedger ?? {}),
    );
    const controlledRunLedgerSha256 = await sha256File(controlledRunLedgerFile);
    await writeJson(
      closeoutReviewFile,
      deepMerge(
        validCloseoutReview({
          providerWriteControlledExpansionRunLedgerSha256:
            controlledRunLedgerSha256,
        }),
        overrides.closeoutReview ?? {},
      ),
    );
    const closeoutReviewSha256 = await sha256File(closeoutReviewFile);
    await writeJson(
      approvalFile,
      deepMerge(
        validApproval({
          providerWriteControlledExpansionCloseoutReviewSha256:
            closeoutReviewSha256,
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
    const preflightSha256 = await sha256File(preflightFile);
    await writeJson(
      runLedgerFile,
      deepMerge(
        validRunLedger({
          providerWriteGraduatedRolloutPreflightSha256: preflightSha256,
        }),
        overrides.runLedger ?? {},
      ),
    );

    await callback({
      runLedgerFile: relative(process.cwd(), runLedgerFile),
      preflightFile: relative(process.cwd(), preflightFile),
      approvalFile: relative(process.cwd(), approvalFile),
      closeoutReviewFile: relative(process.cwd(), closeoutReviewFile),
      controlledRunLedgerFile: relative(process.cwd(), controlledRunLedgerFile),
    });
  } finally {
    await rm(runLedgerDir, { recursive: true, force: true });
    await rm(preflightDir, { recursive: true, force: true });
    await rm(approvalDir, { recursive: true, force: true });
    await rm(closeoutDir, { recursive: true, force: true });
    await rm(controlledRunLedgerDir, { recursive: true, force: true });
  }
}

function validRunLedger({ providerWriteGraduatedRolloutPreflightSha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1",
    generatedAt: "2026-06-08T23:30:00.000Z",
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
      closedAt: "2026-06-08T23:20:00.000Z",
      durationMinutes: 120,
      freezeWindowActive: true,
      businessHoursOnly: true,
    },
    summary: {
      totalRuns: 4,
      succeededRuns: 2,
      failedRuns: 0,
      rolledBackRuns: 1,
      blockedRuns: 1,
      complaintCount: 0,
      customerRejectedCompensationCount: 1,
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
    runRecords: [
      safeRun({
        status: "succeeded",
        action: "modify_address",
        runFingerprint:
          "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606c06d4be3cd35db7a1912cf6ec",
      }),
      safeRun({
        status: "succeeded",
        action: "issue_coupon",
        merchantFingerprint: "abcdef123456",
        channel: "douyin",
        runFingerprint:
          "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      }),
      safeRun({
        status: "rolled_back",
        action: "issue_coupon",
        merchantFingerprint: "fedcba654321",
        providerMutationExecuted: true,
        compensationRejected: true,
        runFingerprint:
          "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      }),
      safeRun({
        status: "blocked",
        action: "issue_coupon",
        networkExecution: "blocked_before_network",
        providerMutationExecuted: false,
        runFingerprint:
          "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
      }),
    ],
    evidence: {
      providerWriteGraduatedRolloutPreflightVerifierPassed: true,
      providerWriteGraduatedRolloutPreflightSha256,
      productionLaunchVerifierPassed: true,
      productionStaticCiVerifierPassed: true,
      productionAlertingVerifierPassed: true,
      productionCanaryVerifierPassed: true,
      providerWriteKillSwitchControlPlaneVerifierPassed: true,
      providerWriteLiveExecutorControlPlaneVerifierPassed: true,
      providerWriteExecutionAttemptVisibilityVerifierPassed: true,
      auditExportVerified: true,
      postGraduatedRolloutReviewCompleted: true,
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

function safeRun(overrides = {}) {
  return {
    merchantFingerprint: "123456abcdef",
    channel: "taobao",
    runFingerprint:
      "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606c06d4be3cd35db7a1912cf6ec",
    requestFingerprint: "123456abcdef",
    executionAttemptFingerprint: "234567abcdef",
    auditLogSha256:
      "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
    operatorFingerprint: "345678abcdef",
    reviewerFingerprint: "456789abcdef",
    rollbackOwnerFingerprint: "56789abcdef0",
    billingOwnerFingerprint: "6789abcdef01",
    supportOwnerFingerprint: "789abcdef012",
    action: "modify_address",
    riskLevel: "low",
    status: "succeeded",
    networkExecution: "provider_api_called",
    providerMutationExecuted: true,
    customerVisibleMessageSent: false,
    providerResponseStored: false,
    providerPayloadStored: false,
    complaintRaised: false,
    compensationRejected: false,
    createdAt: "2026-06-08T21:15:00.000Z",
    completedAt: "2026-06-08T21:16:00.000Z",
    ...overrides,
  };
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

function validControlledRunLedger() {
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
    "scripts/verify-provider-write-graduated-rollout-run-ledger.mjs",
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
    assert.fail(`Expected graduated rollout run ledger verification to fail, got stdout: ${result.stdout}`);
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
