import assert from "node:assert";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const reviewArtifactRoot = join(
  process.cwd(),
  "provider-write-controlled-expansion-closeout-review-artifacts",
);
const runLedgerArtifactRoot = join(
  process.cwd(),
  "provider-write-controlled-expansion-run-ledger-artifacts",
);
const changeTicket = "chg-20260608-controlled-expansion-closeout";
const auditExportSha256 =
  "3b64db95cb55c763391c707108489ae18b4112d783300de38e033b4c98c3deaf";
const productionLaunchSha256 =
  "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f53";
const staticCiSha256 =
  "a7b7e060570c4eb6723c99c7f45315b926f145730ad4a6c36bb1c58a72a1cf95";

test("provider write controlled expansion closeout review verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write controlled expansion closeout review verification passed\./,
  );
  assert.match(result.stdout, /review=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write controlled expansion closeout review safe mode requires evidence chain", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

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

test("provider write controlled expansion closeout review verifier accepts sanitized post-window review evidence", async () => {
  await withCloseoutReviewFixture(async ({ reviewFile, runLedgerFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_CLOSEOUT_REVIEW_FILE:
        reviewFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_CLOSEOUT_REVIEW_RUN_LEDGER_FILE:
        runLedgerFile,
      SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_CLOSEOUT_REVIEW_REQUIRE_PASS:
        "true",
    });

    assert.match(
      result.stdout,
      /Provider write controlled expansion closeout review verification passed\./,
    );
    assert.match(result.stdout, /rollout=controlled_multi_merchant/);
    assert.match(result.stdout, /review=verified/);
    assert.strictEqual(result.stderr, "");
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write controlled expansion closeout review verifier rejects forged run ledger bindings", async () => {
  await withCloseoutReviewFixture(
    async ({ reviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--review=${reviewFile}`,
        `--run-ledger=${runLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /artifactBindings\.providerWriteControlledExpansionRunLedgerSha256 must match the run ledger file sha256/,
      );
      assert.match(
        failed.stderr,
        /target\.changeTicket must match run ledger target\.changeTicket/,
      );
      assert.match(
        failed.stderr,
        /runSummary\.totalRuns must match run ledger summary\.totalRuns/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      review: {
        target: {
          changeTicket: "chg-different",
        },
        runSummary: {
          totalRuns: 99,
        },
        artifactBindings: {
          providerWriteControlledExpansionRunLedgerSha256:
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        },
      },
    },
  );
});

test("provider write controlled expansion closeout review verifier rejects weak closeout controls", async () => {
  await withCloseoutReviewFixture(
    async ({ reviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--review=${reviewFile}`,
        `--run-ledger=${runLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /reviewers must be distinct/);
      assert.match(failed.stderr, /reviewers\.secondReviewCompleted must be true/);
      assert.match(
        failed.stderr,
        /closeout\.decision must be approved_for_next_expansion_review/,
      );
      assert.match(failed.stderr, /closeout\.customerImpactReviewed must be true/);
      assert.match(
        failed.stderr,
        /closeout\.providerMutationReviewCompleted must be true/,
      );
      assert.match(failed.stderr, /closeout\.complaintReviewCompleted must be true/);
      assert.match(
        failed.stderr,
        /closeout\.compensationRejectionReviewCompleted must be true/,
      );
      assert.match(failed.stderr, /closeout\.billingImpactReviewed must be true/);
      assert.match(failed.stderr, /closeout\.outstandingActions must be empty/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      review: {
        reviewers: {
          releaseOwnerFingerprint: "abcdef123456",
          operationsReviewerFingerprint: "abcdef123456",
          supportReviewerFingerprint: "abcdef123456",
          rollbackOwnerFingerprint: "abcdef123456",
          secondReviewCompleted: false,
        },
        closeout: {
          decision: "rejected_needs_investigation",
          customerImpactReviewed: false,
          providerMutationReviewCompleted: false,
          complaintReviewCompleted: false,
          compensationRejectionReviewCompleted: false,
          incidentReviewCompleted: false,
          rollbackReviewCompleted: false,
          billingImpactReviewed: false,
          evidencePackageReviewed: false,
          outstandingActions: ["ops_follow_up"],
        },
      },
    },
  );
});

test("provider write controlled expansion closeout review verifier rejects unresolved complaints and rejected compensation", async () => {
  await withCloseoutReviewFixture(
    async ({ reviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--review=${reviewFile}`,
        `--run-ledger=${runLedgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /runSummary\.customerComplaintsStoppedRollout must be true/,
      );
      assert.match(
        failed.stderr,
        /runSummary\.rejectedCompensationReviewed must be true/,
      );
      assert.match(failed.stderr, /runSummary\.noAutoCustomerReplies must be true/);
      assert.match(
        failed.stderr,
        /evidence\.supportEscalationReviewCompleted must be true/,
      );
      assert.match(
        failed.stderr,
        /evidence\.merchantNotificationReviewCompleted must be true/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      review: {
        runSummary: {
          complaintCount: 1,
          customerRejectedCompensationCount: 1,
          customerComplaintsStoppedRollout: false,
          rejectedCompensationReviewed: false,
          noAutoCustomerReplies: false,
        },
        evidence: {
          supportEscalationReviewCompleted: false,
          merchantNotificationReviewCompleted: false,
        },
      },
    },
  );
});

test("provider write controlled expansion closeout review verifier rejects unsafe safety flags and sensitive evidence", async () => {
  await withCloseoutReviewFixture(
    async ({ reviewFile, runLedgerFile }) => {
      const failed = await execVerifierFailure([
        `--review=${reviewFile}`,
        `--run-ledger=${runLedgerFile}`,
      ]);

      assert.match(failed.stderr, /safety\.secretsInReview must be false/);
      assert.match(failed.stderr, /safety\.providerWriteExecutedByVerifier must be false/);
      assert.match(
        failed.stderr,
        /provider write controlled expansion closeout review contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write controlled expansion closeout review field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write controlled expansion closeout review value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      review: {
        tenantId: "tenant_launch_secret",
        providerToken: "actual_provider_token_must_not_leak",
        safety: {
          secretsInReview: true,
          providerWriteExecutedByVerifier: true,
        },
      },
    },
  );
});

test("provider write controlled expansion closeout review verifier rejects unsafe paths and redacts arguments", async () => {
  const outside = await execVerifierFailure(["--review=task_plan.md"]);
  assert.match(
    outside.stderr,
    /--review must be inside provider-write-controlled-expansion-closeout-review-artifacts/,
  );

  const unsafeRunLedger = await execVerifierFailure([
    "--run-ledger=https://user:secret@example.test/run-ledger.json",
  ]);
  assert.match(unsafeRunLedger.stderr, /--run-ledger must be a safe local path/);
  assertNoSecretMarkers(`${unsafeRunLedger.stdout}\n${unsafeRunLedger.stderr}`);
  assert.ok(!unsafeRunLedger.stderr.includes("user:secret"));

  const unknown = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
  ]);
  assert.match(unknown.stderr, /Unknown argument: --unknown=<redacted>/);
  assertNoSecretMarkers(`${unknown.stdout}\n${unknown.stderr}`);
});

async function withCloseoutReviewFixture(callback, overrides = {}) {
  await mkdir(reviewArtifactRoot, { recursive: true });
  await mkdir(runLedgerArtifactRoot, { recursive: true });
  const reviewDir = await mkdtemp(join(reviewArtifactRoot, "test-"));
  const runLedgerDir = await mkdtemp(join(runLedgerArtifactRoot, "test-"));
  const runLedgerFile = join(runLedgerDir, "controlled-expansion-run-ledger.json");
  const reviewFile = join(reviewDir, "controlled-expansion-closeout-review.json");

  try {
    await writeJson(
      runLedgerFile,
      deepMerge(validRunLedger(), overrides.runLedger ?? {}),
    );
    const runLedgerSha256 = await sha256File(runLedgerFile);
    await writeJson(
      reviewFile,
      deepMerge(
        validReview({ providerWriteControlledExpansionRunLedgerSha256: runLedgerSha256 }),
        overrides.review ?? {},
      ),
    );

    await callback({
      reviewFile: relative(process.cwd(), reviewFile),
      runLedgerFile: relative(process.cwd(), runLedgerFile),
    });
  } finally {
    await rm(reviewDir, { recursive: true, force: true });
    await rm(runLedgerDir, { recursive: true, force: true });
  }
}

function validReview({ providerWriteControlledExpansionRunLedgerSha256 }) {
  return {
    schemaVersion: "smart-cs-agent.provider-write-controlled-expansion-closeout-review.v1",
    generatedAt: "2026-06-08T17:45:00.000Z",
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
    runSummary: {
      totalRuns: 3,
      succeededRuns: 1,
      failedRuns: 1,
      rolledBackRuns: 1,
      blockedRuns: 0,
      failedProviderMutationRuns: 0,
      complaintCount: 0,
      customerRejectedCompensationCount: 0,
      allRunsReviewed: true,
      failedRunsHaveIncidentNotes: true,
      rollbackActionsVerified: true,
      customerComplaintsStoppedRollout: true,
      rejectedCompensationReviewed: true,
      noAutoCustomerReplies: true,
    },
    reviewers: {
      releaseOwnerFingerprint: "abcdef123456",
      operationsReviewerFingerprint: "123456abcdef",
      supportReviewerFingerprint: "fedcba654321",
      rollbackOwnerFingerprint: "456789abcdef",
      reviewedAt: "2026-06-08T16:45:00.000Z",
      secondReviewCompleted: true,
    },
    closeout: {
      decision: "approved_for_next_expansion_review",
      customerImpactReviewed: true,
      providerMutationReviewCompleted: true,
      complaintReviewCompleted: true,
      compensationRejectionReviewCompleted: true,
      incidentReviewCompleted: true,
      rollbackReviewCompleted: true,
      billingImpactReviewed: true,
      evidencePackageReviewed: true,
      outstandingActions: [],
    },
    evidence: {
      controlledExpansionRunLedgerVerifierPassed: true,
      productionLaunchVerifierPassed: true,
      productionStaticCiVerifierPassed: true,
      productionAlertingVerifierPassed: true,
      productionCanaryVerifierPassed: true,
      auditExportReviewed: true,
      supportEscalationReviewCompleted: true,
      merchantNotificationReviewCompleted: true,
    },
    artifactBindings: {
      providerWriteControlledExpansionRunLedgerSha256,
      auditExportSha256,
      productionLaunchSha256,
      productionStaticCiSha256: staticCiSha256,
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
    evidence: {
      providerWriteControlledExpansionPreflightVerifierPassed: true,
      providerWriteControlledExpansionPreflightSha256:
        "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
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

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-controlled-expansion-closeout-review.mjs",
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
    assert.fail(`Expected controlled expansion closeout review verification to fail, got stdout: ${result.stdout}`);
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
