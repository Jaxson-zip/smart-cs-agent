import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("launch evidence bundle writes sanitized JSON for a ready merchant", async () => {
  await withEnvFile(
    productionEnv({
      REAL_CHANNEL_WEBHOOKS_ENABLED: "true",
      PROVIDER_READONLY_ADAPTERS: JSON.stringify([
        {
          channel: "taobao",
          tenantId: "tenant_launch_secret",
          credentialRef: "secret://smartcs/taobao/tenant_launch_secret",
        },
      ]),
      PROVIDER_CREDENTIALS: JSON.stringify([
        {
          credentialRef: "secret://smartcs/taobao/tenant_launch_secret",
        },
      ]),
    }),
    async ({ envFile, dir }) => {
      const outFile = join(dir, "launch-evidence.json");
      const result = await execEvidence([
        `--env-file=${envFile}`,
        "--tenant=tenant_launch_secret",
        "--channel=taobao",
        "--require-real-channel",
        "--require-provider-readonly",
        `--out=${outFile}`,
      ]);

      assert.match(result.stdout, /Launch evidence bundle generated\./);
      assert.strictEqual(result.stderr, "");
      const bundleText = await readFile(outFile, "utf8");
      const bundle = JSON.parse(bundleText);

      assert.strictEqual(bundle.schemaVersion, "smart-cs-agent.launch-evidence.v1");
      assert.strictEqual(bundle.summary.status, "pass");
      assert.strictEqual(bundle.target.channel, "taobao");
      assert.match(bundle.target.tenantFingerprint, /^[a-f0-9]{12}$/);
      assert.ok(bundle.checks.some((item) => item.name === "merchantLaunchPreflight" && item.status === "pass"));
      assert.ok(bundle.checks.some((item) => item.name === "productionReadinessStatic" && item.status === "pass"));
      assert.ok(bundle.checks.some((item) => item.name === "providerSafetyBoundary" && item.status === "pass"));

      assertNoSecretMarkers(`${result.stdout}\n${result.stderr}\n${bundleText}`);
    },
  );
});

test("launch evidence bundle reads launch target from safe env mode", async () => {
  await withEnvFile(
    productionEnv({
      REAL_CHANNEL_WEBHOOKS_ENABLED: "true",
      PROVIDER_READONLY_ADAPTERS: JSON.stringify([
        {
          channel: "taobao",
          tenantId: "tenant_launch_secret",
          credentialRef: "secret://smartcs/taobao/tenant_launch_secret",
        },
      ]),
      PROVIDER_CREDENTIALS: JSON.stringify([
        {
          credentialRef: "secret://smartcs/taobao/tenant_launch_secret",
        },
      ]),
    }),
    async ({ envFile, dir }) => {
      const outFile = join(dir, "safe-launch-evidence.json");
      const result = await execEvidence(["--from-env"], {
        SMARTCS_LAUNCH_CHANNEL: "taobao",
        SMARTCS_LAUNCH_ENV_FILE: envFile,
        SMARTCS_LAUNCH_EVIDENCE_OUT: outFile,
        SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY: "true",
        SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL: "true",
        SMARTCS_LAUNCH_TENANT: "tenant_launch_secret",
      });

      assert.match(result.stdout, /Launch evidence bundle generated\./);
      assert.match(result.stdout, /outputWritten=true/);
      const bundleText = await readFile(outFile, "utf8");
      const bundle = JSON.parse(bundleText);
      assert.strictEqual(bundle.summary.status, "pass");
      assert.strictEqual(bundle.target.channel, "taobao");
      assertNoSecretMarkers(`${result.stdout}\n${result.stderr}\n${bundleText}`);
    },
  );
});

test("launch evidence bundle fails closed without leaking missing credential refs", async () => {
  await withEnvFile(
    productionEnv({
      PROVIDER_READONLY_ADAPTERS: JSON.stringify([
        {
          channel: "taobao",
          tenantId: "tenant_launch_secret",
          credentialRef: "secret://smartcs/taobao/tenant_launch_secret",
        },
      ]),
      PROVIDER_CREDENTIALS: JSON.stringify([]),
    }),
    async ({ envFile, dir }) => {
      const outFile = join(dir, "failed-launch-evidence.json");
      const failed = await execEvidenceFailure([
        `--env-file=${envFile}`,
        "--tenant=tenant_launch_secret",
        "--channel=taobao",
        "--require-provider-readonly",
        `--out=${outFile}`,
      ]);

      assert.match(failed.stderr, /Launch evidence generation failed/);
      const bundleText = await readFile(outFile, "utf8");
      const bundle = JSON.parse(bundleText);
      assert.strictEqual(bundle.summary.status, "fail");
      assert.ok(
        bundle.checks.some(
          (item) =>
            item.name === "providerReadonlyPreflight" &&
            item.status === "fail",
        ),
      );
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}\n${bundleText}`);
    },
  );
});

test("launch evidence bundle redacts unknown argument values", async () => {
  const failed = await execEvidenceFailure([
    "--tenant=tenant_launch_secret",
    "--channel=taobao",
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("launch evidence bundle redacts invalid channel values", async () => {
  const failed = await execEvidenceFailure([
    "--tenant=tenant_launch_secret",
    "--channel=customer_phone_13800138000_must_not_leak",
  ]);
  const bundle = JSON.parse(failed.stdout);

  assert.strictEqual(bundle.summary.status, "fail");
  assert.strictEqual(bundle.target.channel, null);
  assert.match(failed.stderr, /--channel must be a supported commerce channel/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("launch evidence bundle refuses to overwrite existing output files", async () => {
  await withEnvFile(productionEnv(), async ({ envFile, dir }) => {
    const outFile = join(dir, "existing-launch-evidence.json");
    await writeFile(outFile, "existing evidence", "utf8");

    const failed = await execEvidenceFailure([
      `--env-file=${envFile}`,
      "--tenant=tenant_launch_secret",
      "--channel=taobao",
      `--out=${outFile}`,
    ]);

    assert.strictEqual(failed.stdout, "");
    assert.match(failed.stderr, /Output file must not already exist/);
    assert.strictEqual(await readFile(outFile, "utf8"), "existing evidence");
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  });
});

async function withEnvFile(values, callback) {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-evidence-"));
  const envFile = join(dir, "production.env");
  await writeFile(
    envFile,
    Object.entries(values)
      .map(([key, value]) => `${key}=${formatEnvValue(value)}`)
      .join("\n"),
    "utf8",
  );

  try {
    await callback({ envFile, dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function formatEnvValue(value) {
  if (typeof value === "string" && value.trim().startsWith("[")) {
    return `'${value}'`;
  }
  return JSON.stringify(value);
}

function productionEnv(overrides = {}) {
  return {
    NODE_ENV: "production",
    WEB_ORIGIN: "https://app.example.invalid",
    API_URL: "https://api.example.invalid",
    DATABASE_URL: "postgresql://user:pass@db.example.invalid:5432/smartcs",
    WECOM_SANDBOX_ENABLED: "false",
    REAL_CHANNEL_WEBHOOKS_ENABLED: "false",
    REAL_CHANNEL_WEBHOOK_KILL_SWITCH: "false",
    REAL_CHANNEL_WEBHOOK_SECRETS: JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_launch_secret",
        secret: "super_secret_webhook_value_123456789",
      },
    ]),
    REAL_CHANNEL_WEBHOOK_ALLOWLIST: JSON.stringify([
      { channel: "taobao", tenantId: "tenant_launch_secret" },
    ]),
    REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS: "300",
    REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: "60",
    CHANNEL_QUEUE_PENDING_WARN_THRESHOLD: "10",
    CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS: "900",
    CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD: "0",
    CHANNEL_QUEUE_STALE_AFTER_MINUTES: "15",
    OPERATOR_IDENTITY_PROVIDER: "database",
    OPERATOR_ACCOUNT_SOURCE: "database",
    OPERATOR_SESSION_SECRET: "long_session_secret_for_production_checks_123",
    OPERATOR_API_KEYS: JSON.stringify([
      {
        key: "production_operator_key_123456789",
        tenantId: "tenant_launch_secret",
        operatorId: "admin_1",
        role: "admin",
      },
    ]),
    PROVIDER_READONLY_ADAPTERS: JSON.stringify([]),
    PROVIDER_CREDENTIALS: JSON.stringify([]),
    ...overrides,
  };
}

async function execEvidence(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/generate-launch-evidence.mjs",
    ...args,
  ], {
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function execEvidenceFailure(args) {
  try {
    const result = await execEvidence(args);
    assert.fail(`Expected evidence generation to fail, got stdout: ${result.stdout}`);
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
    "tenant_launch_secret",
    "secret://smartcs",
    "super_secret_webhook_value",
    "production_operator_key",
    "actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "customer_phone_13800138000_must_not_leak",
    "user:secret",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
