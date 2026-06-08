import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const artifactRoot = join(
  process.cwd(),
  "provider-write-live-pilot-run-ledger-artifacts",
);

test("provider write live pilot run ledger verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Provider write live pilot run ledger verification passed\./);
  assert.match(result.stdout, /ledger=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write live pilot run ledger verifier accepts sanitized safe evidence", async () => {
  await withLedgerFixture(async ({ ledgerFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE: ledgerFile,
      SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_REQUIRE_PASS: "true",
    });

    assert.match(result.stdout, /Provider write live pilot run ledger verification passed\./);
    assert.match(result.stdout, /channel=taobao/);
    assert.match(result.stdout, /ledger=verified/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write live pilot run ledger verifier safe mode requires evidence", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write live pilot run ledger evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write live pilot run ledger verifier rejects broad rollout and risky runs", async () => {
  await withLedgerFixture(
    async ({ ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /target\.rolloutTrack must be single_merchant_pilot/);
      assert.match(failed.stderr, /runRecords\[0\]\.action must be a first-pilot provider write action/);
      assert.match(failed.stderr, /runRecords\[0\]\.riskLevel must be low/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      target: {
        rolloutTrack: "multi_merchant_rollout",
      },
      runRecords: [
        {
          action: "refund",
          riskLevel: "high",
        },
      ],
    },
  );
});

test("provider write live pilot run ledger verifier rejects inconsistent summary and weak closeout controls", async () => {
  await withLedgerFixture(
    async ({ ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /summary\.totalRuns must match runRecords length/);
      assert.match(failed.stderr, /summary\.succeededRuns must match run record statuses/);
      assert.match(failed.stderr, /summary\.allRunsReviewed must be true/);
      assert.match(failed.stderr, /summary\.failedRunsHaveIncidentNotes must be true when failedRuns is greater than 0/);
      assert.match(failed.stderr, /summary\.rollbackActionsVerified must be true when rolledBackRuns is greater than 0/);
      assert.match(failed.stderr, /summary\.noAutoCustomerReplies must be true/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      summary: {
        totalRuns: 4,
        succeededRuns: 9,
        failedRuns: 1,
        rolledBackRuns: 1,
        allRunsReviewed: false,
        failedRunsHaveIncidentNotes: false,
        rollbackActionsVerified: false,
        noAutoCustomerReplies: false,
      },
      runRecords: [
        {
          status: "failed",
          providerMutationExecuted: false,
          networkExecution: "provider_api_called",
        },
      ],
    },
  );
});

test("provider write live pilot run ledger verifier rejects empty safe ledgers", async () => {
  await withLedgerFixture(
    async ({ ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /runRecords must contain at least one record when ledger evidence is required/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      summary: {
        totalRuns: 0,
        succeededRuns: 0,
        failedRuns: 0,
        rolledBackRuns: 0,
        blockedRuns: 0,
      },
      runRecords: [],
    },
  );
});

test("provider write live pilot run ledger verifier rejects runs outside the launch window", async () => {
  await withLedgerFixture(
    async ({ ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /runRecords\[0\]\.createdAt must be inside launchWindow/,
      );
      assert.match(
        failed.stderr,
        /runRecords\[0\]\.completedAt must be inside launchWindow/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      summary: {
        totalRuns: 1,
        succeededRuns: 1,
        failedRuns: 0,
        rolledBackRuns: 0,
        blockedRuns: 0,
      },
      runRecords: [
        safeRun({
          createdAt: "2026-06-08T09:59:59Z",
          completedAt: "2026-06-08T11:00:01Z",
        }),
      ],
    },
  );
});

test("provider write live pilot run ledger verifier requires rollback proof for failed provider mutations", async () => {
  await withLedgerFixture(
    async ({ ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /summary\.rollbackActionsVerified must be true when failed provider mutations exist/,
      );
      assert.match(
        failed.stderr,
        /runRecords\[0\]\.status cannot be failed with providerMutationExecuted=true without rollback verification/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      summary: {
        totalRuns: 1,
        succeededRuns: 0,
        failedRuns: 1,
        rolledBackRuns: 0,
        blockedRuns: 0,
        rollbackActionsVerified: false,
      },
      runRecords: [
        safeRun({
          status: "failed",
          action: "issue_coupon",
          providerMutationExecuted: true,
          networkExecution: "provider_api_called",
        }),
      ],
    },
  );
});

test("provider write live pilot run ledger verifier rejects unsafe run records", async () => {
  await withLedgerFixture(
    async ({ ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /runRecords\[0\]\.customerVisibleMessageSent must be false/);
      assert.match(failed.stderr, /runRecords\[0\]\.providerResponseStored must be false/);
      assert.match(failed.stderr, /runRecords\[0\]\.providerPayloadStored must be false/);
      assert.match(failed.stderr, /runRecords\[0\]\.providerMutationExecuted must be true for succeeded or rolled_back runs/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      runRecords: [
        {
          status: "succeeded",
          providerMutationExecuted: false,
          customerVisibleMessageSent: true,
          providerResponseStored: true,
          providerPayloadStored: true,
        },
      ],
    },
  );
});

test("provider write live pilot run ledger verifier rejects missing artifact bindings and placeholder hashes", async () => {
  await withLedgerFixture(
    async ({ ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /evidence\.providerWriteLivePilotPreflightVerifierPassed must be true/,
      );
      assert.match(
        failed.stderr,
        /artifactBindings\.providerWriteLivePilotPreflightSha256 must be a non-placeholder sha256 hash/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      evidence: {
        providerWriteLivePilotPreflightVerifierPassed: false,
      },
      artifactBindings: {
        providerWriteLivePilotPreflightSha256: "a".repeat(64),
      },
    },
  );
});

test("provider write live pilot run ledger verifier rejects sensitive evidence without echoing values", async () => {
  await withLedgerFixture(
    async ({ ledgerFile }) => {
      const failed = await execVerifierFailure([
        `--ledger=${ledgerFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /provider write live pilot run ledger contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write live pilot run ledger field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write live pilot run ledger value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      tenantId: "tenant_launch_secret",
      providerToken: "actual_provider_token_must_not_leak",
      rawPayload: "plain_secret_token_must_not_leak",
      safety: {
        secretsInLedger: true,
      },
    },
  );
});

test("provider write live pilot run ledger verifier rejects paths outside artifact directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-provider-write-live-ledger-"));
  const ledgerFile = join(dir, "provider-write-live-pilot-run-ledger.json");
  await writeFile(ledgerFile, JSON.stringify(validLedger(), null, 2), "utf8");

  try {
    const failed = await execVerifierFailure([
      `--ledger=${ledgerFile}`,
      "--require-pass",
    ]);

    assert.match(
      failed.stderr,
      /--ledger must be inside provider-write-live-pilot-run-ledger-artifacts/,
    );
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("provider write live pilot run ledger verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com/ledger.json",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function withLedgerFixture(callback, overrides = {}) {
  await mkdir(artifactRoot, { recursive: true });
  const dir = await mkdtemp(join(artifactRoot, "fixture-"));
  const ledgerFile = join(dir, "provider-write-live-pilot-run-ledger.json");

  try {
    await writeFile(
      ledgerFile,
      JSON.stringify(deepMerge(validLedger(), overrides), null, 2),
      "utf8",
    );
    await callback({ dir, ledgerFile });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validLedger() {
  return {
    schemaVersion: "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
    generatedAt: "2026-06-08T00:00:00Z",
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicket: "chg-20260608-live-pilot-run-ledger",
    },
    launchWindow: {
      startsAt: "2026-06-08T10:00:00Z",
      endsAt: "2026-06-08T11:00:00Z",
      closedAt: "2026-06-08T11:15:00Z",
      durationMinutes: 60,
      freezeWindowActive: true,
    },
    summary: {
      totalRuns: 3,
      succeededRuns: 1,
      failedRuns: 1,
      rolledBackRuns: 1,
      blockedRuns: 0,
      allRunsReviewed: true,
      failedRunsHaveIncidentNotes: true,
      rollbackActionsVerified: true,
      noAutoCustomerReplies: true,
    },
    runRecords: [
      safeRun({
        status: "succeeded",
        action: "modify_address",
        providerMutationExecuted: true,
        runFingerprint:
          "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606c06d4be3cd35db7a1912cf6ec",
      }),
      safeRun({
        status: "failed",
        action: "issue_coupon",
        providerMutationExecuted: false,
        runFingerprint:
          "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      }),
      safeRun({
        status: "rolled_back",
        action: "urge_logistics",
        providerMutationExecuted: true,
        runFingerprint:
          "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      }),
    ],
    evidence: {
      providerWriteLivePilotPreflightVerifierPassed: true,
      productionProviderWriteApprovalVerifierPassed: true,
      providerWriteKillSwitchControlPlaneVerifierPassed: true,
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
      productionLaunchSha256:
        "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f53",
      auditExportSha256:
        "3b64db95cb55c763391c707108489ae18b4112d783300de38e033b4c98c3deaf",
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

function safeRun(overrides = {}) {
  return {
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
    createdAt: "2026-06-08T10:15:00Z",
    completedAt: "2026-06-08T10:16:00Z",
    ...overrides,
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
    "scripts/verify-provider-write-live-pilot-run-ledger.mjs",
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
    assert.fail(`Expected live pilot run ledger verification to fail, got stdout: ${result.stdout}`);
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
    "user:secret",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
