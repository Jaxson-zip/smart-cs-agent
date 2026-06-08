import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workflowFixtureRoot = join(process.cwd(), ".github", "workflows");

test("production static CI verifier passes repository workflow checks", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Production static CI verification passed\./);
  assert.strictEqual(result.stderr, "");
});

test("production static CI verifier rejects unsafe workflow content", async () => {
  await withWorkflowFixture(
    ".static-ci-unsafe-",
    [
      "name: unsafe",
      "permissions:",
      "  contents: write",
      "  id-token: write",
      "jobs:",
      "  unsafe:",
      "    steps:",
      "      - uses: docker/login-action@v3",
      "      - run: npm run verify:production-readiness -- --env-file=prod.env",
      "      - run: npm run verify:production-canary -- --api=https://example.com",
      "      - run: node scripts/verify-production-canary.mjs --api=https://example.com",
      "      - run: npm run demo:real-channel-smoke -- --secret=actual_provider_token_must_not_leak",
      "      - run: npm run db:migrate:deploy",
      "      - run: npm run verify:production-image-builds:docker",
      "      - run: docker login registry.example.com",
      "      - run: curl -sS https://example.com/health?token=actual_provider_token_must_not_leak",
      "      - run: echo ${{ secrets.OPERATOR_API_KEYS }}",
      "      - env:",
      "          PROVIDER_TOKEN: actual_provider_token_must_not_leak",
      "        run: npm ci",
    ].join("\n"),
    async (workflowFile) => {
      const failed = await execVerifierFailure([`--workflow=${workflowFile}`]);

      assert.match(failed.stderr, /workflow must not request write permissions/);
      assert.match(failed.stderr, /workflow must not use secrets context/);
      assert.match(
        failed.stderr,
        /workflow must not reference sensitive environment or credential names/,
      );
      assert.match(failed.stderr, /workflow action allowlist: contains unapproved action/);
      assert.match(failed.stderr, /workflow must not run environment-bound production commands/);
      assert.match(failed.stderr, /workflow must not run deployment or registry commands/);
      assert.match(failed.stderr, /workflow run command allowlist: contains unapproved run command/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
  );
});

test("production static CI verifier rejects direct production script and Docker-backed commands", async () => {
  await withWorkflowFixture(
    ".static-ci-direct-",
    [
      "name: smart-cs-agent production static gates",
      "on:",
      "  pull_request:",
      "  push:",
      "  workflow_dispatch:",
      "permissions:",
      "  contents: read",
      "jobs:",
      "  static-gates:",
      "    steps:",
      "      - run: npm run verify:production-image-builds:docker",
      "      - run: node scripts/verify-production-readiness.mjs --env-file=prod.env",
      "      - run: node scripts/demo/real-channel-webhook-smoke.mjs --secret=actual_provider_token_must_not_leak",
    ].join("\n"),
    async (workflowFile) => {
      const failed = await execVerifierFailure([`--workflow=${workflowFile}`]);

      assert.match(failed.stderr, /workflow must not run environment-bound production commands/);
      assert.match(failed.stderr, /workflow run command allowlist: contains unapproved run command/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
  );
});

test("production static CI verifier rejects workflow paths outside .github/workflows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-static-ci-outside-"));
  const workflowFile = join(dir, "production-static-gates.yml");
  await writeFile(workflowFile, "name: unsafe\n", "utf8");

  try {
    const failed = await execVerifierFailure([`--workflow=${workflowFile}`]);

    assert.match(failed.stderr, /--workflow must be inside \.github\/workflows/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("production static CI verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
    "https://user:secret@example.com/workflow.yml",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-production-static-ci.mjs",
    ...args,
  ], {
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function withWorkflowFixture(prefix, content, callback) {
  await mkdir(workflowFixtureRoot, { recursive: true });
  const dir = await mkdtemp(join(workflowFixtureRoot, prefix));
  const workflowFile = join(dir, "production-static-gates.yml");
  await writeFile(workflowFile, content, "utf8");

  try {
    await callback(workflowFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function execVerifierFailure(args, env = {}) {
  try {
    const result = await execVerifier(args, env);
    assert.fail(`Expected static CI verification to fail, got stdout: ${result.stdout}`);
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
    "user:secret",
    "OPERATOR_API_KEYS }}",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
