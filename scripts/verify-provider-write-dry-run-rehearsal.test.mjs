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
  "provider-write-dry-run-rehearsal-artifacts",
);

test("provider write dry-run rehearsal verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write dry-run rehearsal verification passed\./,
  );
  assert.match(result.stdout, /rehearsal=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write dry-run rehearsal verifier accepts sanitized safe evidence", async () => {
  await withRehearsalFixture(async ({ rehearsalFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE: rehearsalFile,
      SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS: "true",
    });

    assert.match(
      result.stdout,
      /Provider write dry-run rehearsal verification passed\./,
    );
    assert.match(result.stdout, /channel=taobao/);
    assert.match(result.stdout, /rehearsal=verified/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write dry-run rehearsal verifier safe mode requires evidence", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write dry-run rehearsal evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write dry-run rehearsal verifier rejects weak controls and unsafe execution state", async () => {
  await withRehearsalFixture(
    async ({ rehearsalFile }) => {
      const failed = await execVerifierFailure([
        `--rehearsal=${rehearsalFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /review\.humanReviewRequired must be true/);
      assert.match(failed.stderr, /controls\.idempotencyVerified must be true/);
      assert.match(failed.stderr, /controls\.auditTrailVerified must be true/);
      assert.match(
        failed.stderr,
        /controls\.providerWriteKillSwitchVerified must be true/,
      );
      assert.match(
        failed.stderr,
        /executionAttempt\.networkExecution must be not_started/,
      );
      assert.match(
        failed.stderr,
        /executionAttempt\.providerMutationExecuted must be false/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      review: {
        humanReviewRequired: false,
      },
      controls: {
        idempotencyVerified: false,
        auditTrailVerified: false,
        providerWriteKillSwitchVerified: false,
      },
      executionAttempt: {
        networkExecution: "started",
        providerMutationExecuted: true,
      },
    },
  );
});

test("provider write dry-run rehearsal verifier rejects unsupported or high-risk actions", async () => {
  await withRehearsalFixture(
    async ({ rehearsalFile }) => {
      const failed = await execVerifierFailure([
        `--rehearsal=${rehearsalFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /scenario\.action cannot include refund/);
      assert.match(
        failed.stderr,
        /scenario\.action must be a first-pilot provider write action/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      scenario: {
        action: "refund",
      },
    },
  );
});

test("provider write dry-run rehearsal verifier rejects sensitive evidence without echoing values", async () => {
  await withRehearsalFixture(
    async ({ rehearsalFile }) => {
      const failed = await execVerifierFailure([
        `--rehearsal=${rehearsalFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /provider write dry-run rehearsal contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write dry-run rehearsal field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write dry-run rehearsal value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      tenantId: "tenant_launch_secret",
      providerToken: "actual_provider_token_must_not_leak",
      evidence: {
        providerPayload: "actual_provider_token_must_not_leak",
      },
      safety: {
        secretsInEvidence: true,
      },
    },
  );
});

test("provider write dry-run rehearsal verifier rejects rehearsal paths outside the artifact directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-provider-write-rehearsal-"));
  const rehearsalFile = join(dir, "provider-write-dry-run-rehearsal.json");
  await writeFile(rehearsalFile, JSON.stringify(validRehearsal(), null, 2), "utf8");

  try {
    const failed = await execVerifierFailure([
      `--rehearsal=${rehearsalFile}`,
      "--require-pass",
    ]);

    assert.match(
      failed.stderr,
      /--rehearsal must be inside provider-write-dry-run-rehearsal-artifacts/,
    );
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("provider write dry-run rehearsal verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com/rehearsal.json",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function withRehearsalFixture(callback, overrides = {}) {
  await mkdir(artifactRoot, { recursive: true });
  const dir = await mkdtemp(join(artifactRoot, "fixture-"));
  const rehearsalFile = join(dir, "provider-write-dry-run-rehearsal.json");

  try {
    await writeFile(
      rehearsalFile,
      JSON.stringify(deepMerge(validRehearsal(), overrides), null, 2),
      "utf8",
    );
    await callback({ dir, rehearsalFile });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validRehearsal() {
  return {
    schemaVersion: "smart-cs-agent.provider-write-dry-run-rehearsal.v1",
    generatedAt: new Date().toISOString(),
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicket: "chg-20260608-provider-write-rehearsal",
    },
    scenario: {
      rehearsalId: "pwr-20260608-taobao-address",
      action: "modify_address",
      riskLevel: "low",
      rehearsalMode: "local_dry_run",
    },
    request: {
      status: "approval_required",
      requestFingerprint: "1a2b3c4d5e6f",
      idempotencyKeyHashFingerprint: "4d5e6f708192",
      payloadEscrowStatus: "not_stored",
      rawPayloadStored: false,
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      networkExecution: "not_started",
    },
    review: {
      decision: "approved",
      humanReviewRequired: true,
      twoPersonReviewPassed: true,
      requesterFingerprint: "2b3c4d5e6f70",
      reviewerFingerprint: "3c4d5e6f7081",
      secondReviewerFingerprint: "5e6f708192a3",
      reviewedAt: new Date().toISOString(),
    },
    executionAttempt: {
      status: "blocked",
      policyReason: "execution_kill_switch_enabled",
      attemptFingerprint: "6f708192a3b4",
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      payloadEscrowOpened: false,
      payloadEscrowStatus: "not_stored",
    },
    controls: {
      providerWriteKillSwitchVerified: true,
      idempotencyVerified: true,
      auditTrailVerified: true,
      noProviderCredentialsRead: true,
      noProviderNetworkCalls: true,
      noPayloadEscrowOpened: true,
      noCustomerVisibleReplySent: true,
      noProviderMutationExecuted: true,
    },
    evidence: {
      providerWriteRequestsVerifierPassed: true,
      providerWriteApprovalStateVerifierPassed: true,
      providerWriteExecutionAttemptsVerifierPassed: true,
      providerWriteExecutionAttemptVisibilityVerifierPassed: true,
      providerWritePayloadEscrowBoundaryVerifierPassed: true,
      productionProviderWriteApprovalVerifierPassed: true,
      productionLaunchVerifierPassed: true,
    },
    artifactBindings: {
      providerWriteRequestQueueSha256: "a".repeat(64),
      providerWriteApprovalStateSha256: "b".repeat(64),
      providerWriteExecutionAttemptSha256: "c".repeat(64),
      providerWritePayloadEscrowBoundarySha256: "d".repeat(64),
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
    "scripts/verify-provider-write-dry-run-rehearsal.mjs",
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
    assert.fail(
      `Expected provider write dry-run rehearsal verification to fail, got stdout: ${result.stdout}`,
    );
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
    "tenant_launch_secret",
    "actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "user:secret",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
