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
  ".env.example",
  "prisma/schema.prisma",
  "prisma/migrations/20260608011000_pr61_provider_write_execution_attempt_constraints/migration.sql",
  "prisma/migrations/20260608013000_pr62_provider_write_payload_escrow_boundary/migration.sql",
  "prisma/migrations/20260608013500_pr62_provider_write_payload_escrow_cross_field_constraints/migration.sql",
  "apps/api/src/config/api-config.ts",
  "apps/api/src/config/api-config.spec.ts",
  "apps/api/src/ops/ops.service.ts",
  "apps/api/src/ops/ops.service.spec.ts",
  "apps/web/src/app/api/operator/provider-writes/requests/route.ts",
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

test("provider write payload escrow boundary verifier passes repository checks", async () => {
  const result = await execVerifier();

  assert.match(
    result.stdout,
    /Provider write payload escrow boundary verification passed\./,
  );
  assert.strictEqual(result.stderr, "");
});

test("provider write payload escrow boundary verifier rejects missing config and CI wiring", async () => {
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
      config.replace(/PROVIDER_WRITE_PAYLOAD_ESCROW_MODE/g, "REMOVED_ESCROW_MODE"),
      "utf8",
    );

    const workflow = await readFile(workflowPath, "utf8");
    await writeFile(
      workflowPath,
      workflow.replace(
        "node --test scripts/verify-provider-write-payload-escrow-boundary.test.mjs",
        "",
      ),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_PAYLOAD_ESCROW_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /api config escrow mode: missing PROVIDER_WRITE_PAYLOAD_ESCROW_MODE/,
    );
    assert.match(
      failed.stderr,
      /static CI wiring: missing node --test scripts\/verify-provider-write-payload-escrow-boundary\.test\.mjs/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("provider write payload escrow boundary verifier rejects unsafe execution changes", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const opsServicePath = join(fixtureRoot, "apps/api/src/ops/ops.service.ts");

  try {
    const opsService = await readFile(opsServicePath, "utf8");
    await writeFile(
      opsServicePath,
      opsService.replace(
        "return this.persistProviderWriteExecutionAttempt(",
        "await adapter.issueCoupon();\n    decrypt();\n    return this.persistProviderWriteExecutionAttempt(",
      ),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_PAYLOAD_ESCROW_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /execution boundary no provider writes: unexpectedly contains \.issueCoupon\(/,
    );
    assert.match(
      failed.stderr,
      /execution boundary no provider writes: unexpectedly contains decrypt/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("provider write payload escrow boundary verifier rejects loosened attempt constraints and raw payload storage", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const pr61MigrationPath = join(
    fixtureRoot,
    "prisma/migrations/20260608011000_pr61_provider_write_execution_attempt_constraints/migration.sql",
  );
  const schemaPath = join(fixtureRoot, "prisma/schema.prisma");

  try {
    const pr61Migration = await readFile(pr61MigrationPath, "utf8");
    await writeFile(
      pr61MigrationPath,
      pr61Migration.replace(
        '"payloadEscrowStatus" = \'not_stored\'',
        '"payloadEscrowStatus" IN (\'not_stored\', \'sealed_metadata\')',
      ),
      "utf8",
    );

    const schema = await readFile(schemaPath, "utf8");
    await writeFile(
      schemaPath,
      schema.replace(
        "payloadEscrowEnvelopeFingerprint String?",
        "payloadEscrowEnvelopeFingerprint String?\n  rawProviderPayload String?",
      ),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_PAYLOAD_ESCROW_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /execution attempt constraints: missing "payloadEscrowStatus" = 'not_stored'/,
    );
    assert.match(
      failed.stderr,
      /provider write request schema unsafe fields: unexpectedly contains rawProviderPayload/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("provider write payload escrow boundary verifier rejects missing request escrow consistency constraint", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const consistencyMigrationPath = join(
    fixtureRoot,
    "prisma/migrations/20260608013500_pr62_provider_write_payload_escrow_cross_field_constraints/migration.sql",
  );

  try {
    const consistencyMigration = await readFile(consistencyMigrationPath, "utf8");
    await writeFile(
      consistencyMigrationPath,
      consistencyMigration.replace(
        'CONSTRAINT "ProviderWriteRequest_payload_escrow_consistency_chk"',
        'CONSTRAINT "ProviderWriteRequest_payload_escrow_unbound_chk"',
      ),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_PAYLOAD_ESCROW_REPO_ROOT: fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /provider write request escrow consistency migration: missing CONSTRAINT "ProviderWriteRequest_payload_escrow_consistency_chk"/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

async function execVerifier(env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-payload-escrow-boundary.mjs",
  ], { env: { ...process.env, ...env } });
}

async function execVerifierFailure(env = {}) {
  try {
    const result = await execVerifier(env);
    assert.fail(`Expected provider write payload escrow verifier to fail: ${result.stdout}`);
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
    join(tmpdir(), "smartcs-provider-write-payload-escrow-"),
  );

  for (const relativePath of verifierFixtureFiles) {
    const source = join(repoRoot, relativePath);
    const target = join(fixtureRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(source, "utf8"), "utf8");
  }

  return fixtureRoot;
}
