import assert from "node:assert";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const artifactRoot = join(
  process.cwd(),
  "provider-write-controlled-expansion-approval-artifacts",
);
const assemblyArtifactRoot = join(
  process.cwd(),
  "provider-write-safe-ledger-assembly-artifacts",
);
const draftArtifactRoot = join(
  process.cwd(),
  "provider-write-live-pilot-run-ledger-draft-artifacts",
);
const reviewArtifactRoot = join(
  process.cwd(),
  "provider-write-manual-closeout-review-artifacts",
);
const ledgerArtifactRoot = join(
  process.cwd(),
  "provider-write-live-pilot-run-ledger-artifacts",
);
const changeTicket = "chg-20260608-controlled-expansion";
const auditExportSha256 =
  "3b64db95cb55c763391c707108489ae18b4112d783300de38e033b4c98c3deaf";
const productionLaunchSha256 =
  "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f53";

test("provider write controlled expansion approval verifier safe mode requires evidence", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write controlled expansion approval evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write safe ledger assembly evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write safe ledger assembly draft source evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write safe ledger assembly manual closeout review source evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write safe ledger assembly final ledger source evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write controlled expansion approval verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write controlled expansion approval verification passed\./,
  );
  assert.match(result.stdout, /approval=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write controlled expansion approval verifier accepts sanitized expansion evidence", async () => {
  await withApprovalFixture(async ({
    approvalFile,
    assemblyFile,
    draftFile,
    reviewFile,
    ledgerFile,
  }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_FILE: approvalFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_FILE:
        assemblyFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_DRAFT_FILE:
        draftFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_REVIEW_FILE:
        reviewFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_LEDGER_FILE:
        ledgerFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_REQUIRE_PASS: "true",
    });

    assert.match(
      result.stdout,
      /Provider write controlled expansion approval verification passed\./,
    );
    assert.match(result.stdout, /rollout=controlled_multi_merchant/);
    assert.match(result.stdout, /merchants=2/);
    assert.match(result.stdout, /approval=verified/);
    assert.strictEqual(result.stderr, "");
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write controlled expansion approval verifier rejects safe ledger source artifact mismatches", async () => {
  await withApprovalFixture(
    async ({ approvalFile, assemblyFile, draftFile, reviewFile, ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        `--assembly=${assemblyFile}`,
        `--assembly-draft=${draftFile}`,
        `--assembly-review=${reviewFile}`,
        `--assembly-ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /assembly\.artifactBindings\.providerWriteLivePilotRunLedgerDraftSha256 must match the draft source file sha256/,
      );
      assert.match(
        failed.stderr,
        /assembly\.artifactBindings\.providerWriteManualCloseoutReviewSha256 must match the manual closeout review source file sha256/,
      );
      assert.match(
        failed.stderr,
        /assembly\.artifactBindings\.providerWriteLivePilotRunLedgerSha256 must match the final ledger source file sha256/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      assembly: {
        artifactBindings: {
          providerWriteLivePilotRunLedgerDraftSha256:
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
          providerWriteManualCloseoutReviewSha256:
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
          providerWriteLivePilotRunLedgerSha256:
            "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
        },
      },
    },
  );
});

test("provider write controlled expansion approval verifier rejects assembly hash mismatch and unsafe assembly evidence", async () => {
  await withApprovalFixture(
    async ({ approvalFile, assemblyFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        `--assembly=${assemblyFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /prerequisiteEvidence\.providerWriteSafeLedgerAssemblySha256 must match the safe ledger assembly file sha256/,
      );
      assert.match(failed.stderr, /assembly\.verificationPassed must be true/);
      assert.match(failed.stderr, /assembly\.safety\.providerWriteExecutedByVerifier must be false/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approval: {
        prerequisiteEvidence: {
          providerWriteSafeLedgerAssemblySha256:
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        },
      },
      assembly: {
        verificationPassed: false,
        safety: {
          providerWriteExecutedByVerifier: true,
        },
      },
    },
  );
});

test("provider write controlled expansion approval verifier rejects unsafe rollout scope, actions, and limits", async () => {
  await withApprovalFixture(
    async ({ approvalFile, assemblyFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        `--assembly=${assemblyFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /expansionScope\.merchantFingerprints must contain between 2 and 10 values/,
      );
      assert.match(failed.stderr, /expansionScope\.channels contains unsupported value/);
      assert.match(failed.stderr, /expansionScope\.allowedActions contains unsupported value/);
      assert.match(
        failed.stderr,
        /expansionScope\.maxDailyProviderWritesPerMerchant must be an integer between 1 and 20/,
      );
      assert.match(
        failed.stderr,
        /expansionScope\.maxDailyProviderWrites must be an integer between 1 and 100/,
      );
      assert.match(
        failed.stderr,
        /expansionScope\.maxCouponAmountCents must be an integer between 0 and 10000/,
      );
      assert.match(failed.stderr, /expansionScope\.businessHoursOnly must be true/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approval: {
        expansionScope: {
          merchantFingerprints: ["123456abcdef"],
          channels: ["taobao", "unknown"],
          allowedActions: ["modify_address", "refund"],
          maxDailyProviderWrites: 120,
          maxDailyProviderWritesPerMerchant: 30,
          maxCouponAmountCents: 20000,
          businessHoursOnly: false,
        },
      },
    },
  );
});

test("provider write controlled expansion approval verifier rejects weak approvals, operations, commercial readiness, and sensitive evidence", async () => {
  await withApprovalFixture(
    async ({ approvalFile, assemblyFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        `--assembly=${assemblyFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /approval\.approvalStatus must be approved/);
      assert.match(failed.stderr, /approval reviewers must be distinct and separate from requester/);
      assert.match(
        failed.stderr,
        /operationalControls\.operatorCoverageMinutes must be an integer between 120 and 1440/,
      );
      assert.match(failed.stderr, /operationalControls owners must be distinct/);
      assert.match(failed.stderr, /operationalControls\.rollbackPlaybookReviewed must be true/);
      assert.match(failed.stderr, /commercialReadiness\.billingPlanConfigured must be true/);
      assert.match(failed.stderr, /safety\.secretsInEvidence must be false/);
      assert.match(
        failed.stderr,
        /provider write controlled expansion approval contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write controlled expansion approval field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write controlled expansion approval value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approval: {
        merchantId: "tenant_1",
        providerPayload: {
          orderId: "order_123",
        },
        approval: {
          approvalStatus: "pending",
          approvedByFingerprint: "111111abcdef",
          secondReviewerFingerprint: "111111abcdef",
        },
        operationalControls: {
          operatorCoverageMinutes: 60,
          incidentOwnerFingerprint: "444444abcdef",
          rollbackOwnerFingerprint: "444444abcdef",
          killSwitchOwnerFingerprint: "444444abcdef",
          rollbackPlaybookReviewed: false,
        },
        commercialReadiness: {
          billingPlanConfigured: false,
        },
        safety: {
          secretsInEvidence: true,
        },
        notes: "actual_provider_token_must_not_leak",
      },
    },
  );
});

test("provider write controlled expansion approval verifier rejects unsafe change tickets and placeholder hashes", async () => {
  await withApprovalFixture(
    async ({ approvalFile, assemblyFile, draftFile, reviewFile, ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        `--assembly=${assemblyFile}`,
        `--assembly-draft=${draftFile}`,
        `--assembly-review=${reviewFile}`,
        `--assembly-ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /target\.changeTicket must be a safe change ticket id/,
      );
      assert.match(
        failed.stderr,
        /assembly\.artifactBindings\.providerWriteLivePilotRunLedgerDraftSha256 must be a non-placeholder sha256 hash/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approval: {
        target: {
          changeTicket: "https://launch.example.test/change/chg-20260608-controlled-expansion",
        },
      },
      assembly: {
        artifactBindings: {
          providerWriteLivePilotRunLedgerDraftSha256:
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
      },
    },
  );
});

test("provider write controlled expansion approval verifier rejects unsafe paths and redacts arguments", async () => {
  const outside = await execVerifierFailure(["--approval=task_plan.md"]);
  assert.match(
    outside.stderr,
    /--approval must be inside provider-write-controlled-expansion-approval-artifacts/,
  );

  const unsafeAssembly = await execVerifierFailure([
    "--assembly=https://user:secret@example.test/assembly.json",
  ]);
  assert.match(unsafeAssembly.stderr, /--assembly must be a safe local path/);
  assertNoSecretMarkers(`${unsafeAssembly.stdout}\n${unsafeAssembly.stderr}`);
  assert.ok(!unsafeAssembly.stderr.includes("user:secret"));

  const unknown = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
  ]);
  assert.match(unknown.stderr, /Unknown argument: --unknown=<redacted>/);
  assertNoSecretMarkers(`${unknown.stdout}\n${unknown.stderr}`);
});

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-controlled-expansion-approval.mjs",
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
    assert.fail(`Expected controlled expansion approval verification to fail, got stdout: ${result.stdout}`);
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

async function withApprovalFixture(callback, overrides = {}) {
  await mkdir(artifactRoot, { recursive: true });
  await mkdir(assemblyArtifactRoot, { recursive: true });
  await mkdir(draftArtifactRoot, { recursive: true });
  await mkdir(reviewArtifactRoot, { recursive: true });
  await mkdir(ledgerArtifactRoot, { recursive: true });
  const dir = await mkdtemp(join(artifactRoot, "test-"));
  const assemblyDir = await mkdtemp(join(assemblyArtifactRoot, "test-"));
  const draftDir = await mkdtemp(join(draftArtifactRoot, "test-"));
  const reviewDir = await mkdtemp(join(reviewArtifactRoot, "test-"));
  const ledgerDir = await mkdtemp(join(ledgerArtifactRoot, "test-"));
  const approvalFile = join(dir, "controlled-expansion-approval.json");
  const assemblyFile = join(assemblyDir, "safe-ledger-assembly.json");
  const draftFile = join(draftDir, "live-pilot-run-ledger-draft.json");
  const reviewFile = join(reviewDir, "manual-closeout-review.json");
  const ledgerFile = join(ledgerDir, "live-pilot-run-ledger.json");
  try {
    await writeJson(draftFile, deepMerge(validDraftSource(), overrides.draftSource ?? {}));
    const draftSha256 = await sha256File(draftFile);
    await writeJson(
      reviewFile,
      deepMerge(
        validReviewSource({ providerWriteLivePilotRunLedgerDraftSha256: draftSha256 }),
        overrides.reviewSource ?? {},
      ),
    );
    const reviewSha256 = await sha256File(reviewFile);
    await writeJson(
      ledgerFile,
      deepMerge(
        validLedgerSource({ providerWriteManualCloseoutReviewSha256: reviewSha256 }),
        overrides.ledgerSource ?? {},
      ),
    );
    const ledgerSha256 = await sha256File(ledgerFile);

    await writeFile(
      assemblyFile,
      `${JSON.stringify(
        deepMerge(
          validAssemblyReceipt({
            providerWriteLivePilotRunLedgerDraftSha256: draftSha256,
            providerWriteManualCloseoutReviewSha256: reviewSha256,
            providerWriteLivePilotRunLedgerSha256: ledgerSha256,
          }),
          overrides.assembly ?? {},
        ),
        null,
        2,
      )}\n`,
      "utf8",
    );
    const assemblySha256 = await sha256File(assemblyFile);
    await writeFile(
      approvalFile,
      `${JSON.stringify(
        deepMerge(
          validApproval({
            providerWriteSafeLedgerAssemblySha256: assemblySha256,
          }),
          overrides.approval ?? {},
        ),
        null,
        2,
      )}\n`,
      "utf8",
    );
    await callback({
      approvalFile: relative(process.cwd(), approvalFile),
      assemblyFile: relative(process.cwd(), assemblyFile),
      draftFile: relative(process.cwd(), draftFile),
      reviewFile: relative(process.cwd(), reviewFile),
      ledgerFile: relative(process.cwd(), ledgerFile),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(assemblyDir, { recursive: true, force: true });
    await rm(draftDir, { recursive: true, force: true });
    await rm(reviewDir, { recursive: true, force: true });
    await rm(ledgerDir, { recursive: true, force: true });
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
      changeTicket: "chg-20260608-controlled-expansion",
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

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
