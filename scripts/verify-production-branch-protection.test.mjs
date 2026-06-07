import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const artifactRoot = join(process.cwd(), "production-branch-protection-artifacts");

test("production branch protection verifier passes static checks without policy evidence", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Production branch protection verification passed\./);
  assert.match(result.stdout, /policy=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("production branch protection verifier accepts sanitized protected-main policy from safe env mode", async () => {
  await withPolicyFixture(async ({ policyFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE: policyFile,
      SMARTCS_PRODUCTION_BRANCH_PROTECTION_REQUIRE_PASS: "true",
    });

    assert.match(result.stdout, /Production branch protection verification passed\./);
    assert.match(result.stdout, /defaultBranch=main/);
    assert.match(result.stdout, /policy=verified/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("production branch protection verifier rejects weak required checks and review controls", async () => {
  await withPolicyFixture(
    async ({ policyFile }) => {
      const failed = await execVerifierFailure([
        `--policy=${policyFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /requiredStatusChecks\.strict must be true/);
      assert.match(failed.stderr, /requiredStatusChecks\.contexts must include Static production gates/);
      assert.match(failed.stderr, /pullRequestReviews\.requiredApprovingReviewCount must be at least 1/);
      assert.match(failed.stderr, /pullRequestReviews\.dismissStaleReviews must be true/);
      assert.match(failed.stderr, /mergePolicy\.allowForcePushes must be false/);
      assert.match(failed.stderr, /mergePolicy\.bypassActors must be empty/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      requiredStatusChecks: {
        strict: false,
        contexts: ["Some other check"],
      },
      pullRequestReviews: {
        requiredApprovingReviewCount: 0,
        dismissStaleReviews: false,
      },
      mergePolicy: {
        allowForcePushes: true,
        bypassActors: ["release-admin"],
      },
    },
  );
});

test("production branch protection verifier rejects sensitive policy evidence without echoing values", async () => {
  await withPolicyFixture(
    async ({ policyFile }) => {
      const failed = await execVerifierFailure([
        `--policy=${policyFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /production branch protection contains unsupported field/);
      assert.match(failed.stderr, /forbidden sensitive production branch protection field/);
      assert.match(failed.stderr, /forbidden sensitive production branch protection value/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      githubToken: "ghp_actual_provider_token_must_not_leak",
      repository: {
        installationToken: "github_pat_plain_secret_token_must_not_leak",
      },
      safety: {
        secretsInEvidence: true,
      },
    },
  );
});

test("production branch protection verifier rejects non-ISO generated timestamps", async () => {
  await withPolicyFixture(
    async ({ policyFile }) => {
      const failed = await execVerifierFailure([
        `--policy=${policyFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /generatedAt must be an ISO timestamp/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      generatedAt: "June 7 2026",
    },
  );
});

test("production branch protection verifier rejects policy paths outside the artifact directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-branch-protection-outside-"));
  const policyFile = join(dir, "production-branch-protection.json");
  await writeFile(policyFile, JSON.stringify(validPolicy(), null, 2), "utf8");

  try {
    const failed = await execVerifierFailure([
      `--policy=${policyFile}`,
      "--require-pass",
    ]);

    assert.match(failed.stderr, /--policy must be inside production-branch-protection-artifacts/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("production branch protection verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com/branch-protection.json",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function withPolicyFixture(callback, overrides = {}) {
  await mkdir(artifactRoot, { recursive: true });
  const dir = await mkdtemp(join(artifactRoot, "fixture-"));
  const policyFile = join(dir, "production-branch-protection.json");

  try {
    await writeFile(
      policyFile,
      JSON.stringify(deepMerge(validPolicy(), overrides), null, 2),
      "utf8",
    );
    await callback({ dir, policyFile });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validPolicy() {
  return {
    schemaVersion: "smart-cs-agent.production-branch-protection.v1",
    generatedAt: new Date().toISOString(),
    repository: {
      repositoryFingerprint: "6a805e005e94",
      defaultBranch: "main",
    },
    protectedBranches: ["main"],
    requiredStatusChecks: {
      strict: true,
      contexts: ["Static production gates"],
    },
    pullRequestReviews: {
      required: true,
      requiredApprovingReviewCount: 1,
      dismissStaleReviews: true,
      requireCodeOwnerReviews: true,
      requireLastPushApproval: true,
    },
    mergePolicy: {
      requireConversationResolution: true,
      requireLinearHistory: true,
      allowForcePushes: false,
      allowDeletions: false,
      bypassActors: [],
    },
    safety: {
      secretsInEvidence: false,
      rawTokensInEvidence: false,
      githubApiCalledByVerifier: false,
      branchProtectionMutatedByVerifier: false,
      productionDeploymentTriggered: false,
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
    "scripts/verify-production-branch-protection.mjs",
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
    assert.fail(`Expected branch protection verification to fail, got stdout: ${result.stdout}`);
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
    "ghp_",
    "github_pat_",
    "user:secret",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
