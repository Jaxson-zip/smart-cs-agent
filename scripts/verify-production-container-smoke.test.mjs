import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("production container smoke verifier passes static checks without Docker", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Production container smoke verification passed\./);
  assert.match(result.stdout, /dockerSmoke=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("production container smoke verifier starts API and Web smoke containers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-container-smoke-"));
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
      "--api-port=45101",
      "--web-port=45102",
    ], {
      SMARTCS_CONTAINER_SMOKE_SKIP_HTTP: "true",
      SMARTCS_DOCKER_BIN: dockerCmd,
    });
    const dockerLog = await readFile(logFile, "utf8");

    assert.match(result.stdout, /dockerSmoke=completed/);
    assert.match(dockerLog, /network create smartcs-smoke-/);
    assert.match(dockerLog, /run --detach --rm --name smartcs-smoke-postgres-/);
    assert.match(dockerLog, /POSTGRES_HOST_AUTH_METHOD=trust/);
    assert.match(dockerLog, /run --detach --rm --name smartcs-smoke-api-/);
    assert.match(dockerLog, /--publish 127\.0\.0\.1:45101:4100/);
    assert.match(dockerLog, /DATABASE_URL=postgresql:\/\/smartcs_smoke@smartcs-smoke-postgres-/);
    assert.match(dockerLog, /WECOM_SANDBOX_ENABLED=false/);
    assert.match(dockerLog, /REAL_CHANNEL_WEBHOOKS_ENABLED=false/);
    assert.match(dockerLog, /REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true/);
    assert.match(dockerLog, /ALLOW_INSECURE_OPERATOR_HEADERS=false/);
    assert.match(dockerLog, /SMART_CS_LOAD_DOTENV=false/);
    assert.match(dockerLog, /smart-cs-agent-api:test/);
    assert.match(dockerLog, /run --detach --rm --name smartcs-smoke-web-/);
    assert.match(dockerLog, /--publish 127\.0\.0\.1:45102:3000/);
    assert.match(dockerLog, /API_URL=http:\/\/smartcs-smoke-api-/);
    assert.match(dockerLog, /NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=false/);
    assert.match(dockerLog, /smart-cs-agent-web:test/);
    assert.match(dockerLog, /rm -f smartcs-smoke-web-/);
    assert.match(dockerLog, /rm -f smartcs-smoke-api-/);
    assert.match(dockerLog, /rm -f smartcs-smoke-postgres-/);
    assert.match(dockerLog, /network rm smartcs-smoke-/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}\n${dockerLog}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("production container smoke verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=plain_secret_token_must_not_leak",
    "https://user:secret@example.com",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("production container smoke verifier rejects unsafe image tags without echoing them", async () => {
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
    "scripts/verify-production-container-smoke.mjs",
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
    assert.fail(`Expected container smoke verification to fail, got stdout: ${result.stdout}`);
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
    "OPERATOR_API_KEYS=",
    "REAL_CHANNEL_WEBHOOK_SECRETS=",
    "PROVIDER_CREDENTIALS=",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
