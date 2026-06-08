import assert from "node:assert";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
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
const changeTicket = "chg-20260608-live-pilot-closeout";
const auditExportSha256 =
  "3b64db95cb55c763391c707108489ae18b4112d783300de38e033b4c98c3deaf";
const productionLaunchSha256 =
  "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f53";

test("provider write safe ledger assembly verifier safe mode requires all evidence files", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write safe ledger assembly draft evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write safe ledger assembly manual closeout review evidence is required/,
  );
  assert.match(
    failed.stderr,
    /provider write safe ledger assembly final ledger evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write safe ledger assembly verifier accepts matching sanitized evidence", async () => {
  await withAssemblyFixture(async ({ draftFile, reviewFile, ledgerFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_DRAFT_FILE: draftFile,
      SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REVIEW_FILE: reviewFile,
      SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_LEDGER_FILE: ledgerFile,
      SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REQUIRE_PASS: "true",
    });

    assert.match(
      result.stdout,
      /Provider write safe ledger assembly verification passed\./,
    );
    assert.match(result.stdout, /channel=taobao/);
    assert.match(result.stdout, /runs=1/);
    assert.match(result.stdout, /assembly=verified/);
    assert.strictEqual(result.stderr, "");
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write safe ledger assembly verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write safe ledger assembly verification passed\./,
  );
  assert.match(result.stdout, /assembly=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write safe ledger assembly verifier rejects broken artifact hash bindings", async () => {
  await withAssemblyFixture(
    async ({ draftFile, reviewFile, ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--draft=${draftFile}`,
        `--review=${reviewFile}`,
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /review\.artifactBindings\.providerWriteLivePilotRunLedgerDraftSha256 must match the draft file sha256/,
      );
      assert.match(
        failed.stderr,
        /ledger\.artifactBindings\.providerWriteManualCloseoutReviewSha256 must match the manual closeout review file sha256/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      review: {
        artifactBindings: {
          providerWriteLivePilotRunLedgerDraftSha256:
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        },
      },
      ledger: {
        artifactBindings: {
          providerWriteManualCloseoutReviewSha256:
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
        },
      },
    },
  );
});

test("provider write safe ledger assembly verifier rejects audit and production launch hash mismatches", async () => {
  await withAssemblyFixture(
    async ({ draftFile, reviewFile, ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--draft=${draftFile}`,
        `--review=${reviewFile}`,
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /review and ledger auditExportSha256 must match/);
      assert.match(failed.stderr, /review and ledger productionLaunchSha256 must match/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      ledger: {
        artifactBindings: {
          auditExportSha256:
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
          productionLaunchSha256:
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
        },
      },
    },
  );
});

test("provider write safe ledger assembly verifier rejects target and change ticket mismatches", async () => {
  await withAssemblyFixture(
    async ({ draftFile, reviewFile, ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--draft=${draftFile}`,
        `--review=${reviewFile}`,
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /target\.tenantFingerprint must match across draft, review, and ledger/,
      );
      assert.match(
        failed.stderr,
        /target\.channel must match across draft, review, and ledger/,
      );
      assert.match(
        failed.stderr,
        /review\.target\.changeTicket must match ledger\.target\.changeTicket/,
      );
      assert.match(
        failed.stderr,
        /draft\.target\.changeTicketFingerprint must match the review and ledger change ticket/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      draft: {
        target: {
          tenantFingerprint: "abcdef123456",
          changeTicketFingerprint: "abcdef123456",
        },
      },
      review: {
        target: {
          channel: "douyin",
          changeTicket: "chg-20260608-different-review-ticket",
        },
      },
    },
  );
});

test("provider write safe ledger assembly verifier rejects launch window mismatches", async () => {
  await withAssemblyFixture(
    async ({ draftFile, reviewFile, ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--draft=${draftFile}`,
        `--review=${reviewFile}`,
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /launchWindow\.startsAt must match across draft, review, and ledger/,
      );
      assert.match(
        failed.stderr,
        /launchWindow\.durationMinutes must match across draft, review, and ledger/,
      );
      assert.match(
        failed.stderr,
        /launchWindow\.freezeWindowActive must match across draft, review, and ledger/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      ledger: {
        launchWindow: {
          startsAt: "2026-06-08T09:00:00.000Z",
          durationMinutes: 120,
          freezeWindowActive: false,
        },
      },
    },
  );
});

test("provider write safe ledger assembly verifier rejects duplicate and unmatched run correlations", async () => {
  const duplicateDraftRun = {
    ...validDraft().runRecords[0],
    runFingerprint:
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  };
  const extraLedgerRun = {
    ...validLedger({
      providerWriteManualCloseoutReviewSha256:
        "4d967a0424625957d0374f7f946b484c3b1a81840edbb195a2bb5ef7e4ee781d",
    }).runRecords[0],
    runFingerprint:
      "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    requestFingerprint: "abcdef123456",
    executionAttemptFingerprint: "abcdef654321",
  };

  await withAssemblyFixture(
    async ({ draftFile, reviewFile, ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--draft=${draftFile}`,
        `--review=${reviewFile}`,
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /draft\.runRecords\[1\] duplicates request\/executionAttempt fingerprint pair/,
      );
      assert.match(
        failed.stderr,
        /draft\.runRecords must contain every ledger request\/executionAttempt fingerprint pair/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      draft: {
        summary: {
          totalRuns: 2,
          dryRunRecordedRuns: 2,
        },
        runRecords: [validDraft().runRecords[0], duplicateDraftRun],
      },
      ledger: {
        summary: {
          totalRuns: 2,
          succeededRuns: 2,
        },
        runRecords: [validLedger({
          providerWriteManualCloseoutReviewSha256:
            "4d967a0424625957d0374f7f946b484c3b1a81840edbb195a2bb5ef7e4ee781d",
        }).runRecords[0], extraLedgerRun],
      },
    },
  );
});

test("provider write safe ledger assembly verifier rejects pass-shaped draft evidence", async () => {
  await withAssemblyFixture(
    async ({ draftFile, reviewFile, ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--draft=${draftFile}`,
        `--review=${reviewFile}`,
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /draft\.summary\.readyForSafeLedger must be false/);
      assert.match(failed.stderr, /draft\.evidenceReadiness\.draftOnly must be true/);
      assert.match(
        failed.stderr,
        /draft\.evidenceReadiness\.canPassPr69SafeLedger must be false/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      draft: {
        summary: {
          readyForSafeLedger: true,
        },
        evidenceReadiness: {
          draftOnly: false,
          canPassPr69SafeLedger: true,
        },
      },
    },
  );
});

test("provider write safe ledger assembly verifier rejects unsafe safety flags and sensitive evidence", async () => {
  await withAssemblyFixture(
    async ({ draftFile, reviewFile, ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--draft=${draftFile}`,
        `--review=${reviewFile}`,
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /draft\.safety\.secretsInDraft must be false/);
      assert.match(failed.stderr, /ledger\.safety\.credentialsReadByVerifier must be false/);
      assert.match(failed.stderr, /manual closeout review contains unsupported field/);
      assert.match(failed.stderr, /forbidden sensitive manual closeout review field/);
      assert.match(failed.stderr, /forbidden sensitive manual closeout review value/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      draft: {
        safety: {
          secretsInDraft: true,
        },
      },
      review: {
        providerPayload: {
          orderId: "order_123",
        },
        closeout: {
          notes: "actual_provider_token_must_not_leak",
        },
      },
      ledger: {
        safety: {
          credentialsReadByVerifier: true,
        },
      },
    },
  );
});

test("provider write safe ledger assembly verifier rejects unsafe paths and redacts unknown arguments", async () => {
  const outside = await execVerifierFailure(["--draft=task_plan.md"]);
  assert.match(
    outside.stderr,
    /--draft must be inside provider-write-live-pilot-run-ledger-draft-artifacts/,
  );

  const unsafeUrl = await execVerifierFailure([
    "--review=https://user:secret@example.test/review.json",
  ]);
  assert.match(unsafeUrl.stderr, /--review must be a safe local path/);
  assertNoSecretMarkers(`${unsafeUrl.stdout}\n${unsafeUrl.stderr}`);
  assert.ok(!unsafeUrl.stderr.includes("user:secret"));

  const unknown = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
  ]);
  assert.match(unknown.stderr, /Unknown argument: --unknown=<redacted>/);
  assertNoSecretMarkers(`${unknown.stdout}\n${unknown.stderr}`);
});

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-safe-ledger-assembly.mjs",
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
    assert.fail(`Expected safe ledger assembly verification to fail, got stdout: ${result.stdout}`);
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

async function withAssemblyFixture(callback, overrides = {}) {
  await mkdir(draftArtifactRoot, { recursive: true });
  await mkdir(reviewArtifactRoot, { recursive: true });
  await mkdir(ledgerArtifactRoot, { recursive: true });

  const suffix = `test-${Date.now()}-${Math.random().toString(16).slice(2)}-`;
  const draftDir = await mkdtemp(join(draftArtifactRoot, suffix));
  const reviewDir = await mkdtemp(join(reviewArtifactRoot, suffix));
  const ledgerDir = await mkdtemp(join(ledgerArtifactRoot, suffix));
  const draftFile = join(draftDir, "live-pilot-run-ledger-draft.json");
  const reviewFile = join(reviewDir, "manual-closeout-review.json");
  const ledgerFile = join(ledgerDir, "live-pilot-run-ledger.json");

  try {
    await writeJson(draftFile, deepMerge(validDraft(), overrides.draft ?? {}));
    const draftSha256 = await sha256File(draftFile);

    await writeJson(
      reviewFile,
      deepMerge(
        validReview({
          providerWriteLivePilotRunLedgerDraftSha256: draftSha256,
        }),
        overrides.review ?? {},
      ),
    );
    const reviewSha256 = await sha256File(reviewFile);

    await writeJson(
      ledgerFile,
      deepMerge(
        validLedger({
          providerWriteManualCloseoutReviewSha256: reviewSha256,
        }),
        overrides.ledger ?? {},
      ),
    );

    await callback({
      draftFile: relative(process.cwd(), draftFile),
      reviewFile: relative(process.cwd(), reviewFile),
      ledgerFile: relative(process.cwd(), ledgerFile),
    });
  } finally {
    await rm(draftDir, { recursive: true, force: true });
    await rm(reviewDir, { recursive: true, force: true });
    await rm(ledgerDir, { recursive: true, force: true });
  }
}

function validDraft() {
  return {
    schemaVersion: "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1",
    generatedAt: "2026-06-08T10:55:00.000Z",
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicketFingerprint: shortHashFor(
        "provider_write_ledger_change_ticket",
        changeTicket,
      ),
    },
    launchWindow: {
      startsAt: "2026-06-08T10:00:00.000Z",
      endsAt: "2026-06-08T11:00:00.000Z",
      closedAt: "2026-06-08T11:15:00.000Z",
      durationMinutes: 60,
      freezeWindowActive: true,
    },
    summary: {
      totalRuns: 1,
      dryRunRecordedRuns: 1,
      blockedRuns: 0,
      failedRuns: 0,
      allRunsReviewed: true,
      failedRunsHaveIncidentNotes: true,
      rollbackActionsVerified: false,
      noAutoCustomerReplies: true,
      readyForSafeLedger: false,
      missingSafeLedgerInputs: [
        "artifact_bindings",
        "live_provider_mutation_evidence",
        "manual_closeout_review",
      ],
    },
    runRecords: [
      {
        runFingerprint:
          "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606c06d4be3cd35db7a1912cf6ec",
        requestFingerprint: "123456abcdef",
        executionAttemptFingerprint: "234567abcdef",
        operatorFingerprint: "345678abcdef",
        reviewerFingerprint: "456789abcdef",
        rollbackOwnerFingerprint: null,
        action: "modify_address",
        riskLevel: "low",
        status: "dry_run_recorded",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        payloadEscrowOpened: false,
        providerPayloadStored: false,
        providerResponseStored: false,
        policyReason: null,
        createdAt: "2026-06-08T10:15:00.000Z",
        completedAt: "2026-06-08T10:16:00.000Z",
      },
    ],
    evidenceReadiness: {
      draftOnly: true,
      requiresArtifactBindings: true,
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

function validReview({ providerWriteLivePilotRunLedgerDraftSha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-manual-closeout-review.v1",
    generatedAt: "2026-06-08T12:00:00.000Z",
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicket,
    },
    launchWindow: {
      startsAt: "2026-06-08T10:00:00.000Z",
      endsAt: "2026-06-08T11:00:00.000Z",
      closedAt: "2026-06-08T11:15:00.000Z",
      durationMinutes: 60,
      freezeWindowActive: true,
    },
    runSummary: {
      totalRuns: 1,
      succeededRuns: 1,
      failedRuns: 0,
      rolledBackRuns: 0,
      blockedRuns: 0,
      failedProviderMutationRuns: 0,
      allRunsReviewed: true,
      failedRunsHaveIncidentNotes: true,
      rollbackActionsVerified: true,
      noAutoCustomerReplies: true,
    },
    reviewers: {
      releaseOwnerFingerprint: "abcdef123456",
      operationsReviewerFingerprint: "123456abcdef",
      rollbackOwnerFingerprint: "fedcba654321",
      reviewedAt: "2026-06-08T11:30:00.000Z",
      secondReviewCompleted: true,
    },
    closeout: {
      decision: "approved_for_safe_ledger",
      customerImpactReviewed: true,
      providerMutationReviewCompleted: true,
      incidentReviewCompleted: true,
      rollbackReviewCompleted: true,
      evidencePackageReviewed: true,
      outstandingActions: [],
    },
    evidence: {
      ledgerDraftExportReviewed: true,
      auditExportReviewed: true,
      providerWriteLivePilotRunLedgerVerifierReady: true,
      productionLaunchVerifierPassed: true,
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

function validLedger({ providerWriteManualCloseoutReviewSha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
    generatedAt: "2026-06-08T12:05:00.000Z",
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicket,
    },
    launchWindow: {
      startsAt: "2026-06-08T10:00:00.000Z",
      endsAt: "2026-06-08T11:00:00.000Z",
      closedAt: "2026-06-08T11:15:00.000Z",
      durationMinutes: 60,
      freezeWindowActive: true,
    },
    summary: {
      totalRuns: 1,
      succeededRuns: 1,
      failedRuns: 0,
      rolledBackRuns: 0,
      blockedRuns: 0,
      allRunsReviewed: true,
      failedRunsHaveIncidentNotes: true,
      rollbackActionsVerified: true,
      noAutoCustomerReplies: true,
    },
    runRecords: [
      {
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
        createdAt: "2026-06-08T10:15:00.000Z",
        completedAt: "2026-06-08T10:16:00.000Z",
      },
    ],
    evidence: {
      providerWriteLivePilotPreflightVerifierPassed: true,
      productionProviderWriteApprovalVerifierPassed: true,
      providerWriteKillSwitchControlPlaneVerifierPassed: true,
      providerWriteManualCloseoutReviewVerifierPassed: true,
      auditExportVerified: true,
      postPilotReviewCompleted: true,
      productionLaunchVerifierPassed: true,
    },
    artifactBindings: {
      providerWriteLivePilotPreflightSha256:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      productionProviderWriteApprovalSha256:
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      providerWriteKillSwitchControlPlaneSha256:
        "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      providerWriteLiveExecutorStartupGuardSha256:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      providerWriteLiveExecutorControlPlaneSha256:
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
      providerWriteManualCloseoutReviewSha256,
      productionLaunchSha256,
      auditExportSha256,
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

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function shortHashFor(kind, value) {
  return sha256Text(stableJson({ kind, value })).slice(0, 12);
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
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
