import assert from "node:assert";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const activationArtifactRoot = join(
  process.cwd(),
  "provider-write-manual-merchant-activation-artifacts",
);
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
const changeTicket = "chg-20260608-manual-merchant-activation";
const rolloutIdFingerprint = "6a805e005e94";
const merchantFingerprint = "123456abcdef";
const auditExportSha256 =
  "3b64db95cb55c763391c707108489ae18b4112d783300de38e033b4c98c3deaf";
const productionLaunchSha256 =
  "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f53";
const productionStaticCiSha256 =
  "a7b7e060570c4eb6723c99c7f45315b926f145730ad4a6c36bb1c58a72a1cf95";

test("provider write manual merchant activation verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write manual merchant activation verification passed\./,
  );
  assert.match(result.stdout, /activation=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write manual merchant activation safe mode requires evidence chain", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write manual merchant activation evidence is required/,
  );
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

test("provider write manual merchant activation verifier accepts sanitized activation evidence", async () => {
  await withManualMerchantActivationFixture(
    async ({ activationFile, approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const result = await execVerifier(["--from-env"], {
        SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_FILE:
          activationFile,
        SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_APPROVAL_FILE:
          approvalFile,
        SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_CLOSEOUT_REVIEW_FILE:
          closeoutReviewFile,
        SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_RUN_LEDGER_FILE:
          runLedgerFile,
        SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_REQUIRE_PASS:
          "true",
      });

      assert.match(
        result.stdout,
        /Provider write manual merchant activation verification passed\./,
      );
      assert.match(result.stdout, /merchant=123456abcdef/);
      assert.match(result.stdout, /activation=verified/);
      assert.strictEqual(result.stderr, "");
      assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
    },
  );
});

test("provider write manual merchant activation verifier rejects forged source bindings", async () => {
  await withManualMerchantActivationFixture(
    async ({ activationFile, approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--activation=${activationFile}`,
        `--approval=${approvalFile}`,
        `--closeout-review=${closeoutReviewFile}`,
        `--run-ledger=${runLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /artifactBindings\.providerWriteGeneralAvailabilityApprovalSha256 must match the approval file sha256/,
      );
      assert.match(
        failed.stderr,
        /approval artifactBindings\.providerWriteGraduatedRolloutCloseoutReviewSha256 must match the closeout review file sha256/,
      );
      assert.match(
        failed.stderr,
        /closeout review artifactBindings\.providerWriteGraduatedRolloutRunLedgerSha256 must match the run ledger file sha256/,
      );
      assert.match(
        failed.stderr,
        /target\.changeTicket must match approval target\.changeTicket/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      activation: {
        target: {
          changeTicket: "chg-different",
        },
        artifactBindings: {
          providerWriteGeneralAvailabilityApprovalSha256:
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        },
      },
      approval: {
        artifactBindings: {
          providerWriteGraduatedRolloutCloseoutReviewSha256:
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        },
      },
      closeoutReview: {
        artifactBindings: {
          providerWriteGraduatedRolloutRunLedgerSha256:
            "88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589",
        },
      },
    },
  );
});

test("provider write manual merchant activation verifier rejects incomplete upstream source evidence", async () => {
  await withManualMerchantActivationFixture(
    async ({ activationFile, approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--activation=${activationFile}`,
        `--approval=${approvalFile}`,
        `--closeout-review=${closeoutReviewFile}`,
        `--run-ledger=${runLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /approval\.expansionScope\.allowedActions must be an array/,
      );
      assert.match(
        failed.stderr,
        /approval\.expansionScope\.maxDailyProviderWritesPerMerchant must be an integer/,
      );
      assert.match(
        failed.stderr,
        /approval\.commercialReadiness must be an object/,
      );
      assert.match(failed.stderr, /closeout review\.runSummary must be an object/);
      assert.match(failed.stderr, /run ledger\.summary must be an object/);
      assert.match(failed.stderr, /run ledger\.runRecords must be an array/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approval: {
        expansionScope: {
          allowedActions: undefined,
          maxDailyProviderWritesPerMerchant: undefined,
          maxCouponAmountCents: undefined,
        },
        commercialReadiness: undefined,
      },
      closeoutReview: {
        runSummary: undefined,
      },
      runLedger: {
        summary: undefined,
        runRecords: undefined,
      },
    },
  );
});

test("provider write manual merchant activation verifier accepts rejected activation outside pass mode", async () => {
  await withManualMerchantActivationFixture(
    async ({ activationFile, approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const result = await execVerifier([
        `--activation=${activationFile}`,
        `--approval=${approvalFile}`,
        `--closeout-review=${closeoutReviewFile}`,
        `--run-ledger=${runLedgerFile}`,
      ]);

      assert.match(
        result.stdout,
        /Provider write manual merchant activation verification passed\./,
      );
      assert.match(result.stdout, /activation=verified/);
      assert.strictEqual(result.stderr, "");
      assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
    },
    {
      activation: {
        activation: {
          activationStatus: "rejected_needs_investigation",
        },
      },
    },
  );
});

test("provider write manual merchant activation verifier rejects weak activation and merchant scope", async () => {
  await withManualMerchantActivationFixture(
    async ({ activationFile, approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--activation=${activationFile}`,
        `--approval=${approvalFile}`,
        `--closeout-review=${closeoutReviewFile}`,
        `--run-ledger=${runLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /activation\.activationStatus must be approved_for_manual_activation/,
      );
      assert.match(failed.stderr, /activation reviewers must be distinct/);
      assert.match(failed.stderr, /activation\.secondReviewCompleted must be true/);
      assert.match(
        failed.stderr,
        /merchantScope\.maxDailyProviderWrites must not exceed approval expansionScope\.maxDailyProviderWritesPerMerchant/,
      );
      assert.match(
        failed.stderr,
        /launchControls\.automaticActivationEnabled must be false/,
      );
      assert.match(
        failed.stderr,
        /launchControls\.manualApprovalBeforeProviderWrites must be true/,
      );
      assert.match(
        failed.stderr,
        /launchControls\.liveExecutorKillSwitchDefaultOn must be true/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      activation: {
        merchantScope: {
          maxDailyProviderWrites: 75,
        },
        activation: {
          activationStatus: "rejected_needs_investigation",
          requestedByFingerprint: "abcdef123456",
          activatedByFingerprint: "abcdef123456",
          securityReviewerFingerprint: "abcdef123456",
          operationsReviewerFingerprint: "abcdef123456",
          merchantSuccessReviewerFingerprint: "abcdef123456",
          secondReviewCompleted: false,
        },
        launchControls: {
          automaticActivationEnabled: true,
          manualApprovalBeforeProviderWrites: false,
          liveExecutorKillSwitchDefaultOn: false,
        },
      },
    },
  );
});

test("provider write manual merchant activation verifier rejects unsafe safety flags and sensitive evidence", async () => {
  await withManualMerchantActivationFixture(
    async ({ activationFile, approvalFile, closeoutReviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--activation=${activationFile}`,
        `--approval=${approvalFile}`,
        `--closeout-review=${closeoutReviewFile}`,
        `--run-ledger=${runLedgerFile}`,
      ]);

      assert.match(failed.stderr, /safety\.secretsInEvidence must be false/);
      assert.match(failed.stderr, /safety\.providerWriteExecutedByVerifier must be false/);
      assert.match(
        failed.stderr,
        /provider write manual merchant activation contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write manual merchant activation field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write manual merchant activation value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      activation: {
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

test("provider write manual merchant activation verifier rejects unsafe paths and redacts arguments", async () => {
  const outside = await execVerifierFailure(["--activation=task_plan.md"]);
  assert.match(
    outside.stderr,
    /--activation must be inside provider-write-manual-merchant-activation-artifacts/,
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

async function withManualMerchantActivationFixture(callback, overrides = {}) {
  await mkdir(activationArtifactRoot, { recursive: true });
  await mkdir(approvalArtifactRoot, { recursive: true });
  await mkdir(closeoutArtifactRoot, { recursive: true });
  await mkdir(runLedgerArtifactRoot, { recursive: true });
  const activationDir = await mkdtemp(join(activationArtifactRoot, "test-"));
  const approvalDir = await mkdtemp(join(approvalArtifactRoot, "test-"));
  const closeoutDir = await mkdtemp(join(closeoutArtifactRoot, "test-"));
  const runLedgerDir = await mkdtemp(join(runLedgerArtifactRoot, "test-"));
  const activationFile = join(activationDir, "manual-merchant-activation.json");
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
    const approvalSha256 = await sha256File(approvalFile);
    await writeJson(
      activationFile,
      deepMerge(
        validManualMerchantActivation({
          providerWriteGeneralAvailabilityApprovalSha256: approvalSha256,
        }),
        overrides.activation ?? {},
      ),
    );

    await callback({
      activationFile: relative(process.cwd(), activationFile),
      approvalFile: relative(process.cwd(), approvalFile),
      closeoutReviewFile: relative(process.cwd(), closeoutReviewFile),
      runLedgerFile: relative(process.cwd(), runLedgerFile),
    });
  } finally {
    await rm(activationDir, { recursive: true, force: true });
    await rm(approvalDir, { recursive: true, force: true });
    await rm(closeoutDir, { recursive: true, force: true });
    await rm(runLedgerDir, { recursive: true, force: true });
  }
}

function validManualMerchantActivation({
  providerWriteGeneralAvailabilityApprovalSha256,
}) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-manual-merchant-activation.v1",
    generatedAt: "2026-06-08T19:30:00.000Z",
    target: {
      rolloutIdFingerprint,
      rolloutTrack: "general_availability",
      merchantFingerprint,
      channel: "taobao",
      changeTicket,
    },
    merchantScope: {
      merchantFingerprint,
      channel: "taobao",
      allowedActions: ["modify_address", "issue_coupon"],
      maxDailyProviderWrites: 40,
      maxCouponAmountCents: 3000,
      businessHoursOnly: true,
    },
    activation: {
      activationStatus: "approved_for_manual_activation",
      requestedByFingerprint: "111111abcdef",
      activatedByFingerprint: "222222abcdef",
      securityReviewerFingerprint: "333333abcdef",
      operationsReviewerFingerprint: "444444abcdef",
      merchantSuccessReviewerFingerprint: "555555abcdef",
      activatedAt: "2026-06-08T19:45:00.000Z",
      secondReviewCompleted: true,
    },
    prerequisiteEvidence: {
      providerWriteGeneralAvailabilityApprovalVerifierPassed: true,
      productionLaunchVerifierPassed: true,
      productionStaticCiVerifierPassed: true,
      providerWriteKillSwitchControlPlaneVerifierPassed: true,
      providerWriteLiveExecutorControlPlaneVerifierPassed: true,
      providerWriteExecutionAttemptVisibilityVerifierPassed: true,
    },
    launchControls: {
      automaticActivationEnabled: false,
      automaticNextMerchantEnabled: false,
      manualApprovalBeforeProviderWrites: true,
      liveExecutorKillSwitchDefaultOn: true,
      noAutomaticCustomerVisibleReplies: true,
      perMerchantRollbackReady: true,
      rollbackOnAnyFailedMutation: true,
      stopOnCustomerComplaint: true,
      stopOnRejectedCompensation: true,
    },
    artifactBindings: {
      providerWriteGeneralAvailabilityApprovalSha256,
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

function validGeneralAvailabilityApproval({
  providerWriteGraduatedRolloutCloseoutReviewSha256,
}) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-general-availability-approval.v1",
    generatedAt: "2026-06-08T18:00:00.000Z",
    target: {
      rolloutIdFingerprint,
      fromRolloutTrack: "graduated_multi_merchant",
      toRolloutTrack: "general_availability",
      changeTicket,
    },
    expansionScope: {
      merchantFingerprints: [merchantFingerprint, "abcdef123456", "fedcba654321"],
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
      requestedByFingerprint: "aa1111aa1111",
      approvedByFingerprint: "bb2222bb2222",
      securityReviewerFingerprint: "cc3333cc3333",
      operationsReviewerFingerprint: "dd4444dd4444",
      commercialReviewerFingerprint: "ee5555ee5555",
      approvedAt: "2026-06-08T18:15:00.000Z",
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
      namedOpsLeadFingerprint: "a1b2c3d4e5f6",
      incidentOwnerFingerprint: "b1c2d3e4f5a6",
      rollbackOwnerFingerprint: "c1d2e3f4a5b6",
      killSwitchOwnerFingerprint: "d1e2f3a4b5c6",
      billingOwnerFingerprint: "e1f2a3b4c5d6",
      supportOwnerFingerprint: "f1a2b3c4d5e6",
      merchantSuccessOwnerFingerprint: "123abc456def",
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
    generatedAt: "2026-06-08T17:00:00.000Z",
    target: {
      rolloutIdFingerprint,
      rolloutTrack: "graduated_multi_merchant",
      changeTicket,
    },
    expansionScope: graduatedExpansionScope(),
    launchWindow: graduatedLaunchWindow(),
    runSummary: graduatedRunSummary(),
    reviewers: {
      releaseOwnerFingerprint: "aabbcc112233",
      operationsReviewerFingerprint: "bbccdd223344",
      supportReviewerFingerprint: "ccddee334455",
      rollbackOwnerFingerprint: "ddeeff445566",
      reviewedAt: "2026-06-08T17:20:00.000Z",
      secondReviewCompleted: true,
    },
    closeout: {
      decision: "approved_for_general_availability_review",
      customerImpactReviewed: true,
      providerMutationReviewCompleted: true,
      complaintReviewCompleted: true,
      compensationRejectionReviewCompleted: true,
      incidentReviewCompleted: true,
      rollbackReviewCompleted: true,
      billingImpactReviewed: true,
      merchantNotificationReviewed: true,
      supportSlaReviewed: true,
      evidencePackageReviewed: true,
      outstandingActions: [],
    },
    evidence: {
      graduatedRolloutRunLedgerVerifierPassed: true,
      productionLaunchVerifierPassed: true,
      productionStaticCiVerifierPassed: true,
      productionAlertingVerifierPassed: true,
      productionCanaryVerifierPassed: true,
      auditExportReviewed: true,
      supportEscalationReviewCompleted: true,
      merchantNotificationReviewCompleted: true,
    },
    artifactBindings: {
      providerWriteGraduatedRolloutRunLedgerSha256,
      auditExportSha256,
      productionLaunchSha256,
      productionStaticCiSha256,
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
    generatedAt: "2026-06-08T16:00:00.000Z",
    target: {
      rolloutIdFingerprint,
      rolloutTrack: "graduated_multi_merchant",
      changeTicket,
    },
    expansionScope: graduatedExpansionScope(),
    launchWindow: graduatedLaunchWindow(),
    summary: graduatedRunLedgerSummary(),
    runRecords: [
      {
        merchantFingerprint,
        channel: "taobao",
        runFingerprint: "4ec9599fc203d1762b8c59920c2dcd0fb3e5450163dbd59e1f1e4fdf85374be1",
        requestFingerprint: "2f2d2a9f80a5f5f35da74b327d4fb215ca4fb2bdfd1bb32af2e45885ec864d2f",
        executionAttemptFingerprint: "5c0b84bf2f3de6c5fc3fd84c5c989a6e0f7c6e7ad4f8a2e4b5c6d7e8f9012345",
        auditLogSha256: auditExportSha256,
        operatorFingerprint: "abcabc123123",
        reviewerFingerprint: "bcdabc234234",
        rollbackOwnerFingerprint: "cdeabc345345",
        billingOwnerFingerprint: "defabc456456",
        supportOwnerFingerprint: "efaabc567567",
        action: "modify_address",
        riskLevel: "low",
        status: "succeeded",
        networkExecution: "live",
        providerMutationExecuted: true,
        customerVisibleMessageSent: false,
        providerResponseStored: false,
        providerPayloadStored: false,
        complaintRaised: false,
        compensationRejected: false,
        createdAt: "2026-06-08T15:15:00.000Z",
        completedAt: "2026-06-08T15:16:00.000Z",
      },
    ],
    evidence: {
      providerWriteGraduatedRolloutPreflightVerifierPassed: true,
      providerWriteGraduatedRolloutPreflightSha256:
        "9af4d0e4857d66a3112b82c68e04c8a572cf20812a23e5f32263d74c3587a96d",
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

function graduatedExpansionScope() {
  return {
    merchantFingerprints: [merchantFingerprint, "abcdef123456", "fedcba654321"],
    channels: ["taobao", "douyin"],
    allowedActions: ["modify_address", "issue_coupon", "urge_logistics"],
    maxMerchants: 3,
    maxDailyProviderWrites: 100,
    maxDailyProviderWritesPerMerchant: 50,
    maxCouponAmountCents: 5000,
    businessHoursOnly: true,
  };
}

function graduatedLaunchWindow() {
  return {
    startsAt: "2026-06-08T15:00:00.000Z",
    endsAt: "2026-06-08T16:00:00.000Z",
    closedAt: "2026-06-08T16:10:00.000Z",
    durationMinutes: 60,
    freezeWindowActive: true,
    businessHoursOnly: true,
  };
}

function graduatedRunSummary() {
  return {
    totalRuns: 1,
    succeededRuns: 1,
    failedRuns: 0,
    rolledBackRuns: 0,
    blockedRuns: 0,
    failedProviderMutationRuns: 0,
    complaintCount: 0,
    customerRejectedCompensationCount: 0,
    allRunsReviewed: true,
    failedRunsHaveIncidentNotes: true,
    rollbackActionsVerified: true,
    customerComplaintsStoppedRollout: true,
    compensationRejectionsStoppedRollout: true,
    merchantNotificationCompleted: true,
    billingImpactReviewed: true,
    supportSlaMaintained: true,
    noAutoCustomerReplies: true,
  };
}

function graduatedRunLedgerSummary() {
  return {
    totalRuns: 1,
    succeededRuns: 1,
    failedRuns: 0,
    rolledBackRuns: 0,
    blockedRuns: 0,
    complaintCount: 0,
    customerRejectedCompensationCount: 0,
    allRunsReviewed: true,
    failedRunsHaveIncidentNotes: true,
    rollbackActionsVerified: true,
    customerComplaintsStoppedRollout: true,
    compensationRejectionsStoppedRollout: true,
    merchantNotificationCompleted: true,
    billingImpactReviewed: true,
    supportSlaMaintained: true,
    noAutoCustomerReplies: true,
  };
}

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-manual-merchant-activation.mjs",
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
    assert.fail(`Expected manual merchant activation verification to fail, got stdout: ${result.stdout}`);
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
