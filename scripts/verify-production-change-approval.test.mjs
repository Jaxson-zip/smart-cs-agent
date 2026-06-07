import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const artifactRoot = join(process.cwd(), "production-change-approval-artifacts");

test("production change approval verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Production change approval verification passed\./);
  assert.match(result.stdout, /evidence=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("production change approval verifier accepts sanitized approved evidence from safe env mode", async () => {
  await withEvidenceFixture(async ({ evidenceFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE: evidenceFile,
      SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS: "true",
    });

    assert.match(result.stdout, /Production change approval verification passed\./);
    assert.match(result.stdout, /releaseId=release-2026-06-07-a/);
    assert.match(result.stdout, /evidence=verified/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("production change approval verifier rejects staging target when pass evidence is required", async () => {
  await withEvidenceFixture(
    async ({ evidenceFile }) => {
      const failed = await execVerifierFailure([
        `--evidence=${evidenceFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /changeWindow\.targetEnvironment must be production/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      changeWindow: {
        targetEnvironment: "staging",
      },
    },
  );
});

test("production change approval verifier rejects pending approval or weak rollback controls", async () => {
  await withEvidenceFixture(
    async ({ evidenceFile }) => {
      const failed = await execVerifierFailure([
        `--evidence=${evidenceFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /approvals\.approvalStatus must be approved/);
      assert.match(failed.stderr, /rollback\.killSwitchReady must be true/);
      assert.match(failed.stderr, /rollback\.rollbackDrillStatus must be passed/);
      assert.match(failed.stderr, /rollback\.maxRollbackMinutes must be at most 30/);
      assert.match(failed.stderr, /riskControls\.productionCanaryRequired must be true/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approvals: {
        approvalStatus: "pending",
      },
      rollback: {
        killSwitchReady: false,
        rollbackDrillStatus: "failed",
        maxRollbackMinutes: 45,
      },
      riskControls: {
        productionCanaryRequired: false,
      },
    },
  );
});

test("production change approval verifier rejects sensitive evidence without echoing values", async () => {
  await withEvidenceFixture(
    async ({ evidenceFile }) => {
      const failed = await execVerifierFailure([
        `--evidence=${evidenceFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /production change approval contains unsupported field/);
      assert.match(failed.stderr, /forbidden sensitive production change approval field/);
      assert.match(failed.stderr, /forbidden sensitive production change approval value/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      tenantId: "tenant_launch_secret",
      approvals: {
        webhookSecret: "super_secret_webhook_value",
      },
      evidenceArtifacts: {
        changeApprovalBundle: "secret://smartcs/change",
      },
    },
  );
});

test("production change approval verifier rejects evidence paths outside the artifact directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-change-approval-outside-"));
  const evidenceFile = join(dir, "production-change-approval.json");
  await writeFile(evidenceFile, JSON.stringify(validEvidence(), null, 2), "utf8");

  try {
    const failed = await execVerifierFailure([
      `--evidence=${evidenceFile}`,
      "--require-pass",
    ]);

    assert.match(failed.stderr, /--evidence must be inside production-change-approval-artifacts/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("production change approval verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com/change-approval.json",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function withEvidenceFixture(callback, overrides = {}) {
  await mkdir(artifactRoot, { recursive: true });
  const dir = await mkdtemp(join(artifactRoot, "fixture-"));
  const evidenceFile = join(dir, "production-change-approval.json");

  try {
    await writeFile(
      evidenceFile,
      JSON.stringify(deepMerge(validEvidence(), overrides), null, 2),
      "utf8",
    );
    await callback({ dir, evidenceFile });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validEvidence() {
  return {
    schemaVersion: "smart-cs-agent.production-change-approval.v1",
    generatedAt: new Date().toISOString(),
    releaseId: "release-2026-06-07-a",
    changeWindow: {
      targetEnvironment: "production",
      windowStart: "2026-06-07T12:00:00.000Z",
      windowEnd: "2026-06-07T13:00:00.000Z",
      expectedDurationMinutes: 60,
      freezeWindowConfirmed: true,
    },
    approvals: {
      approvalStatus: "approved",
      approvedAt: "2026-06-07T11:30:00.000Z",
      changeTicket: "chg-20260607-a",
      productOwnerFingerprint: "6a805e005e94",
      engineeringOwnerFingerprint: "91d4987b6aa4",
      securityOwnerFingerprint: "626d085d7f2c",
      operationsOwnerFingerprint: "d2c001b7a20e",
    },
    rollback: {
      rollbackOwnerFingerprint: "6a805e005e94",
      incidentOwnerFingerprint: "91d4987b6aa4",
      rollbackPlanLinked: true,
      killSwitchReady: true,
      rollbackDrillStatus: "passed",
      maxRollbackMinutes: 20,
    },
    riskControls: {
      launchManifestVerified: true,
      releaseProvenanceVerified: true,
      releaseEvidenceRequired: true,
      productionCanaryRequired: true,
      alertingRoutesConfirmed: true,
      operatorCoverageConfirmed: true,
      providerWritesDisabled: true,
      customerVisibleActionsDisabled: true,
    },
    communications: {
      incidentChannelFingerprint: "a54d2c4dfb12",
      operatorBriefingStatus: "passed",
      customerSupportBriefingStatus: "passed",
      escalationPolicyStatus: "passed",
    },
    safety: {
      secretsInEvidence: false,
      rawTenantIdsInEvidence: false,
      customerDataInEvidence: false,
      providerPayloadsInEvidence: false,
      networkExecutedByVerifier: false,
      registryPublishedByVerifier: false,
      realCommerceWritesEnabled: false,
      customerVisibleActionsEnabled: false,
    },
    evidenceArtifacts: {
      changeApprovalBundle: "production-change-approval.json",
      releaseEvidenceBundle: "production-release-evidence.json",
      rollbackDrillSummary: "rollback-drill-summary.json",
      operatorCoverageSummary: "operator-coverage-summary.json",
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
    "scripts/verify-production-change-approval.mjs",
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
    assert.fail(`Expected change approval verification to fail, got stdout: ${result.stdout}`);
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
    "secret://smartcs",
    "super_secret_webhook_value",
    "production_operator_key",
    "actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "user:secret",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
