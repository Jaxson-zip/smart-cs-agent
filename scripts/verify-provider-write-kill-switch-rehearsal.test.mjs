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
  "provider-write-kill-switch-rehearsal-artifacts",
);

test("provider write kill switch rehearsal verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(
    result.stdout,
    /Provider write kill switch rehearsal verification passed\./,
  );
  assert.match(result.stdout, /rehearsal=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write kill switch rehearsal verifier accepts sanitized safe evidence", async () => {
  await withRehearsalFixture(async ({ rehearsalFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE: rehearsalFile,
      SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS: "true",
    });

    assert.match(
      result.stdout,
      /Provider write kill switch rehearsal verification passed\./,
    );
    assert.match(result.stdout, /channel=taobao/);
    assert.match(result.stdout, /rehearsal=verified/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write kill switch rehearsal verifier safe mode requires evidence", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write kill switch rehearsal evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write kill switch rehearsal verifier rejects weak engage, blocking, release, and controls", async () => {
  await withRehearsalFixture(
    async ({ rehearsalFile }) => {
      const failed = await execVerifierFailure([
        `--rehearsal=${rehearsalFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /engage\.emergencyStopEngaged must be true/);
      assert.match(
        failed.stderr,
        /executionBlock\.policyReason must be emergency_stop_engaged/,
      );
      assert.match(
        failed.stderr,
        /executionBlock\.providerMutationExecuted must be false/,
      );
      assert.match(
        failed.stderr,
        /release\.realWritesEnabled must be false/,
      );
      assert.match(
        failed.stderr,
        /controls\.executionBlockedWhileEngaged must be true/,
      );
      assert.match(failed.stderr, /controls\.auditTrailVerified must be true/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      engage: {
        emergencyStopEngaged: false,
      },
      executionBlock: {
        policyReason: "dry_run_recorded",
        providerMutationExecuted: true,
      },
      release: {
        realWritesEnabled: true,
      },
      controls: {
        executionBlockedWhileEngaged: false,
        auditTrailVerified: false,
      },
    },
  );
});

test("provider write kill switch rehearsal verifier rejects unsafe observer identity reuse", async () => {
  await withRehearsalFixture(
    async ({ rehearsalFile }) => {
      const failed = await execVerifierFailure([
        `--rehearsal=${rehearsalFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /rehearsal observer fingerprints must be distinct from initiator/,
      );
      assert.match(
        failed.stderr,
        /rehearsal observedByFingerprint and secondObserverFingerprint must be different/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      rehearsal: {
        initiatedByFingerprint: "2b3c4d5e6f70",
        observedByFingerprint: "2b3c4d5e6f70",
        secondObserverFingerprint: "2b3c4d5e6f70",
      },
    },
  );
});

test("provider write kill switch rehearsal verifier rejects inconsistent rehearsal sequence", async () => {
  await withRehearsalFixture(
    async ({ rehearsalFile }) => {
      const failed = await execVerifierFailure([
        `--rehearsal=${rehearsalFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /engage\.requestedAt must be before or equal to executionBlock\.attemptedAt/,
      );
      assert.match(
        failed.stderr,
        /executionBlock\.attemptedAt must be before or equal to release\.requestedAt/,
      );
      assert.match(failed.stderr, /engage and release state fingerprints must differ/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      engage: {
        requestedAt: "2026-06-08T10:00:00Z",
        stateFingerprint: "6f708192a3b4",
      },
      executionBlock: {
        attemptedAt: "2026-06-08T09:59:59Z",
      },
      release: {
        requestedAt: "2026-06-08T09:59:58Z",
        stateFingerprint: "6f708192a3b4",
      },
    },
  );
});

test("provider write kill switch rehearsal verifier rejects placeholder artifact hashes", async () => {
  await withRehearsalFixture(
    async ({ rehearsalFile }) => {
      const failed = await execVerifierFailure([
        `--rehearsal=${rehearsalFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /artifactBindings\.providerWriteKillSwitchControlPlaneSha256 must be a non-placeholder sha256 hash/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      artifactBindings: {
        providerWriteKillSwitchControlPlaneSha256: "a".repeat(64),
      },
    },
  );
});

test("provider write kill switch rehearsal verifier rejects sensitive evidence without echoing values", async () => {
  await withRehearsalFixture(
    async ({ rehearsalFile }) => {
      const failed = await execVerifierFailure([
        `--rehearsal=${rehearsalFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /provider write kill switch rehearsal contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write kill switch rehearsal field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write kill switch rehearsal value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      tenantId: "tenant_launch_secret",
      idempotencyKey: "plain_secret_token_must_not_leak",
      providerToken: "actual_provider_token_must_not_leak",
      engage: {
        providerPayload: "actual_provider_token_must_not_leak",
      },
      safety: {
        secretsInEvidence: true,
      },
    },
  );
});

test("provider write kill switch rehearsal verifier rejects paths outside the artifact directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-provider-write-kill-switch-"));
  const rehearsalFile = join(dir, "provider-write-kill-switch-rehearsal.json");
  await writeFile(rehearsalFile, JSON.stringify(validRehearsal(), null, 2), "utf8");

  try {
    const failed = await execVerifierFailure([
      `--rehearsal=${rehearsalFile}`,
      "--require-pass",
    ]);

    assert.match(
      failed.stderr,
      /--rehearsal must be inside provider-write-kill-switch-rehearsal-artifacts/,
    );
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("provider write kill switch rehearsal verifier redacts unknown argument values", async () => {
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
  const rehearsalFile = join(dir, "provider-write-kill-switch-rehearsal.json");

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
    schemaVersion: "smart-cs-agent.provider-write-kill-switch-rehearsal.v1",
    generatedAt: new Date().toISOString(),
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicket: "chg-20260608-kill-switch-rehearsal",
    },
    rehearsal: {
      rehearsalId: "pwks-20260608-taobao",
      initiatedByFingerprint: "2b3c4d5e6f70",
      observedByFingerprint: "3c4d5e6f7081",
      secondObserverFingerprint: "5e6f708192a3",
      rehearsalMode: "local_control_plane",
    },
    engage: {
      action: "engage",
      reasonCode: "launch_rehearsal",
      requestedAt: new Date().toISOString(),
      statusSource: "emergency_stop",
      emergencyStopEngaged: true,
      effectiveKillSwitchEnabled: true,
      stateFingerprint: "6f708192a3b4",
      idempotencyKeyHashFingerprint: "708192a3b4c5",
      adminRouteVerified: true,
    },
    executionBlock: {
      attemptedAt: new Date().toISOString(),
      requestFingerprint: "8192a3b4c5d6",
      attemptFingerprint: "92a3b4c5d6e7",
      status: "blocked",
      policyReason: "emergency_stop_engaged",
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      payloadEscrowOpened: false,
    },
    release: {
      action: "release",
      reasonCode: "post_incident_restore",
      requestedAt: new Date().toISOString(),
      persistedEmergencyStopReleased: true,
      envKillSwitchStillControlled: true,
      realWritesEnabled: false,
      stateFingerprint: "a3b4c5d6e7f8",
      idempotencyKeyHashFingerprint: "b4c5d6e7f809",
      adminRouteVerified: true,
    },
    controls: {
      adminOnlyApiVerified: true,
      bffAdminOnlyVerified: true,
      twoPersonObservationVerified: true,
      idempotencyVerified: true,
      auditTrailVerified: true,
      executionBlockedWhileEngaged: true,
      releaseDoesNotEnableWrites: true,
      noProviderCredentialsRead: true,
      noProviderNetworkCalls: true,
      noPayloadEscrowOpened: true,
      noCustomerVisibleReplySent: true,
      noProviderMutationExecuted: true,
    },
    evidence: {
      providerWriteKillSwitchControlPlaneVerifierPassed: true,
      providerWriteExecutionAttemptsVerifierPassed: true,
      productionProviderWriteApprovalVerifierPassed: true,
      productionLaunchVerifierPassed: true,
    },
    artifactBindings: {
      providerWriteKillSwitchControlPlaneSha256:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      providerWriteExecutionAttemptSha256:
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      productionProviderWriteApprovalSha256:
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      productionLaunchSha256:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    },
    safety: {
      secretsInEvidence: false,
      rawTenantIdsInEvidence: false,
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
    "scripts/verify-provider-write-kill-switch-rehearsal.mjs",
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
      `Expected provider write kill switch rehearsal verification to fail, got stdout: ${result.stdout}`,
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
