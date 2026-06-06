import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("production image security verifier passes static checks without Docker", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Production image security verification passed\./);
  assert.match(result.stdout, /dockerScans=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("production image security verifier invokes SBOM and vulnerability scans for API and Web images", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-image-security-"));
  const logFile = join(dir, "docker.log");
  const artifactsDir = join(dir, "artifacts");
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
      `--artifacts-dir=${artifactsDir}`,
    ], {
      SMARTCS_DOCKER_BIN: dockerCmd,
      SMARTCS_IMAGE_SECURITY_SKIP_ARTIFACTS: "true",
    });
    const dockerLog = await readFile(logFile, "utf8");

    assert.match(result.stdout, /dockerScans=completed/);
    assert.match(dockerLog, /run --rm/);
    assert.match(dockerLog, /anchore\/syft:latest/);
    assert.match(dockerLog, /aquasec\/trivy:latest/);
    assert.match(dockerLog, /spdx-json=\/artifacts\/api\.sbom\.spdx\.json/);
    assert.match(dockerLog, /spdx-json=\/artifacts\/web\.sbom\.spdx\.json/);
    assert.match(dockerLog, /--format json --output \/artifacts\/api\.trivy\.json/);
    assert.match(dockerLog, /--format json --output \/artifacts\/web\.trivy\.json/);
    assert.match(dockerLog, /--severity HIGH,CRITICAL/);
    assert.match(dockerLog, /smart-cs-agent-api:test/);
    assert.match(dockerLog, /smart-cs-agent-web:test/);
    assert.doesNotMatch(dockerLog, /docker login|docker push|--push|secrets\./);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}\n${dockerLog}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("production image security verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=plain_secret_token_must_not_leak",
    "https://user:secret@example.com",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("production image security verifier rejects unsafe image tags and scanner images without echoing them", async () => {
  const failed = await execVerifierFailure([
    "--api-tag=secret://smartcs/token",
    "--web-tag=actual_provider_token_must_not_leak",
    "--syft-image=https://user:secret@example.com/syft",
    "--trivy-image=secret://scanner/token",
  ]);

  assert.match(failed.stderr, /--api-tag must be a safe local image tag/);
  assert.match(failed.stderr, /--web-tag must be a safe local image tag/);
  assert.match(failed.stderr, /--syft-image must be a safe scanner image reference/);
  assert.match(failed.stderr, /--trivy-image must be a safe scanner image reference/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-production-image-security.mjs",
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
    assert.fail(`Expected image security verification to fail, got stdout: ${result.stdout}`);
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
    "secret://scanner",
    "user:secret",
    "OPERATOR_API_KEYS=",
    "REAL_CHANNEL_WEBHOOK_SECRETS=",
    "PROVIDER_CREDENTIALS=",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
