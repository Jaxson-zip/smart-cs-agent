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
  "provider-write-live-pilot-preflight-artifacts",
);

test("provider write live pilot preflight verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Provider write live pilot preflight verification passed\./);
  assert.match(result.stdout, /preflight=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("provider write live pilot preflight verifier accepts sanitized safe evidence", async () => {
  await withPreflightFixture(async ({ preflightFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE: preflightFile,
      SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS: "true",
    });

    assert.match(result.stdout, /Provider write live pilot preflight verification passed\./);
    assert.match(result.stdout, /channel=taobao/);
    assert.match(result.stdout, /preflight=verified/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("provider write live pilot preflight verifier safe mode requires evidence", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(
    failed.stderr,
    /provider write live pilot preflight evidence is required/,
  );
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("provider write live pilot preflight verifier rejects broad rollout and risky actions", async () => {
  await withPreflightFixture(
    async ({ preflightFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /target\.rolloutTrack must be single_merchant_pilot/);
      assert.match(failed.stderr, /pilot\.action must be a first-pilot provider write action/);
      assert.match(failed.stderr, /pilot\.riskLevel must be low/);
      assert.match(failed.stderr, /pilot\.liveExecutorEnabledAtVerification must be false/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      target: {
        rolloutTrack: "multi_merchant_rollout",
      },
      pilot: {
        action: "refund",
        riskLevel: "high",
        liveExecutorEnabledAtVerification: true,
      },
    },
  );
});

test("provider write live pilot preflight verifier rejects weak runtime controls", async () => {
  await withPreflightFixture(
    async ({ preflightFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /runtimeControls\.killSwitchEngagedBeforeWindow must be true/);
      assert.match(failed.stderr, /runtimeControls\.humanConfirmRequired must be true/);
      assert.match(failed.stderr, /runtimeControls\.idempotencyVerified must be true/);
      assert.match(failed.stderr, /runtimeControls\.payloadEscrowSealedMetadataOnly must be true/);
      assert.match(failed.stderr, /runtimeControls\.noCustomerVisibleAutoReply must be true/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      runtimeControls: {
        killSwitchEngagedBeforeWindow: false,
        humanConfirmRequired: false,
        idempotencyVerified: false,
        payloadEscrowSealedMetadataOnly: false,
        noCustomerVisibleAutoReply: false,
      },
    },
  );
});

test("provider write live pilot preflight verifier rejects weak operator coverage and rollback", async () => {
  await withPreflightFixture(
    async ({ preflightFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /operatorCoverage\.primaryOperatorFingerprint must differ from backupOperatorFingerprint/);
      assert.match(failed.stderr, /operatorCoverage\.releaseOwnerFingerprint must differ from rollbackOwnerFingerprint/);
      assert.match(failed.stderr, /operatorCoverage\.liveWatchMinutes must be at least 60/);
      assert.match(failed.stderr, /rollback\.rollbackDrillPassed must be true/);
      assert.match(failed.stderr, /rollback\.disableLiveExecutorWithinMinutes must be between 1 and 15/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      operatorCoverage: {
        primaryOperatorFingerprint: "123456abcdef",
        backupOperatorFingerprint: "123456abcdef",
        releaseOwnerFingerprint: "abcdef123456",
        rollbackOwnerFingerprint: "abcdef123456",
        liveWatchMinutes: 30,
      },
      rollback: {
        rollbackDrillPassed: false,
        disableLiveExecutorWithinMinutes: 20,
      },
    },
  );
});

test("provider write live pilot preflight verifier rejects weak observability and launch window", async () => {
  await withPreflightFixture(
    async ({ preflightFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /observability\.canaryRequired must be true/);
      assert.match(failed.stderr, /observability\.metricsDashboardReady must be true/);
      assert.match(failed.stderr, /observability\.alertRoutesReady must be true/);
      assert.match(failed.stderr, /launchWindow\.durationMinutes must be between 15 and 120/);
      assert.match(failed.stderr, /launchWindow\.freezeWindowActive must be true/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      observability: {
        canaryRequired: false,
        metricsDashboardReady: false,
        alertRoutesReady: false,
      },
      launchWindow: {
        durationMinutes: 180,
        freezeWindowActive: false,
      },
    },
  );
});

test("provider write live pilot preflight verifier rejects missing evidence bindings and placeholder hashes", async () => {
  await withPreflightFixture(
    async ({ preflightFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /evidence\.productionProviderWriteApprovalVerifierPassed must be true/,
      );
      assert.match(
        failed.stderr,
        /artifactBindings\.productionProviderWriteApprovalSha256 must be a non-placeholder sha256 hash/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      evidence: {
        productionProviderWriteApprovalVerifierPassed: false,
      },
      artifactBindings: {
        productionProviderWriteApprovalSha256: "a".repeat(64),
      },
    },
  );
});

test("provider write live pilot preflight verifier requires kill-switch control-plane hash binding", async () => {
  await withPreflightFixture(
    async ({ preflightFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
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
        providerWriteKillSwitchControlPlaneSha256: "b".repeat(64),
      },
    },
  );
});

test("provider write live pilot preflight verifier rejects sensitive evidence without echoing values", async () => {
  await withPreflightFixture(
    async ({ preflightFile }) => {
      const failed = await execVerifierFailure([
        `--preflight=${preflightFile}`,
        "--require-pass",
      ]);

      assert.match(
        failed.stderr,
        /provider write live pilot preflight contains unsupported field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write live pilot preflight field/,
      );
      assert.match(
        failed.stderr,
        /forbidden sensitive provider write live pilot preflight value/,
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      tenantId: "tenant_launch_secret",
      providerToken: "actual_provider_token_must_not_leak",
      rawPayload: "plain_secret_token_must_not_leak",
      safety: {
        secretsInEvidence: true,
      },
    },
  );
});

test("provider write live pilot preflight verifier rejects paths outside artifact directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-provider-write-live-pilot-"));
  const preflightFile = join(dir, "provider-write-live-pilot-preflight.json");
  await writeFile(preflightFile, JSON.stringify(validPreflight(), null, 2), "utf8");

  try {
    const failed = await execVerifierFailure([
      `--preflight=${preflightFile}`,
      "--require-pass",
    ]);

    assert.match(
      failed.stderr,
      /--preflight must be inside provider-write-live-pilot-preflight-artifacts/,
    );
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("provider write live pilot preflight verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com/preflight.json",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function withPreflightFixture(callback, overrides = {}) {
  await mkdir(artifactRoot, { recursive: true });
  const dir = await mkdtemp(join(artifactRoot, "fixture-"));
  const preflightFile = join(dir, "provider-write-live-pilot-preflight.json");

  try {
    await writeFile(
      preflightFile,
      JSON.stringify(deepMerge(validPreflight(), overrides), null, 2),
      "utf8",
    );
    await callback({ dir, preflightFile });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validPreflight() {
  return {
    schemaVersion: "smart-cs-agent.provider-write-live-pilot-preflight.v1",
    generatedAt: "2026-06-08T00:00:00Z",
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicket: "chg-20260608-live-pilot-preflight",
    },
    pilot: {
      action: "modify_address",
      riskLevel: "low",
      liveExecutorEnabledAtVerification: false,
      maxPilotWrites: 10,
      maxWritesPerOrder: 1,
    },
    runtimeControls: {
      killSwitchEngagedBeforeWindow: true,
      humanConfirmRequired: true,
      idempotencyVerified: true,
      auditTrailVerified: true,
      payloadEscrowSealedMetadataOnly: true,
      noCustomerVisibleAutoReply: true,
      noProviderMutationDuringVerification: true,
    },
    operatorCoverage: {
      primaryOperatorFingerprint: "123456abcdef",
      backupOperatorFingerprint: "234567abcdef",
      releaseOwnerFingerprint: "abcdef123456",
      rollbackOwnerFingerprint: "bcdef1234567",
      liveWatchMinutes: 90,
    },
    rollback: {
      rollbackDrillPassed: true,
      disableLiveExecutorWithinMinutes: 5,
      killSwitchReleaseRequiresTwoPersonReview: true,
      providerWriteQueueDrainPlanReady: true,
    },
    observability: {
      canaryRequired: true,
      metricsDashboardReady: true,
      alertRoutesReady: true,
      auditExportReady: true,
    },
    launchWindow: {
      startsAt: "2026-06-08T10:00:00Z",
      endsAt: "2026-06-08T11:00:00Z",
      durationMinutes: 60,
      freezeWindowActive: true,
    },
    evidence: {
      providerWriteDryRunRehearsalVerifierPassed: true,
      providerWriteKillSwitchRehearsalVerifierPassed: true,
      productionProviderWriteApprovalVerifierPassed: true,
      providerWriteLiveExecutorStartupGuardVerifierPassed: true,
      providerWriteLiveExecutorControlPlaneVerifierPassed: true,
      providerWriteKillSwitchControlPlaneVerifierPassed: true,
      productionLaunchVerifierPassed: true,
    },
    artifactBindings: {
      providerWriteDryRunRehearsalSha256:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      providerWriteKillSwitchRehearsalSha256:
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      productionProviderWriteApprovalSha256:
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      providerWriteLiveExecutorStartupGuardSha256:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      providerWriteLiveExecutorControlPlaneSha256:
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
      providerWriteKillSwitchControlPlaneSha256:
        "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      productionLaunchSha256:
        "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f53",
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
    "scripts/verify-provider-write-live-pilot-preflight.mjs",
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
    assert.fail(`Expected live pilot preflight verification to fail, got stdout: ${result.stdout}`);
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
