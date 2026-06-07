import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("production release provenance verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Production release provenance verification passed\./);
  assert.match(result.stdout, /evidence=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("production release provenance verifier accepts sanitized pass evidence from safe env mode", async () => {
  await withEvidenceFixture(async ({ evidenceFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_RELEASE_PROVENANCE_FILE: evidenceFile,
      SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS: "true",
    });

    assert.match(result.stdout, /Production release provenance verification passed\./);
    assert.match(result.stdout, /releaseId=release-2026-06-07-a/);
    assert.match(result.stdout, /images=2/);
    assert.match(result.stdout, /evidence=verified/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("production release provenance verifier rejects mutable or unsigned evidence when pass is required", async () => {
  await withEvidenceFixture(
    async ({ evidenceFile }) => {
      const failed = await execVerifierFailure([
        `--evidence=${evidenceFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /images\.api\.digest must be an immutable sha256 digest/);
      assert.match(failed.stderr, /images\.api\.signatureVerified must be true/);
      assert.match(failed.stderr, /productionImageSecurity must be passed/);
      assert.match(failed.stderr, /promotion\.approval must be approved/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      images: {
        api: {
          digest: "latest",
          signatureVerified: false,
        },
      },
      gates: {
        productionImageSecurity: "not_run",
      },
      promotion: {
        approval: "pending",
      },
    },
  );
});

test("production release provenance verifier rejects sensitive evidence without echoing values", async () => {
  await withEvidenceFixture(
    async ({ evidenceFile }) => {
      const failed = await execVerifierFailure([
        `--evidence=${evidenceFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /release provenance evidence contains unsupported field/);
      assert.match(failed.stderr, /forbidden sensitive release provenance field/);
      assert.match(failed.stderr, /forbidden sensitive release provenance value/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      tenantId: "tenant_launch_secret",
      source: {
        repository: "smart-cs-agent",
      },
      promotion: {
        webhookSecret: "super_secret_webhook_value",
      },
      evidenceArtifacts: {
        imageSecurityBundle: "secret://smartcs/bundle",
      },
    },
  );
});

test("production release provenance verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com/provenance.json",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function withEvidenceFixture(callback, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-release-provenance-"));
  const evidenceFile = join(dir, "release-provenance.json");

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
  const digestA =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const digestB =
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  return {
    schemaVersion: "smart-cs-agent.release-provenance.v1",
    generatedAt: new Date().toISOString(),
    releaseId: "release-2026-06-07-a",
    source: {
      repository: "smart-cs-agent",
      branch: "codex/wecom-sandbox-after-sales",
      commitSha: "abcdef0123456789abcdef0123456789abcdef01",
      workflowName: "production release provenance",
      workflowRunId: "run-20260607-001",
    },
    images: {
      api: {
        repository: "registry.example.com/smart-cs-agent/api",
        digest: digestA,
        sbomArtifact: "api.sbom.spdx.json",
        vulnerabilityReport: "api.trivy.json",
        signatureVerified: true,
        provenanceVerified: true,
        sbomAttestationVerified: true,
      },
      web: {
        repository: "registry.example.com/smart-cs-agent/web",
        digest: digestB,
        sbomArtifact: "web.sbom.spdx.json",
        vulnerabilityReport: "web.trivy.json",
        signatureVerified: true,
        provenanceVerified: true,
        sbomAttestationVerified: true,
      },
    },
    gates: {
      productionImageBuilds: "passed",
      productionContainerSmoke: "passed",
      productionImageSecurity: "passed",
    },
    attestations: {
      signerMode: "keyless_oidc",
      provenancePredicate: "slsa-build",
      sbomFormat: "spdx-json",
      buildType: "smart-cs-agent/container-release",
    },
    promotion: {
      sourceEnvironment: "staging",
      targetEnvironment: "production",
      approval: "approved",
      approvedByFingerprint: "6a805e005e94",
      changeTicket: "chg-20260607-a",
    },
    safety: {
      registryPublishedByVerifier: false,
      networkExecutedByVerifier: false,
      secretsInEvidence: false,
      rawTenantIdsInEvidence: false,
      providerPayloadsInEvidence: false,
      customerDataInEvidence: false,
      realCommerceWritesEnabled: false,
      customerVisibleActionsEnabled: false,
      providerPayloadReadsEnabled: false,
    },
    evidenceArtifacts: {
      imageSecurityBundle: "production-image-security-artifacts.zip",
      releaseProvenanceBundle: "release-provenance.json",
      apiSbom: "api.sbom.spdx.json",
      webSbom: "web.sbom.spdx.json",
      apiVulnerabilityReport: "api.trivy.json",
      webVulnerabilityReport: "web.trivy.json",
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
    "scripts/verify-production-release-provenance.mjs",
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
    assert.fail(`Expected release provenance verification to fail, got stdout: ${result.stdout}`);
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
