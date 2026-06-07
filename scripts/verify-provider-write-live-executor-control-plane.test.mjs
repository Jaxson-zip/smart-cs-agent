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
  ".github/workflows/production-static-gates.yml",
  "packages/shared/src/ops-contracts.ts",
  "apps/api/src/config/api-config.ts",
  "apps/api/src/config/api-config.service.ts",
  "apps/api/src/config/api-config.spec.ts",
  "apps/api/src/ops/ops.service.ts",
  "apps/api/src/ops/ops.service.spec.ts",
  "apps/api/src/ops/ops.controller.ts",
  "apps/api/src/ops/ops.controller.spec.ts",
  "apps/web/src/app/api/operator/provider-writes/live-executor/status/route.ts",
  "apps/web/src/app/api/operator/operator-bff.spec.ts",
  "docs/deploy/provider-write-requests.md",
  "docs/deploy/production-readiness.md",
  "docs/deploy/production-launch-runbook.md",
  "docs/deploy/public-api-surface.md",
  "scripts/verify-production-static-ci.mjs",
  "scripts/verify-production-launch.mjs",
  "task_plan.md",
  "progress.md",
];

test("provider write live executor control-plane verifier passes repository checks", async () => {
  const result = await execVerifier();

  assert.match(
    result.stdout,
    /Provider write live executor control-plane verification passed\./,
  );
  assert.strictEqual(result.stderr, "");
});

test("provider write live executor control-plane verifier rejects missing routes and CI wiring", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const apiControllerPath = join(fixtureRoot, "apps/api/src/ops/ops.controller.ts");
  const bffRoutePath = join(
    fixtureRoot,
    "apps/web/src/app/api/operator/provider-writes/live-executor/status/route.ts",
  );
  const workflowPath = join(
    fixtureRoot,
    ".github/workflows/production-static-gates.yml",
  );

  try {
    const apiController = await readFile(apiControllerPath, "utf8");
    await writeFile(
      apiControllerPath,
      apiController.replace("provider-writes/live-executor/status", "provider-writes/live-executor/removed"),
      "utf8",
    );

    await writeFile(bffRoutePath, "export async function GET() { return Response.json({}); }\n", "utf8");

    const workflow = await readFile(workflowPath, "utf8");
    await writeFile(
      workflowPath,
      workflow.replace(
        "node --test scripts/verify-provider-write-live-executor-control-plane.test.mjs",
        "",
      ),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_LIVE_EXECUTOR_CONTROL_PLANE_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /api controller live executor control-plane route: missing provider-writes\/live-executor\/status/,
    );
    assert.match(
      failed.stderr,
      /web bff live executor control-plane route: missing ProviderWriteLiveExecutorStatusSchema/,
    );
    assert.match(
      failed.stderr,
      /static CI wiring: missing node --test scripts\/verify-provider-write-live-executor-control-plane\.test\.mjs/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("provider write live executor control-plane verifier rejects unsafe control-plane output and execution code", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const bffRoutePath = join(
    fixtureRoot,
    "apps/web/src/app/api/operator/provider-writes/live-executor/status/route.ts",
  );
  const opsServicePath = join(fixtureRoot, "apps/api/src/ops/ops.service.ts");

  try {
    const bffRoute = await readFile(bffRoutePath, "utf8");
    await writeFile(
      bffRoutePath,
      bffRoute.replace(
        '"providerpayload",',
        "",
      ),
      "utf8",
    );

    const opsService = await readFile(opsServicePath, "utf8");
    await writeFile(
      opsServicePath,
      opsService.replace(
        "this.apiConfig?.getProviderWriteLiveExecutorStatus()",
        "providerWriteLiveExecutorStatus(process.env);\n    await adapter.issueCoupon();\n    providerMutationExecuted: true;\n    decrypt();\n    this.apiConfig?.getProviderWriteLiveExecutorStatus()",
      ),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_LIVE_EXECUTOR_CONTROL_PLANE_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /web bff live executor unsafe field guard: missing providerpayload/,
    );
    assert.match(
      failed.stderr,
      /control-plane execution boundary no live provider writes: unexpectedly contains \.issueCoupon\(/,
    );
    assert.match(
      failed.stderr,
      /control-plane execution boundary no live provider writes: unexpectedly contains decrypt/,
    );
    assert.match(
      failed.stderr,
      /ops service status no raw config reads: unexpectedly contains providerWriteLiveExecutorStatus\(/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

async function execVerifier(env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-live-executor-control-plane.mjs",
  ], { env: { ...process.env, ...env } });
}

async function execVerifierFailure(env = {}) {
  try {
    const result = await execVerifier(env);
    assert.fail(`Expected provider write live executor control-plane verifier to fail: ${result.stdout}`);
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
    join(tmpdir(), "smartcs-provider-write-live-executor-control-plane-"),
  );

  for (const relativePath of verifierFixtureFiles) {
    const source = join(repoRoot, relativePath);
    const target = join(fixtureRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(source, "utf8"), "utf8");
  }

  return fixtureRoot;
}
