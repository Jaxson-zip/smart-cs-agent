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
  "prisma/schema.prisma",
  "prisma/migrations/20260608033000_pr66_provider_write_kill_switch_control_plane/migration.sql",
  "apps/api/src/ops/ops.service.ts",
  "apps/api/src/ops/ops.service.spec.ts",
  "apps/api/src/ops/ops.controller.ts",
  "apps/api/src/ops/ops.controller.spec.ts",
  "apps/web/src/app/api/operator/provider-writes/kill-switch/status/route.ts",
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

test("provider write kill switch control-plane verifier passes repository checks", async () => {
  const result = await execVerifier();

  assert.match(
    result.stdout,
    /Provider write kill switch control-plane verification passed\./,
  );
  assert.strictEqual(result.stderr, "");
});

test("provider write kill switch control-plane verifier rejects missing routes and CI wiring", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const apiControllerPath = join(fixtureRoot, "apps/api/src/ops/ops.controller.ts");
  const bffRoutePath = join(
    fixtureRoot,
    "apps/web/src/app/api/operator/provider-writes/kill-switch/status/route.ts",
  );
  const workflowPath = join(
    fixtureRoot,
    ".github/workflows/production-static-gates.yml",
  );

  try {
    const apiController = await readFile(apiControllerPath, "utf8");
    await writeFile(
      apiControllerPath,
      apiController.replaceAll(
        "provider-writes/kill-switch/status",
        "provider-writes/kill-switch/removed",
      ),
      "utf8",
    );

    await writeFile(
      bffRoutePath,
      "export async function GET() { return Response.json({}); }\n",
      "utf8",
    );

    const workflow = await readFile(workflowPath, "utf8");
    await writeFile(
      workflowPath,
      workflow.replace(
        "node --test scripts/verify-provider-write-kill-switch-control-plane.test.mjs",
        "",
      ),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_KILL_SWITCH_CONTROL_PLANE_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /api controller kill-switch routes: missing provider-writes\/kill-switch\/status/,
    );
    assert.match(
      failed.stderr,
      /web bff kill-switch route: missing ProviderWriteKillSwitchStatusSchema/,
    );
    assert.match(
      failed.stderr,
      /static CI wiring: missing node --test scripts\/verify-provider-write-kill-switch-control-plane\.test\.mjs/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("provider write kill switch control-plane verifier rejects unsafe persistence and BFF output", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const migrationPath = join(
    fixtureRoot,
    "prisma/migrations/20260608033000_pr66_provider_write_kill_switch_control_plane/migration.sql",
  );
  const bffRoutePath = join(
    fixtureRoot,
    "apps/web/src/app/api/operator/provider-writes/kill-switch/status/route.ts",
  );

  try {
    const migration = await readFile(migrationPath, "utf8");
    await writeFile(
      migrationPath,
      migration.replace(
        "\"stateFingerprint\" TEXT NOT NULL,",
        "\"stateFingerprint\" TEXT NOT NULL,\n    \"providerPayload\" TEXT,\n    \"idempotencyKey\" TEXT,",
      ),
      "utf8",
    );

    const bffRoute = await readFile(bffRoutePath, "utf8");
    await writeFile(
      bffRoutePath,
      bffRoute.replace('"providerpayload",', ""),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_KILL_SWITCH_CONTROL_PLANE_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /migration no raw provider\/customer fields: unexpectedly contains "idempotencyKey"/,
    );
    assert.match(
      failed.stderr,
      /migration no raw provider\/customer fields: unexpectedly contains "providerPayload"/,
    );
    assert.match(
      failed.stderr,
      /web bff kill-switch unsafe field guard: missing providerpayload/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("provider write kill switch control-plane verifier rejects provider writes and secret access in execution slices", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const opsServicePath = join(fixtureRoot, "apps/api/src/ops/ops.service.ts");

  try {
    const opsService = await readFile(opsServicePath, "utf8");
    await writeFile(
      opsServicePath,
      opsService.replace(
        "const emergencyStopEngaged = await this.providerWriteEmergencyStopEngaged",
        "await adapter.issueCoupon();\n    decrypt();\n    providerMutationExecuted: true;\n    const emergencyStopEngaged = await this.providerWriteEmergencyStopEngaged",
      ),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_KILL_SWITCH_CONTROL_PLANE_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /execution emergency stop block no provider writes or secret access: unexpectedly contains \.issueCoupon\(/,
    );
    assert.match(
      failed.stderr,
      /execution emergency stop block no provider writes or secret access: unexpectedly contains decrypt/,
    );
    assert.match(
      failed.stderr,
      /execution emergency stop block no provider writes or secret access: unexpectedly contains providerMutationExecuted: true/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

async function execVerifier(env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-kill-switch-control-plane.mjs",
  ], { env: { ...process.env, ...env } });
}

async function execVerifierFailure(env = {}) {
  try {
    const result = await execVerifier(env);
    assert.fail(
      `Expected provider write kill switch control-plane verifier to fail: ${result.stdout}`,
    );
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
    join(tmpdir(), "smartcs-provider-write-kill-switch-control-plane-"),
  );

  for (const relativePath of verifierFixtureFiles) {
    const source = join(repoRoot, relativePath);
    const target = join(fixtureRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(source, "utf8"), "utf8");
  }

  return fixtureRoot;
}
