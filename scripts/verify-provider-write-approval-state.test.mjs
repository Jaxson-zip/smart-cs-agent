import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const verifierFixtureFiles = [
  "package.json",
  "packages/shared/src/ops-contracts.ts",
  "prisma/schema.prisma",
  "prisma/migrations/20260607230000_pr59_provider_write_approval_state/migration.sql",
  "docs/deploy/provider-write-requests.md",
  "docs/deploy/provider-adapter-contracts.md",
  "docs/deploy/production-readiness.md",
  "docs/deploy/public-api-surface.md",
  "docs/deploy/production-launch-runbook.md",
  ".github/workflows/production-static-gates.yml",
  "scripts/verify-production-static-ci.mjs",
  "scripts/verify-production-launch.mjs",
  "apps/api/src/ops/ops.controller.ts",
  "apps/api/src/ops/ops.service.ts",
  "apps/api/src/ops/ops.service.spec.ts",
  "apps/api/src/ops/ops.controller.spec.ts",
  "apps/web/src/app/api/operator/provider-writes/requests/route.ts",
  "apps/web/src/app/api/operator/provider-writes/requests/[id]/approve/route.ts",
  "apps/web/src/app/api/operator/provider-writes/requests/[id]/reject/route.ts",
  "apps/web/src/app/api/operator/operator-bff.spec.ts",
  "task_plan.md",
  "progress.md",
];

test("provider write approval state verifier passes repository checks", async () => {
  const result = await execVerifier();

  assert.match(
    result.stdout,
    /Provider write approval state verification passed\./,
  );
  assert.strictEqual(result.stderr, "");
});

test("provider write approval state verifier rejects missing approval route and CI wiring", async () => {
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
        "node --test scripts/verify-provider-write-approval-state.test.mjs",
        "",
      ),
      "utf8",
    );
    await writeFile(
      join(
        fixtureRoot,
        "apps/web/src/app/api/operator/provider-writes/requests/[id]/approve/route.ts",
      ),
      "export async function POST() { return Response.json({}); }\n",
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_APPROVAL_STATE_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /static CI wiring: missing node --test scripts\/verify-provider-write-approval-state\.test\.mjs/,
    );
    assert.match(
      failed.stderr,
      /web bff approval routes: missing ProviderWriteApprovalRequestSchema\.safeParse/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

async function execVerifier(env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-approval-state.mjs",
  ], { env: { ...process.env, ...env } });
}

async function execVerifierFailure(env = {}) {
  try {
    const result = await execVerifier(env);
    assert.fail(`Expected provider write approval verifier to fail: ${result.stdout}`);
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
    join(tmpdir(), "smartcs-provider-write-approval-state-"),
  );

  for (const relativePath of verifierFixtureFiles) {
    const source = join(repoRoot, relativePath);
    const target = join(fixtureRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(source, "utf8"), "utf8");
  }

  return fixtureRoot;
}
