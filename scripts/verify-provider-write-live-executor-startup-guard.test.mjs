import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const verifierFixtureFiles = [
  "package.json",
  ".env.example",
  "apps/api/src/config/api-config.ts",
  "apps/api/src/config/api-config.spec.ts",
  "apps/api/src/ops/ops.service.ts",
  "docs/deploy/provider-write-requests.md",
  "docs/deploy/production-readiness.md",
  "docs/deploy/production-launch-runbook.md",
  ".github/workflows/production-static-gates.yml",
  "scripts/verify-production-static-ci.mjs",
  "scripts/verify-production-launch.mjs",
  "task_plan.md",
  "progress.md",
];

test("provider write live executor startup guard verifier passes repository checks", async () => {
  const result = await execVerifier();

  assert.match(
    result.stdout,
    /Provider write live executor startup guard verification passed\./,
  );
  assert.strictEqual(result.stderr, "");
});

test("provider write live executor startup guard verifier rejects missing config and CI wiring", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const configPath = join(fixtureRoot, "apps/api/src/config/api-config.ts");
  const workflowPath = join(
    fixtureRoot,
    ".github/workflows/production-static-gates.yml",
  );

  try {
    const config = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      config.replace(/PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED/g, "REMOVED_LIVE_EXECUTOR"),
      "utf8",
    );

    const workflow = await readFile(workflowPath, "utf8");
    await writeFile(
      workflowPath,
      workflow.replace(
        "node --test scripts/verify-provider-write-live-executor-startup-guard.test.mjs",
        "",
      ),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_LIVE_EXECUTOR_GUARD_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /api config live executor guard: missing PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED/,
    );
    assert.match(
      failed.stderr,
      /static CI wiring: missing node --test scripts\/verify-provider-write-live-executor-startup-guard\.test\.mjs/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("provider write live executor startup guard verifier rejects unsafe execution code", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const opsServicePath = join(fixtureRoot, "apps/api/src/ops/ops.service.ts");

  try {
    const opsService = await readFile(opsServicePath, "utf8");
    await writeFile(
      opsServicePath,
      opsService.replace(
        "return this.persistProviderWriteExecutionAttempt(",
        "await adapter.changeAddress();\n    providerMutationExecuted: true;\n    decrypt();\n    return this.persistProviderWriteExecutionAttempt(",
      ),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_LIVE_EXECUTOR_GUARD_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /execution boundary no live provider writes: unexpectedly contains \.changeAddress\(/,
    );
    assert.match(
      failed.stderr,
      /execution boundary no live provider writes: unexpectedly contains providerMutationExecuted: true/,
    );
    assert.match(
      failed.stderr,
      /execution boundary no live provider writes: unexpectedly contains decrypt/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

async function execVerifier(env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-live-executor-startup-guard.mjs",
  ], { env: { ...process.env, ...env } });
}

async function execVerifierFailure(env = {}) {
  try {
    const result = await execVerifier(env);
    assert.fail(`Expected provider write live executor guard verifier to fail: ${result.stdout}`);
  } catch (error) {
    assert.notStrictEqual(error.code, 0);
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

async function copyVerifierFixture() {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "smartcs-provider-write-live-executor-guard-"),
  );

  for (const relativePath of verifierFixtureFiles) {
    const source = join(repoRoot, relativePath);
    const target = join(fixtureRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(source, "utf8"), "utf8");
  }

  return fixtureRoot;
}
