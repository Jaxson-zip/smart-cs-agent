import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("production image build verifier passes static checks without Docker", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Production image build verification passed\./);
  assert.match(result.stdout, /dockerBuilds=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("production image build verifier invokes API and Web Docker builds", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-image-build-"));
  const logFile = join(dir, "docker.log");
  const dockerCmd = join(dir, "docker.cmd");
  await writeFile(
    dockerCmd,
    `@echo off\r\necho %*>>"${logFile}"\r\nexit /b 0\r\n`,
    "utf8",
  );

  try {
    const result = await execVerifier([
      "--docker",
      "--api-tag=smart-cs-agent-api:test",
      "--web-tag=smart-cs-agent-web:test",
    ], {
      PATH: `${dir};${process.env.PATH ?? ""}`,
      Path: `${dir};${process.env.Path ?? ""}`,
      SMARTCS_DOCKER_BIN: dockerCmd,
    });
    const dockerLog = await readFile(logFile, "utf8");

    assert.match(result.stdout, /dockerBuilds=completed/);
    assert.match(dockerLog, /build --pull=false --file apps\/api\/Dockerfile --tag smart-cs-agent-api:test \./);
    assert.match(dockerLog, /build --pull=false --file apps\/web\/Dockerfile --tag smart-cs-agent-web:test \./);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}\n${dockerLog}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("production image build verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=plain_secret_token_must_not_leak",
    "https://user:secret@example.com",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("production image build verifier rejects unsafe image tags without echoing them", async () => {
  const failed = await execVerifierFailure([
    "--api-tag=secret://smartcs/token",
    "--web-tag=actual_provider_token_must_not_leak",
  ]);

  assert.match(failed.stderr, /--api-tag must be a safe local image tag/);
  assert.match(failed.stderr, /--web-tag must be a safe local image tag/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-production-image-builds.mjs",
    ...args,
  ], {
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function execVerifierFailure(args) {
  try {
    const result = await execVerifier(args);
    assert.fail(`Expected image build verification to fail, got stdout: ${result.stdout}`);
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
    "plain_secret_token_must_not_leak",
    "actual_provider_token_must_not_leak",
    "secret://smartcs",
    "user:secret",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
