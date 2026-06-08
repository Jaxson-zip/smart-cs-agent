import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const artifactRoot = join(
  process.cwd(),
  "provider-write-manual-closeout-review-artifacts",
);

test("provider write manual closeout review verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write manual closeout review verification passed\./,
  );
  assert.match(result.stdout, /review=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write manual closeout review verifier accepts sanitized safe evidence", async () => {
  await withReviewFixture(async ({ reviewFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_FILE: reviewFile,
      SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_REQUIRE_PASS: "true",
    });

    assert.match(
      result.stdout,
      /Provider write manual closeout review verification passed\./,
    );
    assert.match(result.stdout, /channel=taobao/);
    assert.match(result.stdout, /review=verified/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write manual closeout review verifier safe mode requires evidence", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write manual closeout review evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write manual closeout review verifier rejects malformed JSON without echoing contents", async () => {
  await withRawReviewFixture(
    "{ actual_provider_token_must_not_leak",
    async ({ reviewFile }) => {
      const failed = await execVerifierFailure([
        `--review=${reviewFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /file must be valid JSON/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
  );
});

test("provider write manual closeout review verifier rejects weak closeout controls", async () => {
  await withReviewFixture(
    async ({ reviewFile }) => {
      const failed = await execVerifierFailure([
        `--review=${reviewFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /reviewers must be distinct/);
      assert.match(failed.stderr, /reviewers\.secondReviewCompleted must be true/);
      assert.match(failed.stderr, /closeout\.decision must be approved_for_safe_ledger/);
      assert.match(failed.stderr, /closeout\.customerImpactReviewed must be true/);
      assert.match(failed.stderr, /closeout\.providerMutationReviewCompleted must be true/);
      assert.match(failed.stderr, /closeout\.incidentReviewCompleted must be true/);
      assert.match(failed.stderr, /closeout\.rollbackReviewCompleted must be true/);
      assert.match(failed.stderr, /closeout\.evidencePackageReviewed must be true/);
      assert.match(failed.stderr, /closeout\.outstandingActions must be empty/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      reviewers: {
        releaseOwnerFingerprint: "abcdef123456",
        operationsReviewerFingerprint: "abcdef123456",
        rollbackOwnerFingerprint: "abcdef123456",
        secondReviewCompleted: false,
      },
      closeout: {
        decision: "rejected_needs_investigation",
        customerImpactReviewed: false,
        providerMutationReviewCompleted: false,
        incidentReviewCompleted: false,
        rollbackReviewCompleted: false,
        evidencePackageReviewed: false,
        outstandingActions: ["follow_up_required"],
      },
    },
  );
});

test("provider write manual closeout review verifier rejects inconsistent run summary and rollback gaps", async () => {
  await withReviewFixture(
    async ({ reviewFile }) => {
      const failed = await execVerifierFailure([
        `--review=${reviewFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /runSummary\.totalRuns must equal status counts/);
      assert.match(failed.stderr, /runSummary\.allRunsReviewed must be true/);
      assert.match(failed.stderr, /runSummary\.failedRunsHaveIncidentNotes must be true/);
      assert.match(failed.stderr, /runSummary\.rollbackActionsVerified must be true/);
      assert.match(failed.stderr, /runSummary\.noAutoCustomerReplies must be true/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      runSummary: {
        totalRuns: 1,
        succeededRuns: 1,
        failedRuns: 1,
        rolledBackRuns: 1,
        blockedRuns: 0,
        failedProviderMutationRuns: 1,
        allRunsReviewed: false,
        failedRunsHaveIncidentNotes: false,
        rollbackActionsVerified: false,
        noAutoCustomerReplies: false,
      },
    },
  );
});

test("provider write manual closeout review verifier rejects unsafe safety flags", async () => {
  await withReviewFixture(
    async ({ reviewFile }) => {
      const failed = await execVerifierFailure([
        `--review=${reviewFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /safety\.secretsInReview must be false/);
      assert.match(failed.stderr, /safety\.networkExecutedByVerifier must be false/);
      assert.match(failed.stderr, /safety\.providerWriteExecutedByVerifier must be false/);
      assert.match(failed.stderr, /safety\.customerVisibleActionsSentByVerifier must be false/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      safety: {
        secretsInReview: true,
        networkExecutedByVerifier: true,
        providerWriteExecutedByVerifier: true,
        customerVisibleActionsSentByVerifier: true,
      },
    },
  );
});

test("provider write manual closeout review verifier rejects sensitive fields and values", async () => {
  await withReviewFixture(
    async ({ reviewFile }) => {
      const failed = await execVerifierFailure([`--review=${reviewFile}`]);

      assert.match(
        failed.stderr,
        /provider write manual closeout review contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write manual closeout review field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write manual closeout review value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      tenantId: "tenant_1",
      providerPayload: { orderId: "order_123" },
      closeout: {
        notes: "actual_provider_token_must_not_leak",
      },
    },
  );
});

test("provider write manual closeout review verifier rejects paths outside artifact directory and redacts unknown args", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-closeout-review-"));
  const reviewFile = join(process.cwd(), "task_plan.md");
  try {
    const outside = await execVerifierFailure([`--review=${reviewFile}`]);
    assert.match(
      outside.stderr,
      /--review must be inside provider-write-manual-closeout-review-artifacts/,
    );

    const redacted = await execVerifierFailure([
      "--unknown=actual_provider_token_must_not_leak",
    ]);
    assert.match(redacted.stderr, /Unknown argument: --unknown=<redacted>/);
    assertNoSecretMarkers(`${redacted.stdout}\n${redacted.stderr}`);

    const positional = await execVerifierFailure([
      "actual_provider_token_must_not_leak",
    ]);
    assert.match(positional.stderr, /Unknown argument: <redacted>/);
    assertNoSecretMarkers(`${positional.stdout}\n${positional.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function withRawReviewFixture(content, callback) {
  await mkdir(artifactRoot, { recursive: true });
  const dir = await mkdtemp(join(artifactRoot, "test-"));
  const reviewFile = join(dir, "manual-closeout-review.json");
  const reviewPath = relative(process.cwd(), reviewFile);
  try {
    await writeFile(reviewFile, content, "utf8");
    await callback({ reviewFile: reviewPath });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withReviewFixture(callback, overrides = {}) {
  await mkdir(artifactRoot, { recursive: true });
  const dir = await mkdtemp(join(artifactRoot, "test-"));
  const reviewFile = join(dir, "manual-closeout-review.json");
  const reviewPath = relative(process.cwd(), reviewFile);
  try {
    await writeFile(
      reviewFile,
      JSON.stringify(deepMerge(validReview(), overrides), null, 2),
      "utf8",
    );
    await callback({ dir, reviewFile: reviewPath });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validReview() {
  return {
    schemaVersion: "smart-cs-agent.provider-write-manual-closeout-review.v1",
    generatedAt: "2026-06-08T12:00:00.000Z",
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicket: "chg-20260608-live-pilot-closeout",
    },
    launchWindow: {
      startsAt: "2026-06-08T10:00:00.000Z",
      endsAt: "2026-06-08T11:00:00.000Z",
      closedAt: "2026-06-08T11:15:00.000Z",
      durationMinutes: 60,
      freezeWindowActive: true,
    },
    runSummary: {
      totalRuns: 3,
      succeededRuns: 1,
      failedRuns: 1,
      rolledBackRuns: 1,
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
      providerWriteLivePilotRunLedgerDraftSha256:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      auditExportSha256:
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      productionLaunchSha256:
        "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
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

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-manual-closeout-review.mjs",
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
    assert.fail(`Expected manual closeout review verification to fail, got stdout: ${result.stdout}`);
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
