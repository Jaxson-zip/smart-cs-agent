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
  "provider-write-controlled-expansion-run-ledger-artifacts",
);
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
const changeTicket = "chg-20260608-controlled-expansion-run-ledger";
const auditExportSha256 =
  "3b64db95cb55c763391c707108489ae18b4112d783300de38e033b4c98c3deaf";
const productionLaunchSha256 =
  "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f53";

test("provider write controlled expansion run ledger verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write controlled expansion run ledger verification passed\./,
  );
  assert.match(result.stdout, /run-ledger=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write controlled expansion run ledger verifier safe mode requires evidence chain", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write controlled expansion run ledger evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write controlled expansion preflight evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write controlled expansion preflight approval evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write controlled expansion run ledger verifier accepts sanitized post-window evidence", async () => {
  await withRunLedgerFixture(async ({
    runLedgerFile,
    preflightFile,
    approvalFile,
    approvalAssemblyFile,
    approvalAssemblyDraftFile,
    approvalAssemblyReviewFile,
    approvalAssemblyLedgerFile,
  }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_FILE: runLedgerFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_FILE:
        preflightFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE:
        approvalFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_FILE:
        approvalAssemblyFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE:
        approvalAssemblyDraftFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_REVIEW_FILE:
        approvalAssemblyReviewFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_LEDGER_FILE:
        approvalAssemblyLedgerFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_REQUIRE_PASS: "true",
    });

    assert.match(
      result.stdout,
      /Provider write controlled expansion run ledger verification passed\./,
    );
    assert.match(result.stdout, /rollout=controlled_multi_merchant/);
    assert.match(result.stdout, /merchants=2/);
    assert.match(result.stdout, /run-ledger=verified/);
    assert.strictEqual(result.stderr, "");
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write controlled expansion run ledger verifier rejects forged preflight bindings", async () => {
  await withRunLedgerFixture(
    async ({
      runLedgerFile,
      preflightFile,
      approvalFile,
      approvalAssemblyFile,
      approvalAssemblyDraftFile,
      approvalAssemblyReviewFile,
      approvalAssemblyLedgerFile,
    }) => {
      const failed = await execVerifierFailure([
        `--run-ledger=${runLedgerFile}`,
        `--preflight=${preflightFile}`,
        `--preflight-approval=${approvalFile}`,
        `--preflight-approval-assembly=${approvalAssemblyFile}`,
        `--preflight-approval-assembly-draft=${approvalAssemblyDraftFile}`,
        `--preflight-approval-assembly-review=${approvalAssemblyReviewFile}`,
        `--preflight-approval-assembly-ledger=${approvalAssemblyLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /evidence\.providerWriteControlledExpansionPreflightSha256 must match the preflight file sha256/,
      );
      assert.match(
        failed.stderr,
        /preflight\.prerequisiteEvidence\.providerWriteControlledExpansionApprovalSha256 must match the approval file sha256/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      runLedger: {
        evidence: {
          providerWriteControlledExpansionPreflightSha256:
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        },
      },
      preflight: {
        prerequisiteEvidence: {
          providerWriteControlledExpansionApprovalSha256:
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        },
      },
    },
  );
});

test("provider write controlled expansion run ledger verifier rejects scope and window drift", async () => {
  await withRunLedgerFixture(
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
            channel: "douyin",
            createdAt: "2026-06-08T16:05:00.000Z",
            completedAt: "2026-06-08T16:06:00.000Z",
          }),
        ],
      },
    },
  );
});

test("provider write controlled expansion run ledger verifier rejects weak closeout controls", async () => {
  await withRunLedgerFixture(
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
        /summary\.rollbackActionsVerified must be true when failed provider mutations exist/,
      );
      assert.match(
        failed.stderr,
        /runRecords\[0\]\.status cannot remain failed after providerMutationExecuted=true/,
      );
      assert.match(failed.stderr, /summary\.noAutoCustomerReplies must be true/);
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
          customerRejectedCompensationCount: 0,
          rollbackActionsVerified: false,
          customerComplaintsStoppedRollout: false,
          noAutoCustomerReplies: false,
        },
        runRecords: [
          safeRun({
            status: "failed",
            providerMutationExecuted: true,
            complaintRaised: true,
          }),
        ],
      },
    },
  );
});

test("provider write controlled expansion run ledger verifier rejects unsafe records and sensitive evidence", async () => {
  await withRunLedgerFixture(
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
        /provider write controlled expansion run ledger contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write controlled expansion run ledger field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write controlled expansion run ledger value/,
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

test("provider write controlled expansion run ledger verifier rejects unsafe paths and redacts arguments", async () => {
  const outside = await execVerifierFailure(["--run-ledger=task_plan.md"]);
  assert.match(
    outside.stderr,
    /--run-ledger must be inside provider-write-controlled-expansion-run-ledger-artifacts/,
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

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-controlled-expansion-run-ledger.mjs",
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
    assert.fail(`Expected controlled expansion run ledger verification to fail, got stdout: ${result.stdout}`);
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

async function withRunLedgerFixture(callback, overrides = {}) {
  await mkdir(runLedgerArtifactRoot, { recursive: true });
  await mkdir(preflightArtifactRoot, { recursive: true });
  await mkdir(approvalArtifactRoot, { recursive: true });
  await mkdir(approvalAssemblyArtifactRoot, { recursive: true });
  await mkdir(approvalAssemblyDraftArtifactRoot, { recursive: true });
  await mkdir(approvalAssemblyReviewArtifactRoot, { recursive: true });
  await mkdir(approvalAssemblyLedgerArtifactRoot, { recursive: true });
  const runLedgerDir = await mkdtemp(join(runLedgerArtifactRoot, "test-"));
  const preflightDir = await mkdtemp(join(preflightArtifactRoot, "test-"));
  const approvalDir = await mkdtemp(join(approvalArtifactRoot, "test-"));
  const approvalAssemblyDir = await mkdtemp(join(approvalAssemblyArtifactRoot, "test-"));
  const approvalAssemblyDraftDir = await mkdtemp(join(approvalAssemblyDraftArtifactRoot, "test-"));
  const approvalAssemblyReviewDir = await mkdtemp(join(approvalAssemblyReviewArtifactRoot, "test-"));
  const approvalAssemblyLedgerDir = await mkdtemp(join(approvalAssemblyLedgerArtifactRoot, "test-"));
  const runLedgerFile = join(runLedgerDir, "controlled-expansion-run-ledger.json");
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
    const preflightSha256 = await sha256File(preflightFile);
    await writeJson(
      runLedgerFile,
      deepMerge(
        validRunLedger({
          providerWriteControlledExpansionPreflightSha256: preflightSha256,
        }),
        overrides.runLedger ?? {},
      ),
    );

    await callback({
      runLedgerFile: relative(process.cwd(), runLedgerFile),
      preflightFile: relative(process.cwd(), preflightFile),
      approvalFile: relative(process.cwd(), approvalFile),
      approvalAssemblyFile: relative(process.cwd(), approvalAssemblyFile),
      approvalAssemblyDraftFile: relative(process.cwd(), approvalAssemblyDraftFile),
      approvalAssemblyReviewFile: relative(process.cwd(), approvalAssemblyReviewFile),
      approvalAssemblyLedgerFile: relative(process.cwd(), approvalAssemblyLedgerFile),
    });
  } finally {
    await rm(runLedgerDir, { recursive: true, force: true });
    await rm(preflightDir, { recursive: true, force: true });
    await rm(approvalDir, { recursive: true, force: true });
    await rm(approvalAssemblyDir, { recursive: true, force: true });
    await rm(approvalAssemblyDraftDir, { recursive: true, force: true });
    await rm(approvalAssemblyReviewDir, { recursive: true, force: true });
    await rm(approvalAssemblyLedgerDir, { recursive: true, force: true });
  }
}

function validRunLedger({ providerWriteControlledExpansionPreflightSha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1",
    generatedAt: "2026-06-08T17:00:00.000Z",
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
      closedAt: "2026-06-08T16:20:00.000Z",
      durationMinutes: 60,
      freezeWindowActive: true,
      businessHoursOnly: true,
    },
    summary: {
      totalRuns: 3,
      succeededRuns: 1,
      failedRuns: 1,
      rolledBackRuns: 1,
      blockedRuns: 0,
      complaintCount: 0,
      customerRejectedCompensationCount: 0,
      allRunsReviewed: true,
      failedRunsHaveIncidentNotes: true,
      rollbackActionsVerified: true,
      customerComplaintsStoppedRollout: true,
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
        status: "failed",
        action: "issue_coupon",
        providerMutationExecuted: false,
        networkExecution: "provider_api_called",
        runFingerprint:
          "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      }),
      safeRun({
        status: "rolled_back",
        action: "issue_coupon",
        runFingerprint:
          "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      }),
    ],
    evidence: {
      providerWriteControlledExpansionPreflightVerifierPassed: true,
      providerWriteControlledExpansionPreflightSha256,
      productionLaunchVerifierPassed: true,
      productionStaticCiVerifierPassed: true,
      productionAlertingVerifierPassed: true,
      productionCanaryVerifierPassed: true,
      providerWriteKillSwitchControlPlaneVerifierPassed: true,
      providerWriteLiveExecutorControlPlaneVerifierPassed: true,
      providerWriteExecutionAttemptVisibilityVerifierPassed: true,
      auditExportVerified: true,
      postExpansionReviewCompleted: true,
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
    createdAt: "2026-06-08T15:15:00.000Z",
    completedAt: "2026-06-08T15:16:00.000Z",
    ...overrides,
  };
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
