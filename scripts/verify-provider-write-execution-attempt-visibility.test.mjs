import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const verifierFixtureFiles = [
  "package.json",
  "packages/shared/src/ops-contracts.ts",
  "prisma/migrations/20260608011000_pr61_provider_write_execution_attempt_constraints/migration.sql",
  "apps/api/src/ops/ops.controller.ts",
  "apps/api/src/ops/ops.service.ts",
  "apps/api/src/ops/ops.service.spec.ts",
  "apps/api/src/ops/ops.controller.spec.ts",
  "apps/web/src/app/api/operator/provider-writes/execution-attempts/route.ts",
  "apps/web/src/app/api/operator/operator-bff.spec.ts",
  "docs/deploy/provider-write-requests.md",
  "docs/deploy/provider-adapter-contracts.md",
  "docs/deploy/production-readiness.md",
  "docs/deploy/public-api-surface.md",
  "docs/deploy/production-launch-runbook.md",
  ".github/workflows/production-static-gates.yml",
  "scripts/verify-production-static-ci.mjs",
  "scripts/verify-production-launch.mjs",
  "task_plan.md",
  "progress.md",
];

test("provider write execution attempt visibility verifier passes repository checks", async () => {
  const result = await execVerifier();

  assert.match(
    result.stdout,
    /Provider write execution attempt visibility verification passed\./,
  );
  assert.strictEqual(result.stderr, "");
});

test("provider write execution attempt visibility verifier rejects missing route and CI wiring", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const workflowPath = join(
    fixtureRoot,
    ".github/workflows/production-static-gates.yml",
  );

  try {
    const workflow = await readFile(workflowPath, "utf8");
    await writeFile(
      workflowPath,
      workflow.replace(
        "node --test scripts/verify-provider-write-execution-attempt-visibility.test.mjs",
        "",
      ),
      "utf8",
    );
    await writeFile(
      join(
        fixtureRoot,
        "apps/web/src/app/api/operator/provider-writes/execution-attempts/route.ts",
      ),
      "export async function GET() { return Response.json([]); }\n",
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_EXECUTION_ATTEMPT_VISIBILITY_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /static CI wiring: missing node --test scripts\/verify-provider-write-execution-attempt-visibility\.test\.mjs/,
    );
    assert.match(
      failed.stderr,
      /web bff execution attempt list route: missing ProviderWriteExecutionAttemptListItemSchema/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("provider write execution attempt visibility verifier rejects unsafe migration operations", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const migrationPath = join(
    fixtureRoot,
    "prisma/migrations/20260608011000_pr61_provider_write_execution_attempt_constraints/migration.sql",
  );

  try {
    const migration = await readFile(migrationPath, "utf8");
    await writeFile(
      migrationPath,
      `${migration}\nDROP TABLE "ProviderWriteExecutionAttempt" CASCADE;\n`,
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_EXECUTION_ATTEMPT_VISIBILITY_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /constraints migration unsafe operations: unexpectedly contains CASCADE/,
    );
    assert.match(
      failed.stderr,
      /constraints migration unsafe operations: unexpectedly contains DROP TABLE/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("provider write execution attempt visibility verifier rejects operator-visible free text in list output", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const sharedPath = join(fixtureRoot, "packages/shared/src/ops-contracts.ts");
  const servicePath = join(fixtureRoot, "apps/api/src/ops/ops.service.ts");
  const bffPath = join(
    fixtureRoot,
    "apps/web/src/app/api/operator/provider-writes/execution-attempts/route.ts",
  );

  try {
    const shared = await readFile(sharedPath, "utf8");
    await writeFile(
      sharedPath,
      shared.replace(
        "policyReason: z.string().nullable(),",
        "operatorVisibleResult: z.string(),\n    policyReason: z.string().nullable(),",
      ),
      "utf8",
    );

    const service = await readFile(servicePath, "utf8");
    await writeFile(
      servicePath,
      service.replace(
        "policyReason: attempt.policyReason ?? null,",
        "operatorVisibleResult: attempt.operatorVisibleResult,\n    policyReason: attempt.policyReason ?? null,",
      ),
      "utf8",
    );

    const bff = await readFile(bffPath, "utf8");
    await writeFile(
      bffPath,
      bff.replace('    "operatorvisibleresult",\n', ""),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_EXECUTION_ATTEMPT_VISIBILITY_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /shared execution attempt list unsafe exposure: unexpectedly contains operatorVisibleResult/,
    );
    assert.match(
      failed.stderr,
      /ops service list unsafe exposure: unexpectedly contains operatorVisibleResult:/,
    );
    assert.match(
      failed.stderr,
      /web bff execution attempt list route: missing operatorvisibleresult/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

async function execVerifier(env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-execution-attempt-visibility.mjs",
  ], { env: { ...process.env, ...env } });
}

async function execVerifierFailure(env = {}) {
  try {
    const result = await execVerifier(env);
    assert.fail(`Expected provider write execution visibility verifier to fail: ${result.stdout}`);
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
    join(tmpdir(), "smartcs-provider-write-execution-attempt-visibility-"),
  );

  for (const relativePath of verifierFixtureFiles) {
    const source = join(repoRoot, relativePath);
    const target = join(fixtureRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(source, "utf8"), "utf8");
  }

  return fixtureRoot;
}
