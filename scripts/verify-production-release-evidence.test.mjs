import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const artifactRoot = join(process.cwd(), "production-release-evidence-artifacts");

test("production release evidence verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Production release evidence verification passed\./);
  assert.match(result.stdout, /evidence=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("production release evidence verifier accepts sanitized pass evidence from safe env mode", async () => {
  await withEvidenceFixture(async ({ evidenceFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE: evidenceFile,
      SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS: "true",
    });

    assert.match(result.stdout, /Production release evidence verification passed\./);
    assert.match(result.stdout, /releaseId=release-2026-06-07-a/);
    assert.match(result.stdout, /evidence=verified/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("production release evidence verifier rejects failed launch or unsafe safety facts", async () => {
  await withEvidenceFixture(
    async ({ evidenceFile }) => {
      const failed = await execVerifierFailure([
        `--evidence=${evidenceFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /deployHealth\.canaryStatus must be passed/);
      assert.match(failed.stderr, /operations\.rollbackDrillIncluded must be true/);
      assert.match(failed.stderr, /safety\.noSecretsInEvidence must be true/);
      assert.match(failed.stderr, /safety\.networkExecutedByVerifier must be false/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      deployHealth: {
        canaryStatus: "failed",
      },
      operations: {
        rollbackDrillIncluded: false,
      },
      safety: {
        noSecretsInEvidence: false,
        networkExecutedByVerifier: true,
      },
    },
  );
});

test("production release evidence verifier rejects sensitive evidence without echoing values", async () => {
  await withEvidenceFixture(
    async ({ evidenceFile }) => {
      const failed = await execVerifierFailure([
        `--evidence=${evidenceFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /production release evidence contains unsupported field/);
      assert.match(failed.stderr, /forbidden sensitive production release evidence field/);
      assert.match(failed.stderr, /forbidden sensitive production release evidence value/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      tenantId: "tenant_launch_secret",
      evidenceArtifacts: {
        releaseProvenanceBundle: "secret://smartcs/release",
      },
      operations: {
        webhookSecret: "super_secret_webhook_value",
      },
    },
  );
});

test("production release evidence verifier rejects evidence paths outside the artifact directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-release-evidence-outside-"));
  const evidenceFile = join(dir, "production-release-evidence.json");
  await writeFile(evidenceFile, JSON.stringify(validEvidence(), null, 2), "utf8");

  try {
    const failed = await execVerifierFailure([
      `--evidence=${evidenceFile}`,
      "--require-pass",
    ]);

    assert.match(failed.stderr, /--evidence must be inside production-release-evidence-artifacts/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("production release evidence verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com/release-evidence.json",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function withEvidenceFixture(callback, overrides = {}) {
  await mkdir(artifactRoot, { recursive: true });
  const dir = await mkdtemp(join(artifactRoot, "fixture-"));
  const evidenceFile = join(dir, "production-release-evidence.json");

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
    schemaVersion: "smart-cs-agent.production-release-evidence.v1",
    generatedAt: new Date().toISOString(),
    releaseId: "release-2026-06-07-a",
    source: {
      branch: "codex/wecom-sandbox-after-sales",
      commitSha: "abcdef0123456789abcdef0123456789abcdef01",
    },
    releaseProvenance: {
      status: "passed",
      releaseId: "release-2026-06-07-a",
      imageCount: 2,
      signatureVerified: true,
      provenanceVerified: true,
      sbomAttestationVerified: true,
    },
    launchManifest: {
      status: "passed",
      entryCount: 2,
      channelCount: 2,
      requireRealChannel: true,
      requireProviderReadonly: true,
    },
    deployHealth: {
      migrationStatus: "passed",
      readinessStatus: "passed",
      canaryStatus: "passed",
      alertingStatus: "passed",
      channelRunbookStatus: "passed",
      operatorBootstrapStatus: "passed",
    },
    operations: {
      rollbackOwnerFingerprint: "6a805e005e94",
      incidentOwnerFingerprint: "91d4987b6aa4",
      operatorLeadFingerprint: "626d085d7f2c",
      operatorCoverageMinutes: 60,
      rollbackDrillIncluded: true,
    },
    safety: {
      noRealCommerceWrites: true,
      noCustomerVisibleActions: true,
      noProviderPayloadReads: true,
      noProviderPayloadsInEvidence: true,
      noCustomerDataInEvidence: true,
      noSecretsInEvidence: true,
      noRawTenantIdsInEvidence: true,
      networkExecutedByVerifier: false,
      registryPublishedByVerifier: false,
    },
    evidenceArtifacts: {
      releaseProvenanceBundle: "release-provenance.json",
      launchManifestBundle: "launch-manifest.json",
      readinessSummary: "readiness-summary.json",
      canarySummary: "canary-summary.json",
      rollbackDrillSummary: "rollback-drill-summary.json",
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
    "scripts/verify-production-release-evidence.mjs",
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
    assert.fail(`Expected release evidence verification to fail, got stdout: ${result.stdout}`);
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
