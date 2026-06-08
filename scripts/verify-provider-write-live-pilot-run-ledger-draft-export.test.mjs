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
  "packages/shared/src/ops-contracts.ts",
  "apps/api/src/ops/ops.service.ts",
  "apps/api/src/ops/ops.service.spec.ts",
  "apps/api/src/ops/ops.controller.ts",
  "apps/api/src/ops/ops.controller.spec.ts",
  "apps/web/src/app/api/operator/provider-writes/live-pilot-run-ledger/draft/route.ts",
  "apps/web/src/app/api/operator/operator-bff.spec.ts",
  "docs/deploy/provider-write-live-pilot-run-ledger.md",
  "docs/deploy/provider-write-requests.md",
  "docs/deploy/production-readiness.md",
  "docs/deploy/public-api-surface.md",
  "docs/deploy/production-launch-runbook.md",
  ".github/workflows/production-static-gates.yml",
  "scripts/verify-production-static-ci.mjs",
  "scripts/verify-production-launch.mjs",
  "task_plan.md",
  "progress.md",
];

test("provider write live pilot run ledger draft export verifier passes repository checks", async () => {
  const result = await execVerifier();

  assert.match(
    result.stdout,
    /Provider write live pilot run ledger draft export verification passed\./,
  );
  assert.strictEqual(result.stderr, "");
});

test("provider write live pilot run ledger draft export verifier rejects missing route and CI wiring", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const bffRoutePath = join(
    fixtureRoot,
    "apps/web/src/app/api/operator/provider-writes/live-pilot-run-ledger/draft/route.ts",
  );
  const workflowPath = join(
    fixtureRoot,
    ".github/workflows/production-static-gates.yml",
  );

  try {
    await writeFile(bffRoutePath, "export async function GET() { return Response.json({}); }\n", "utf8");
    const workflow = await readFile(workflowPath, "utf8");
    await writeFile(
      workflowPath,
      workflow.replace(
        "node --test scripts/verify-provider-write-live-pilot-run-ledger-draft-export.test.mjs",
        "",
      ),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_DRAFT_EXPORT_REPO_ROOT:
        fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /web bff draft route: missing ProviderWriteLivePilotRunLedgerDraftSchema/,
    );
    assert.match(
      failed.stderr,
      /static CI wiring: missing node --test scripts\/verify-provider-write-live-pilot-run-ledger-draft-export\.test\.mjs/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("provider write live pilot run ledger draft export verifier rejects pass-shaped draft contracts", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const sharedPath = join(fixtureRoot, "packages/shared/src/ops-contracts.ts");
  const servicePath = join(fixtureRoot, "apps/api/src/ops/ops.service.ts");

  try {
    const shared = await readFile(sharedPath, "utf8");
    await writeFile(
      sharedPath,
      shared
        .replace("canPassPr69SafeLedger: z.literal(false)", "canPassPr69SafeLedger: z.literal(true)")
        .replace("readyForSafeLedger: z.literal(false)", "readyForSafeLedger: z.literal(true)"),
      "utf8",
    );

    const service = await readFile(servicePath, "utf8");
    await writeFile(
      servicePath,
      service
        .replace("canPassPr69SafeLedger: false", "canPassPr69SafeLedger: true")
        .replace("readyForSafeLedger: false", "readyForSafeLedger: true"),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_DRAFT_EXPORT_REPO_ROOT:
        fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /shared draft contract: missing canPassPr69SafeLedger: z\.literal\(false\)/,
    );
    assert.match(
      failed.stderr,
      /shared draft contract unsafe pass shape: unexpectedly contains canPassPr69SafeLedger: z\.literal\(true\)/,
    );
    assert.match(
      failed.stderr,
      /shared draft contract: missing readyForSafeLedger: z\.literal\(false\)/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("provider write live pilot run ledger draft export verifier rejects live side effects and unsafe passthrough", async () => {
  const fixtureRoot = await copyVerifierFixture();
  const servicePath = join(fixtureRoot, "apps/api/src/ops/ops.service.ts");
  const bffRoutePath = join(
    fixtureRoot,
    "apps/web/src/app/api/operator/provider-writes/live-pilot-run-ledger/draft/route.ts",
  );

  try {
    const service = await readFile(servicePath, "utf8");
    await writeFile(
      servicePath,
      service.replace(
        "const requestEntries = await Promise.all(",
        "adapter.issueCoupon();\n    providerMutationExecuted: true;\n    credentialResolver;\n    const requestEntries = await Promise.all(",
      ),
      "utf8",
    );

    const bffRoute = await readFile(bffRoutePath, "utf8");
    await writeFile(
      bffRoutePath,
      bffRoute
        .replace('    "providerpayload",\n', "")
        .replace("return NextResponse.json(toProviderWriteLivePilotRunLedgerDraft(body));", "return NextResponse.json(body);"),
      "utf8",
    );

    const failed = await execVerifierFailure({
      SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_DRAFT_EXPORT_REPO_ROOT:
        fixtureRoot,
    });

    assert.match(
      failed.stderr,
      /api service draft export no live side effects: unexpectedly contains \.issueCoupon\(/,
    );
    assert.match(
      failed.stderr,
      /api service draft export no live side effects: unexpectedly contains credentialResolver/,
    );
    assert.match(
      failed.stderr,
      /web bff draft route: missing providerpayload/,
    );
    assert.match(
      failed.stderr,
      /web bff draft route no unsafe passthrough: unexpectedly contains NextResponse\.json\(body\)/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

async function execVerifier(env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-provider-write-live-pilot-run-ledger-draft-export.mjs",
  ], { env: { ...process.env, ...env } });
}

async function execVerifierFailure(env = {}) {
  try {
    const result = await execVerifier(env);
    assert.fail(`Expected provider write live pilot run ledger draft export verifier to fail: ${result.stdout}`);
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
    join(tmpdir(), "smartcs-provider-write-live-pilot-run-ledger-draft-export-"),
  );

  for (const relativePath of verifierFixtureFiles) {
    const source = join(repoRoot, relativePath);
    const target = join(fixtureRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(source, "utf8"), "utf8");
  }

  return fixtureRoot;
}
