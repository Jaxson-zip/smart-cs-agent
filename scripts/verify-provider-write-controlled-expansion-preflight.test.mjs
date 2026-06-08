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
  "provider-write-controlled-expansion-preflight-artifacts",
);
const approvalArtifactRoot = join(
  process.cwd(),
  "provider-write-controlled-expansion-approval-artifacts",
);
const approvalAssemblyArtifactRoot = join(
  process.cwd(),
  "provider-write-safe-ledger-assembly-artifacts",
);
const approvalAssemblyDraftArtifactRoot = join(
  process.cwd(),
  "provider-write-live-pilot-run-ledger-draft-artifacts",
);
const approvalAssemblyReviewArtifactRoot = join(
  process.cwd(),
  "provider-write-manual-closeout-review-artifacts",
);
const approvalAssemblyLedgerArtifactRoot = join(
  process.cwd(),
  "provider-write-live-pilot-run-ledger-artifacts",
);
const changeTicket = "chg-20260608-controlled-expansion-preflight";
const auditExportSha256 =
  "3b64db95cb55c763391c707108489ae18b4112d783300de38e033b4c98c3deaf";
const productionLaunchSha256 =
  "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f53";

test("provider write controlled expansion preflight verifier safe mode requires evidence", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write controlled expansion preflight evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write controlled expansion approval evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write controlled expansion preflight verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write controlled expansion preflight verification passed\./,
  );
  assert.match(result.stdout, /preflight=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write controlled expansion preflight verifier accepts sanitized launch-window evidence", async () => {
  await withPreflightFixture(async ({
    preflightFile,
    approvalFile,
    approvalAssemblyFile,
    approvalAssemblyDraftFile,
    approvalAssemblyReviewFile,
    approvalAssemblyLedgerFile,
  }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_FILE: preflightFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_FILE:
        approvalFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_FILE:
        approvalAssemblyFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE:
        approvalAssemblyDraftFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_REVIEW_FILE:
        approvalAssemblyReviewFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_LEDGER_FILE:
        approvalAssemblyLedgerFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_REQUIRE_PASS: "true",
    });

    assert.match(
      result.stdout,
      /Provider write controlled expansion preflight verification passed\./,
    );
    assert.match(result.stdout, /rollout=controlled_multi_merchant/);
    assert.match(result.stdout, /merchants=2/);
    assert.match(result.stdout, /preflight=verified/);
    assert.strictEqual(result.stderr, "");
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write controlled expansion preflight verifier rejects PR73 assembly source mismatches", async () => {
  await withPreflightFixture(
    async ({
      preflightFile,
      approvalFile,
      approvalAssemblyFile,
      approvalAssemblyDraftFile,
      approvalAssemblyReviewFile,
      approvalAssemblyLedgerFile,
    }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        `--approval=${approvalFile}`,
        `--approval-assembly=${approvalAssemblyFile}`,
        `--approval-assembly-draft=${approvalAssemblyDraftFile}`,
        `--approval-assembly-review=${approvalAssemblyReviewFile}`,
        `--approval-assembly-ledger=${approvalAssemblyLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /approval assembly\.artifactBindings\.providerWriteLivePilotRunLedgerSha256 must match the final ledger source file sha256/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approvalAssembly: {
        artifactBindings: {
          providerWriteLivePilotRunLedgerSha256:
            "300000000000000000000000000000000000000000000000000000000000abcd",
        },
      },
    },
  );
});

test("provider write controlled expansion preflight verifier rejects approval binding and scope mismatches", async () => {
  await withPreflightFixture(
    async ({ preflightFile, approvalFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        `--approval=${approvalFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /prerequisiteEvidence\.providerWriteControlledExpansionApprovalSha256 must match the approval file sha256/,
      );
      assert.match(
        failed.stderr,
        /expansionScope\.merchantFingerprints must stay inside the approved merchant scope/,
      );
      assert.match(
        failed.stderr,
        /expansionScope\.maxDailyProviderWrites must not exceed approval limit/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      preflight: {
        expansionScope: {
          merchantFingerprints: ["123456abcdef", "999999abcdef"],
          maxDailyProviderWrites: 60,
        },
        prerequisiteEvidence: {
          providerWriteControlledExpansionApprovalSha256:
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        },
      },
    },
  );
});

test("provider write controlled expansion preflight verifier rejects incomplete PR73 approval evidence", async () => {
  await withPreflightFixture(
    async ({ preflightFile, approvalFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        `--approval=${approvalFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /approval\.prerequisiteEvidence\.providerWriteSafeLedgerAssemblyVerifierPassed must be true/,
      );
      assert.match(
        failed.stderr,
        /approval\.prerequisiteEvidence\.providerWriteSafeLedgerAssemblySha256 must be a non-placeholder sha256 hash/,
      );
      assert.match(
        failed.stderr,
        /approval\.operationalControls\.operatorCoverageMinutes must be an integer between 120 and 1440/,
      );
      assert.match(
        failed.stderr,
        /approval\.operationalControls\.noAutomaticCustomerVisibleReplies must be true/,
      );
      assert.match(
        failed.stderr,
        /approval\.commercialReadiness\.billingPlanConfigured must be true/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approval: {
        prerequisiteEvidence: {
          providerWriteSafeLedgerAssemblyVerifierPassed: false,
          providerWriteSafeLedgerAssemblySha256: "deadbeef".repeat(8),
        },
        operationalControls: {
          operatorCoverageMinutes: 30,
          noAutomaticCustomerVisibleReplies: false,
        },
        commercialReadiness: {
          billingPlanConfigured: false,
        },
      },
    },
  );
});

test("provider write controlled expansion preflight verifier rejects unsafe window, rollout plan, and limits", async () => {
  await withPreflightFixture(
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
        /expansionScope\.allowedActions contains unsupported value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      preflight: {
        expansionScope: {
          allowedActions: ["modify_address", "refund"],
        },
        launchWindow: {
          durationMinutes: 300,
          freezeWindowActive: false,
        },
        rolloutPlan: {
          automaticNextWaveEnabled: true,
          rollbackOnAnyFailedMutation: false,
        },
      },
    },
  );
});

test("provider write controlled expansion preflight verifier rejects weak operations and sensitive evidence", async () => {
  await withPreflightFixture(
    async ({ preflightFile, approvalFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        `--approval=${approvalFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /operationalControls\.operatorCoverageMinutes must be an integer between 180 and 1440/,
      );
      assert.match(failed.stderr, /operationalControls owners must be distinct/);
      assert.match(
        failed.stderr,
        /operationalControls\.supportEscalationReady must be true/,
      );
      assert.match(failed.stderr, /safety\.secretsInEvidence must be false/);
      assert.match(
        failed.stderr,
        /provider write controlled expansion preflight contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write controlled expansion preflight field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write controlled expansion preflight value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      preflight: {
        merchantId: "tenant_1",
        providerPayload: {
          orderId: "order_123",
        },
        operationalControls: {
          operatorCoverageMinutes: 60,
          incidentOwnerFingerprint: "444444abcdef",
          rollbackOwnerFingerprint: "444444abcdef",
          killSwitchOwnerFingerprint: "444444abcdef",
          billingOwnerFingerprint: "444444abcdef",
          supportEscalationReady: false,
        },
        safety: {
          secretsInEvidence: true,
        },
        notes: "actual_provider_token_must_not_leak",
      },
    },
  );
});

test("provider write controlled expansion preflight verifier rejects unsafe paths and redacts arguments", async () => {
  const outside = await execVerifierFailure(["--preflight=task_plan.md"]);
  assert.match(
    outside.stderr,
    /--preflight must be inside provider-write-controlled-expansion-preflight-artifacts/,
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

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-controlled-expansion-preflight.mjs",
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
    assert.fail(`Expected controlled expansion preflight verification to fail, got stdout: ${result.stdout}`);
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

async function withPreflightFixture(callback, overrides = {}) {
  await mkdir(preflightArtifactRoot, { recursive: true });
  await mkdir(approvalArtifactRoot, { recursive: true });
  await mkdir(approvalAssemblyArtifactRoot, { recursive: true });
  await mkdir(approvalAssemblyDraftArtifactRoot, { recursive: true });
  await mkdir(approvalAssemblyReviewArtifactRoot, { recursive: true });
  await mkdir(approvalAssemblyLedgerArtifactRoot, { recursive: true });
  const preflightDir = await mkdtemp(join(preflightArtifactRoot, "test-"));
  const approvalDir = await mkdtemp(join(approvalArtifactRoot, "test-"));
  const approvalAssemblyDir = await mkdtemp(join(approvalAssemblyArtifactRoot, "test-"));
  const approvalAssemblyDraftDir = await mkdtemp(join(approvalAssemblyDraftArtifactRoot, "test-"));
  const approvalAssemblyReviewDir = await mkdtemp(join(approvalAssemblyReviewArtifactRoot, "test-"));
  const approvalAssemblyLedgerDir = await mkdtemp(join(approvalAssemblyLedgerArtifactRoot, "test-"));
  const preflightFile = join(preflightDir, "controlled-expansion-preflight.json");
  const approvalFile = join(approvalDir, "controlled-expansion-approval.json");
  const approvalAssemblyFile = join(approvalAssemblyDir, "safe-ledger-assembly.json");
  const approvalAssemblyDraftFile = join(
    approvalAssemblyDraftDir,
    "live-pilot-run-ledger-draft.json",
  );
  const approvalAssemblyReviewFile = join(
    approvalAssemblyReviewDir,
    "manual-closeout-review.json",
  );
  const approvalAssemblyLedgerFile = join(
    approvalAssemblyLedgerDir,
    "live-pilot-run-ledger.json",
  );

  try {
    await writeJson(
      approvalAssemblyDraftFile,
      deepMerge(validDraftSource(), overrides.approvalAssemblyDraft ?? {}),
    );
    const draftSha256 = await sha256File(approvalAssemblyDraftFile);
    await writeJson(
      approvalAssemblyReviewFile,
      deepMerge(
        validReviewSource({
          providerWriteLivePilotRunLedgerDraftSha256: draftSha256,
        }),
        overrides.approvalAssemblyReview ?? {},
      ),
    );
    const reviewSha256 = await sha256File(approvalAssemblyReviewFile);
    await writeJson(
      approvalAssemblyLedgerFile,
      deepMerge(
        validLedgerSource({
          providerWriteManualCloseoutReviewSha256: reviewSha256,
        }),
        overrides.approvalAssemblyLedger ?? {},
      ),
    );
    const ledgerSha256 = await sha256File(approvalAssemblyLedgerFile);
    await writeJson(
      approvalAssemblyFile,
      deepMerge(
        validAssemblyReceipt({
          providerWriteLivePilotRunLedgerDraftSha256: draftSha256,
          providerWriteManualCloseoutReviewSha256: reviewSha256,
          providerWriteLivePilotRunLedgerSha256: ledgerSha256,
        }),
        overrides.approvalAssembly ?? {},
      ),
    );
    const assemblySha256 = await sha256File(approvalAssemblyFile);
    await writeJson(
      approvalFile,
      deepMerge(
        validApproval({
          providerWriteSafeLedgerAssemblySha256: assemblySha256,
        }),
        overrides.approval ?? {},
      ),
    );
    const approvalSha256 = await sha256File(approvalFile);
    await writeJson(
      preflightFile,
      deepMerge(
        validPreflight({
          providerWriteControlledExpansionApprovalSha256: approvalSha256,
        }),
        overrides.preflight ?? {},
      ),
    );

    await callback({
      preflightFile: relative(process.cwd(), preflightFile),
      approvalFile: relative(process.cwd(), approvalFile),
      approvalAssemblyFile: relative(process.cwd(), approvalAssemblyFile),
      approvalAssemblyDraftFile: relative(process.cwd(), approvalAssemblyDraftFile),
      approvalAssemblyReviewFile: relative(process.cwd(), approvalAssemblyReviewFile),
      approvalAssemblyLedgerFile: relative(process.cwd(), approvalAssemblyLedgerFile),
    });
  } finally {
    await rm(preflightDir, { recursive: true, force: true });
    await rm(approvalDir, { recursive: true, force: true });
    await rm(approvalAssemblyDir, { recursive: true, force: true });
    await rm(approvalAssemblyDraftDir, { recursive: true, force: true });
    await rm(approvalAssemblyReviewDir, { recursive: true, force: true });
    await rm(approvalAssemblyLedgerDir, { recursive: true, force: true });
  }
}

function validAssemblyReceipt({
  providerWriteLivePilotRunLedgerDraftSha256,
  providerWriteManualCloseoutReviewSha256,
  providerWriteLivePilotRunLedgerSha256,
}) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-safe-ledger-assembly.v1",
    generatedAt: "2026-06-08T12:30:00.000Z",
    verificationPassed: true,
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicketFingerprint: "a1b2c3d4e5f6",
    },
    artifactBindings: {
      providerWriteLivePilotRunLedgerDraftSha256,
      providerWriteManualCloseoutReviewSha256,
      providerWriteLivePilotRunLedgerSha256,
    },
    safety: {
      secretsInEvidence: false,
      rawTenantIdsInEvidence: false,
      customerDataInEvidence: false,
      providerPayloadsInEvidence: false,
      providerResponsesInEvidence: false,
      networkExecutedByVerifier: false,
      providerWriteExecutedByVerifier: false,
      payloadEscrowOpenedByVerifier: false,
      credentialsReadByVerifier: false,
      customerVisibleActionsSentByVerifier: false,
    },
  };
}

function validDraftSource() {
  return {
    schemaVersion: "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1",
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicketFingerprint: "a1b2c3d4e5f6",
    },
    summary: {
      readyForSafeLedger: false,
    },
    evidenceReadiness: {
      draftOnly: true,
      canPassPr69SafeLedger: false,
    },
    safety: {
      secretsInDraft: false,
      rawTenantIdsInDraft: false,
      customerDataInDraft: false,
      providerPayloadsInDraft: false,
      providerResponsesInDraft: false,
      rawIdempotencyKeysInDraft: false,
      networkExecutedByExporter: false,
      providerWriteExecutedByExporter: false,
      payloadEscrowOpenedByExporter: false,
      credentialsReadByExporter: false,
      customerVisibleActionsSentByExporter: false,
    },
  };
}

function validReviewSource({ providerWriteLivePilotRunLedgerDraftSha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-manual-closeout-review.v1",
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicket,
    },
    closeout: {
      decision: "approved_for_safe_ledger",
    },
    artifactBindings: {
      providerWriteLivePilotRunLedgerDraftSha256,
      auditExportSha256,
      productionLaunchSha256,
    },
    safety: {
      secretsInReview: false,
      rawTenantIdsInReview: false,
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

function validLedgerSource({ providerWriteManualCloseoutReviewSha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicket,
    },
    summary: {
      noAutoCustomerReplies: true,
    },
    evidence: {
      providerWriteManualCloseoutReviewVerifierPassed: true,
    },
    artifactBindings: {
      providerWriteManualCloseoutReviewSha256,
      auditExportSha256,
      productionLaunchSha256,
    },
    safety: {
      secretsInLedger: false,
      rawTenantIdsInLedger: false,
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

function validApproval({ providerWriteSafeLedgerAssemblySha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-controlled-expansion-approval.v1",
    generatedAt: "2026-06-08T13:00:00.000Z",
    target: {
      rolloutIdFingerprint: "6a805e005e94",
      fromRolloutTrack: "single_merchant_pilot",
      toRolloutTrack: "controlled_multi_merchant",
      changeTicket,
    },
    expansionScope: {
      merchantFingerprints: ["123456abcdef", "abcdef123456"],
      channels: ["taobao"],
      allowedActions: ["modify_address", "issue_coupon", "urge_logistics"],
      maxMerchants: 5,
      maxDailyProviderWrites: 20,
      maxDailyProviderWritesPerMerchant: 5,
      maxCouponAmountCents: 3000,
      businessHoursOnly: true,
    },
    approval: {
      approvalStatus: "approved",
      requestedByFingerprint: "111111abcdef",
      approvedByFingerprint: "222222abcdef",
      secondReviewerFingerprint: "333333abcdef",
      approvedAt: "2026-06-08T13:15:00.000Z",
    },
    prerequisiteEvidence: {
      providerWriteSafeLedgerAssemblyVerifierPassed: true,
      providerWriteSafeLedgerAssemblySha256,
      productionLaunchVerifierPassed: true,
      productionStaticCiVerifierPassed: true,
      productionBranchProtectionVerifierPassed: true,
      productionAlertingVerifierPassed: true,
      productionCanaryVerifierPassed: true,
    },
    operationalControls: {
      operatorCoverageMinutes: 240,
      namedOpsLeadFingerprint: "444444abcdef",
      incidentOwnerFingerprint: "555555abcdef",
      rollbackOwnerFingerprint: "666666abcdef",
      killSwitchOwnerFingerprint: "777777abcdef",
      rollbackPlaybookReviewed: true,
      alertRoutesReviewed: true,
      rateLimitReviewed: true,
      noAutomaticCustomerVisibleReplies: true,
    },
    commercialReadiness: {
      customerContractReviewed: true,
      billingPlanConfigured: true,
      supportSlaReviewed: true,
      merchantNotificationPlanReviewed: true,
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

function validPreflight({ providerWriteControlledExpansionApprovalSha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-controlled-expansion-preflight.v1",
    generatedAt: "2026-06-08T14:00:00.000Z",
    target: {
      rolloutIdFingerprint: "6a805e005e94",
      rolloutTrack: "controlled_multi_merchant",
      changeTicket,
    },
    expansionScope: {
      merchantFingerprints: ["123456abcdef", "abcdef123456"],
      channels: ["taobao"],
      allowedActions: ["modify_address", "issue_coupon"],
      maxMerchants: 2,
      maxDailyProviderWrites: 10,
      maxDailyProviderWritesPerMerchant: 5,
      maxCouponAmountCents: 3000,
      businessHoursOnly: true,
    },
    launchWindow: {
      startsAt: "2026-06-08T15:00:00.000Z",
      endsAt: "2026-06-08T16:00:00.000Z",
      durationMinutes: 60,
      freezeWindowActive: true,
      businessHoursOnly: true,
    },
    prerequisiteEvidence: {
      providerWriteControlledExpansionApprovalVerifierPassed: true,
      providerWriteControlledExpansionApprovalSha256,
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
      maxMerchantsPerWave: 2,
      holdMinutesBetweenWaves: 60,
      automaticNextWaveEnabled: false,
      rollbackOnAnyFailedMutation: true,
      stopOnCustomerComplaint: true,
    },
    operationalControls: {
      operatorCoverageMinutes: 240,
      namedOpsLeadFingerprint: "444444abcdef",
      incidentOwnerFingerprint: "555555abcdef",
      rollbackOwnerFingerprint: "666666abcdef",
      killSwitchOwnerFingerprint: "777777abcdef",
      billingOwnerFingerprint: "888888abcdef",
      merchantNotificationPlanReady: true,
      supportEscalationReady: true,
      rollbackPlaybookReviewed: true,
      alertRoutesReviewed: true,
      rateLimitReviewed: true,
      noAutomaticCustomerVisibleReplies: true,
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
