import assert from "node:assert";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const provenanceRoot = join(process.cwd(), "production-release-provenance-artifacts");
const releaseEvidenceRoot = join(process.cwd(), "production-release-evidence-artifacts");
const changeApprovalRoot = join(process.cwd(), "production-change-approval-artifacts");
const launchManifestRoot = join(process.cwd(), "launch-manifest-artifacts");

test("production launch binding verifier passes static checks without evidence", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Production launch binding verification passed\./);
  assert.match(result.stdout, /binding=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("production launch binding verifier accepts matching sanitized artifacts from safe env mode", async () => {
  await withBindingFixture(async ({ files, hashes }) => {
    const result = await execVerifier(["--from-env"], envFor(files, hashes));

    assert.match(result.stdout, /Production launch binding verification passed\./);
    assert.match(result.stdout, /releaseId=release-2099-06-07-a/);
    assert.match(result.stdout, /binding=verified/);
    assert.match(result.stdout, /artifactHashes=verified/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("production launch binding verifier rejects cross-artifact release or ticket mismatch", async () => {
  await withBindingFixture(
    async ({ files, hashes }) => {
      const failed = await execVerifierFailure(["--from-env"], envFor(files, hashes));

      assert.match(failed.stderr, /releaseId binding mismatch/);
      assert.match(failed.stderr, /change ticket binding mismatch/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      releaseEvidence: {
        releaseId: "release-2099-06-07-b",
      },
      changeApproval: {
        approvals: {
          changeTicket: "chg-20990607-b",
        },
      },
    },
  );
});

test("production launch binding verifier rejects staging target or expired approval window", async () => {
  await withBindingFixture(
    async ({ files, hashes }) => {
      const failed = await execVerifierFailure(["--from-env"], envFor(files, hashes));

      assert.match(failed.stderr, /promotion.targetEnvironment must be production/);
      assert.match(failed.stderr, /changeWindow.targetEnvironment must be production/);
      assert.match(failed.stderr, /change approval window must not be expired/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      releaseProvenance: {
        promotion: {
          targetEnvironment: "staging",
        },
      },
      changeApproval: {
        changeWindow: {
          targetEnvironment: "staging",
          windowStart: "2020-06-07T12:00:00.000Z",
          windowEnd: "2020-06-07T13:00:00.000Z",
        },
      },
    },
  );
});

test("production launch binding verifier rejects source, ticket, and artifact basename gaps", async () => {
  await withBindingFixture(
    async ({ files, hashes }) => {
      const failed = await execVerifierFailure(["--from-env"], envFor(files, hashes));

      assert.match(failed.stderr, /release provenance source branch is required/);
      assert.match(failed.stderr, /release provenance source commit is required/);
      assert.match(failed.stderr, /change ticket is required/);
      assert.match(failed.stderr, /release evidence artifact binding mismatch/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      releaseProvenance: {
        source: {
          branch: undefined,
          commitSha: undefined,
        },
        promotion: {
          changeTicket: undefined,
        },
      },
      changeApproval: {
        approvals: {
          changeTicket: undefined,
        },
        evidenceArtifacts: {
          releaseEvidenceBundle: "different-production-release-evidence.json",
        },
      },
    },
  );
});

test("production launch binding verifier rejects same-count manifest scope swaps", async () => {
  await withBindingFixture(
    async ({ files, hashes }) => {
      const failed = await execVerifierFailure(["--from-env"], envFor(files, hashes));

      assert.match(failed.stderr, /launch manifest scope binding mismatch/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      releaseEvidence: {
        launchManifest: {
          scopeHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      },
    },
  );
});

test("production launch binding verifier rejects sensitive fields and values", async () => {
  await withBindingFixture(
    async ({ files, hashes }) => {
      const failed = await execVerifierFailure(["--from-env"], envFor(files, hashes));

      assert.match(failed.stderr, /forbidden sensitive production launch binding field/);
      assert.match(failed.stderr, /forbidden sensitive production launch binding value/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      releaseEvidence: {
        tenantId: "tenant_launch_secret",
      },
      changeApproval: {
        approvals: {
          webhookSecret: "super_secret_webhook_value",
        },
      },
    },
  );
});

test("production launch binding verifier rejects artifact hash mismatch without echoing values", async () => {
  await withBindingFixture(async ({ files, hashes }) => {
    const failed = await execVerifierFailure(["--from-env"], {
      ...envFor(files, hashes),
      SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_SHA256:
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    });

    assert.match(failed.stderr, /productionReleaseEvidence hash mismatch/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  });
});

test("production launch binding verifier requires all artifact hashes when pass is required", async () => {
  await withBindingFixture(async ({ files }) => {
    const failed = await execVerifierFailure(["--from-env"], {
      SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_FILE: files.releaseProvenance,
      SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_FILE:
        files.productionReleaseEvidence,
      SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_FILE:
        files.productionChangeApproval,
      SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_FILE: files.launchManifest,
      SMARTCS_PRODUCTION_LAUNCH_BINDING_REQUIRE_PASS: "true",
    });

    assert.match(failed.stderr, /all production launch binding artifact hashes are required/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  });
});

test("production launch binding verifier rejects symlinked artifact files", async (t) => {
  await mkdir(provenanceRoot, { recursive: true });
  const outsideDir = await mkdtemp(join(tmpdir(), "smartcs-binding-symlink-outside-"));
  const insideDir = await mkdtemp(join(provenanceRoot, "symlink-"));
  const outsideFile = join(outsideDir, "release-provenance.json");
  const symlinkFile = join(insideDir, "release-provenance.json");
  await writeFile(outsideFile, JSON.stringify(validReleaseProvenance(), null, 2), "utf8");

  try {
    try {
      await symlink(outsideFile, symlinkFile);
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        t.skip("symlink creation is not permitted in this Windows environment");
        return;
      }
      throw error;
    }
    const failed = await execVerifierFailure([
      `--release-provenance=${symlinkFile}`,
      "--require-pass",
    ]);

    assert.match(failed.stderr, /Release provenance path must not be a symbolic link/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
    await rm(insideDir, { recursive: true, force: true });
  }
});

test("production launch binding verifier rejects unsafe paths and unknown args without leaking values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-binding-outside-"));
  const outsideFile = join(dir, "release-provenance.json");
  await writeFile(outsideFile, JSON.stringify(validReleaseProvenance(), null, 2), "utf8");

  try {
    const failed = await execVerifierFailure([
      `--release-provenance=${outsideFile}`,
      "--unknown=actual_provider_token_must_not_leak",
      "https://user:secret@example.com/binding.json",
      "--require-pass",
    ]);

    assert.match(failed.stderr, /--release-provenance must be inside production-release-provenance-artifacts/);
    assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
    assert.match(failed.stderr, /Unknown argument: <redacted>/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function withBindingFixture(callback, overrides = {}) {
  await mkdir(provenanceRoot, { recursive: true });
  await mkdir(releaseEvidenceRoot, { recursive: true });
  await mkdir(changeApprovalRoot, { recursive: true });
  await mkdir(launchManifestRoot, { recursive: true });

  const provenanceDir = await mkdtemp(join(provenanceRoot, "binding-"));
  const releaseEvidenceDir = await mkdtemp(join(releaseEvidenceRoot, "binding-"));
  const changeApprovalDir = await mkdtemp(join(changeApprovalRoot, "binding-"));
  const manifestDir = await mkdtemp(join(launchManifestRoot, "binding-"));

  const files = {
    releaseProvenance: join(provenanceDir, "release-provenance.json"),
    productionReleaseEvidence: join(releaseEvidenceDir, "production-release-evidence.json"),
    productionChangeApproval: join(changeApprovalDir, "production-change-approval.json"),
    launchManifest: join(manifestDir, "launch-manifest.json"),
  };

  try {
    const documents = {
      releaseProvenance: deepMerge(validReleaseProvenance(), overrides.releaseProvenance ?? {}),
      productionReleaseEvidence: deepMerge(
        validProductionReleaseEvidence(),
        overrides.releaseEvidence ?? {},
      ),
      productionChangeApproval: deepMerge(
        validProductionChangeApproval(),
        overrides.changeApproval ?? {},
      ),
      launchManifest: deepMerge(validLaunchManifest(), overrides.launchManifest ?? {}),
    };

    const hashes = {};
    for (const [key, file] of Object.entries(files)) {
      const content = JSON.stringify(documents[key], null, 2);
      await writeFile(file, content, "utf8");
      hashes[key] = sha256(content);
    }

    await callback({ files, hashes });
  } finally {
    await rm(provenanceDir, { recursive: true, force: true });
    await rm(releaseEvidenceDir, { recursive: true, force: true });
    await rm(changeApprovalDir, { recursive: true, force: true });
    await rm(manifestDir, { recursive: true, force: true });
  }
}

function envFor(files, hashes) {
  return {
    SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_FILE: files.releaseProvenance,
    SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_FILE:
      files.productionReleaseEvidence,
    SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_FILE:
      files.productionChangeApproval,
    SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_FILE: files.launchManifest,
    SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_SHA256:
      hashes.releaseProvenance,
    SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_SHA256:
      hashes.productionReleaseEvidence,
    SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_SHA256:
      hashes.productionChangeApproval,
    SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_SHA256: hashes.launchManifest,
    SMARTCS_PRODUCTION_LAUNCH_BINDING_REQUIRE_PASS: "true",
  };
}

function validReleaseProvenance() {
  return {
    schemaVersion: "smart-cs-agent.release-provenance.v1",
    generatedAt: "2099-06-07T11:00:00.000Z",
    releaseId: "release-2099-06-07-a",
    source: {
      repository: "smart-cs-agent",
      branch: "codex/wecom-sandbox-after-sales",
      commitSha: "abcdef0123456789abcdef0123456789abcdef01",
      workflowName: "production release provenance",
      workflowRunId: "run-20990607-001",
    },
    images: {},
    gates: {},
    attestations: {},
    promotion: {
      sourceEnvironment: "staging",
      targetEnvironment: "production",
      approval: "approved",
      approvedByFingerprint: "6a805e005e94",
      changeTicket: "chg-20990607-a",
    },
    safety: {
      secretsInEvidence: false,
    },
    evidenceArtifacts: {
      releaseProvenanceBundle: "release-provenance.json",
    },
  };
}

function validProductionReleaseEvidence() {
  return {
    schemaVersion: "smart-cs-agent.production-release-evidence.v1",
    generatedAt: "2099-06-07T12:30:00.000Z",
    releaseId: "release-2099-06-07-a",
    source: {
      branch: "codex/wecom-sandbox-after-sales",
      commitSha: "abcdef0123456789abcdef0123456789abcdef01",
    },
    releaseProvenance: {
      status: "passed",
      releaseId: "release-2099-06-07-a",
      imageCount: 2,
      signatureVerified: true,
      provenanceVerified: true,
      sbomAttestationVerified: true,
    },
    launchManifest: {
      status: "passed",
      entryCount: 2,
      channelCount: 2,
      scopeHash: manifestScopeHash(validLaunchManifest()),
      requireRealChannel: true,
      requireProviderReadonly: true,
    },
    deployHealth: {},
    operations: {
      rollbackOwnerFingerprint: "6a805e005e94",
      incidentOwnerFingerprint: "91d4987b6aa4",
      operatorLeadFingerprint: "626d085d7f2c",
      operatorCoverageMinutes: 60,
      rollbackDrillIncluded: true,
    },
    safety: {
      noSecretsInEvidence: true,
    },
    evidenceArtifacts: {
      releaseProvenanceBundle: "release-provenance.json",
      launchManifestBundle: "launch-manifest.json",
    },
  };
}

function validProductionChangeApproval() {
  return {
    schemaVersion: "smart-cs-agent.production-change-approval.v1",
    generatedAt: "2099-06-07T11:30:00.000Z",
    releaseId: "release-2099-06-07-a",
    changeWindow: {
      targetEnvironment: "production",
      windowStart: "2099-06-07T12:00:00.000Z",
      windowEnd: "2099-06-07T13:00:00.000Z",
      expectedDurationMinutes: 60,
      freezeWindowConfirmed: true,
    },
    approvals: {
      approvalStatus: "approved",
      approvedAt: "2099-06-07T11:40:00.000Z",
      changeTicket: "chg-20990607-a",
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
    riskControls: {},
    communications: {},
    safety: {
      secretsInEvidence: false,
    },
    evidenceArtifacts: {
      changeApprovalBundle: "production-change-approval.json",
      releaseEvidenceBundle: "production-release-evidence.json",
    },
  };
}

function validLaunchManifest() {
  return {
    schemaVersion: "smart-cs-agent.launch-manifest.v1",
    generatedAt: "2099-06-07T11:45:00.000Z",
    releaseId: "release-2099-06-07-a",
    requirements: {
      requirePass: true,
      requireProviderReadonly: true,
      requireRealChannel: true,
    },
    entries: [
      {
        tenantFingerprint: "6a805e005e94",
        channel: "taobao",
        evidenceFile: "6a805e005e94-taobao.json",
      },
      {
        tenantFingerprint: "91d4987b6aa4",
        channel: "douyin",
        evidenceFile: "91d4987b6aa4-douyin.json",
      },
    ],
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function manifestScopeHash(manifest) {
  const normalized = manifest.entries
    .map((entry) => ({
      tenantFingerprint: entry.tenantFingerprint,
      channel: entry.channel,
      evidenceFile: entry.evidenceFile,
    }))
    .sort((a, b) =>
      `${a.tenantFingerprint}:${a.channel}:${a.evidenceFile}`.localeCompare(
        `${b.tenantFingerprint}:${b.channel}:${b.evidenceFile}`,
      ),
    );
  return sha256(JSON.stringify(normalized));
}

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-production-launch-binding.mjs",
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
    assert.fail(`Expected launch binding verification to fail, got stdout: ${result.stdout}`);
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
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
