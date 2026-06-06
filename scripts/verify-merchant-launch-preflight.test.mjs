import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("merchant launch preflight passes with sanitized evidence", async () => {
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
    async (envFile) => {
      const result = await execPreflight([
        `--env-file=${envFile}`,
        "--tenant=tenant_launch_secret",
        "--channel=taobao",
        "--require-real-channel",
        "--require-provider-readonly",
      ]);

      assert.match(result.stdout, /Merchant launch preflight passed\./);
      assert.match(result.stdout, /tenantFingerprint=/);
      assert.match(result.stdout, /channel=taobao/);
      assert.match(result.stdout, /webhookSecretConfigured=true/);
      assert.match(result.stdout, /providerCredentialConfigured=true/);
      assert.strictEqual(result.stderr, "");
      assert.ok(!result.stdout.includes("tenant_launch_secret"));
      assert.ok(!result.stdout.includes("secret://smartcs"));
      assert.ok(!result.stdout.includes("actual_provider_token_must_not_leak"));
    },
  );
});

test("merchant launch preflight reads launch target from safe env mode", async () => {
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
    async (envFile) => {
      const result = await execPreflight(["--from-env"], {
        SMARTCS_LAUNCH_CHANNEL: "taobao",
        SMARTCS_LAUNCH_ENV_FILE: envFile,
        SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY: "true",
        SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL: "true",
        SMARTCS_LAUNCH_TENANT: "tenant_launch_secret",
      });

      assert.match(result.stdout, /Merchant launch preflight passed\./);
      assert.match(result.stdout, /tenantFingerprint=/);
      assert.match(result.stdout, /channel=taobao/);
      assert.strictEqual(result.stderr, "");
      assert.ok(!result.stdout.includes("tenant_launch_secret"));
      assert.ok(!result.stdout.includes("secret://smartcs"));
      assert.ok(!result.stdout.includes("production_operator_key"));
    },
  );
});

test("merchant launch preflight fails when real-channel pair is not allowlisted", async () => {
  await withEnvFile(
    productionEnv({
      REAL_CHANNEL_WEBHOOKS_ENABLED: "true",
      REAL_CHANNEL_WEBHOOK_ALLOWLIST: JSON.stringify([
        { channel: "douyin", tenantId: "tenant_launch_secret" },
      ]),
    }),
    async (envFile) => {
      const failed = await execPreflightFailure([
        `--env-file=${envFile}`,
        "--tenant=tenant_launch_secret",
        "--channel=taobao",
        "--require-real-channel",
      ]);

      assert.match(
        failed.stderr,
        /Target tenant\/channel pair must be present in REAL_CHANNEL_WEBHOOK_ALLOWLIST/,
      );
      assert.ok(!failed.stderr.includes("tenant_launch_secret"));
      assert.ok(!failed.stderr.includes("super_secret_webhook_value"));
    },
  );
});

test("merchant launch preflight fails when readonly credential inventory is missing the ref", async () => {
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
    async (envFile) => {
      const failed = await execPreflightFailure([
        `--env-file=${envFile}`,
        "--tenant=tenant_launch_secret",
        "--channel=taobao",
        "--require-provider-readonly",
      ]);

      assert.match(
        failed.stderr,
        /Provider readonly credential ref must be listed in PROVIDER_CREDENTIALS/,
      );
      assert.ok(!failed.stderr.includes("tenant_launch_secret"));
      assert.ok(!failed.stderr.includes("secret://smartcs"));
    },
  );
});

test("merchant launch preflight redacts unknown argument values", async () => {
  const failed = await execPreflightFailure([
    "--tenant=tenant_launch_secret",
    "--channel=taobao",
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assert.ok(!failed.stderr.includes("actual_provider_token_must_not_leak"));
  assert.ok(!failed.stderr.includes("plain_secret_token_must_not_leak"));
  assert.ok(!failed.stderr.includes("tenant_launch_secret"));
  assert.ok(!failed.stderr.includes("user:secret"));
});

async function withEnvFile(values, callback) {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-preflight-"));
  const envFile = join(dir, "production.env");
  await writeFile(
    envFile,
    Object.entries(values)
      .map(([key, value]) => `${key}=${formatEnvValue(value)}`)
      .join("\n"),
    "utf8",
  );

  try {
    await callback(envFile);
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

async function execPreflight(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-merchant-launch-preflight.mjs",
    ...args,
  ], {
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function execPreflightFailure(args) {
  try {
    const result = await execPreflight(args);
    assert.fail(`Expected preflight to fail, got stdout: ${result.stdout}`);
  } catch (error) {
    assert.notStrictEqual(error.code, 0);
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}
