import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("launch evidence archive verifier accepts a sanitized passing bundle", async () => {
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
      await execFileAsync(process.execPath, [
        "scripts/generate-launch-evidence.mjs",
        "--from-env",
      ], {
        env: {
          ...process.env,
          SMARTCS_LAUNCH_CHANNEL: "taobao",
          SMARTCS_LAUNCH_ENV_FILE: envFile,
          SMARTCS_LAUNCH_EVIDENCE_OUT: outFile,
          SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY: "true",
          SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL: "true",
          SMARTCS_LAUNCH_TENANT: "tenant_launch_secret",
        },
      });

      const result = await execArchive([
        `--file=${outFile}`,
        "--require-pass",
        "--require-real-channel",
        "--require-provider-readonly",
      ]);

      assert.match(result.stdout, /Launch evidence archive verification passed\./);
      assert.match(result.stdout, /status=pass/);
      assert.match(result.stdout, /checks=5/);
      assert.strictEqual(result.stderr, "");
      assertNoSecretMarkers(`${result.stdout}\n${result.stderr}\n${await readFile(outFile, "utf8")}`);
    },
  );
});

test("launch evidence archive verifier reads archive target from safe env mode", async () => {
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
      await execFileAsync(process.execPath, [
        "scripts/generate-launch-evidence.mjs",
        "--from-env",
      ], {
        env: {
          ...process.env,
          SMARTCS_LAUNCH_CHANNEL: "taobao",
          SMARTCS_LAUNCH_ENV_FILE: envFile,
          SMARTCS_LAUNCH_EVIDENCE_OUT: outFile,
          SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY: "true",
          SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL: "true",
          SMARTCS_LAUNCH_TENANT: "tenant_launch_secret",
        },
      });

      const result = await execArchive(["--from-env"], {
        SMARTCS_LAUNCH_EVIDENCE_FILE: outFile,
        SMARTCS_LAUNCH_EVIDENCE_REQUIRE_PASS: "true",
        SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY: "true",
        SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL: "true",
      });

      assert.match(result.stdout, /Launch evidence archive verification passed\./);
      assert.match(result.stdout, /status=pass/);
      assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
    },
  );
});

test("launch evidence archive verifier rejects bundles with raw sensitive fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-archive-"));
  const file = join(dir, "unsafe-launch-evidence.json");
  await writeFile(
    file,
    JSON.stringify(
      {
        schemaVersion: "smart-cs-agent.launch-evidence.v1",
        generatedAt: new Date().toISOString(),
        summary: { status: "pass", failureCount: 0, warningCount: 0 },
        target: {
          tenantFingerprint: "6a805e005e94",
          channel: "taobao",
          tenantId: "tenant_launch_secret",
        },
        launchTrack: {
          realChannelRequired: true,
          providerReadonlyRequired: true,
          liveCanaryIncluded: false,
        },
        checks: [
          {
            name: "providerReadonlyPreflight",
            status: "pass",
            evidence: [
              "credentialRef=secret://smartcs/taobao/tenant_launch_secret",
            ],
            references: ["scripts/verify-provider-readonly.mjs"],
          },
        ],
        warnings: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  try {
    const failed = await execArchiveFailure([`--file=${file}`, "--require-pass"]);
    assert.match(failed.stderr, /Launch evidence archive verification failed/);
    assert.match(failed.stderr, /forbidden sensitive archive field/);
    assert.match(failed.stderr, /forbidden sensitive archive value/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("launch evidence archive verifier rejects path and body fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-archive-"));
  const file = join(dir, "path-body-fields.json");
  await writeFile(
    file,
    JSON.stringify(
      validBundle({
        envPath: "production.env",
        metricBody: "up",
        responseBody: "ok",
      }),
      null,
      2,
    ),
    "utf8",
  );

  try {
    const failed = await execArchiveFailure([`--file=${file}`, "--require-pass"]);
    assert.match(failed.stderr, /forbidden sensitive archive field/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("launch evidence archive verifier rejects sensitive evidence key strings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-archive-"));
  const file = join(dir, "unsafe-evidence-keys.json");
  await writeFile(file, JSON.stringify(validBundle({
    checks: [
      check("productionReadinessStatic", ["nodeEnvProduction=true"]),
      check("merchantLaunchPreflight", [
        "tenantFingerprint=6a805e005e94",
        "channel=taobao",
        "tenantId=prod-merchant-1",
      ]),
      check("providerReadonlyPreflight", [
        "providerReadonlyAdapterConfigured=true",
        "orderId=123456",
        "logisticsId=SF123",
      ]),
      check("providerSafetyBoundary", [
        "networkExecution=not_implemented",
        "providerResponse={\"status\":\"ok\"}",
      ]),
      check("launchRunbookEvidence", ["liveCanaryIncluded=false"]),
    ],
  }), null, 2), "utf8");

  try {
    const failed = await execArchiveFailure([`--file=${file}`, "--require-pass"]);
    assert.match(failed.stderr, /forbidden sensitive archive value/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("launch evidence archive verifier rejects unsafe values for allowed evidence keys", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-archive-"));
  const file = join(dir, "unsafe-allowed-evidence-values.json");
  await writeFile(
    file,
    JSON.stringify(
      validBundle({
        checks: [
          check("productionReadinessStatic", ["nodeEnvProduction=yes"]),
          check("merchantLaunchPreflight", [
            "tenantFingerprint=prod-tenant-1",
            "channel=amazon",
          ]),
          check("providerReadonlyPreflight", [
            "providerReadonlyAdapterConfigured=true",
            "credentialRefFingerprint=op://vault/credential",
          ]),
          check("providerSafetyBoundary", [
            "networkExecution=not_implemented",
            "providerResponseCaptured={\"body\":\"ok\"}",
          ]),
          check("launchRunbookEvidence", ["liveCanaryIncluded=false"]),
        ],
      }),
      null,
      2,
    ),
    "utf8",
  );

  try {
    const failed = await execArchiveFailure([`--file=${file}`, "--require-pass"]);
    assert.match(failed.stderr, /check.evidence fingerprint entries must be 12-character fingerprints/);
    assert.match(failed.stderr, /check.evidence boolean entries must be true or false/);
    assert.match(failed.stderr, /check.evidence channel entries must be supported commerce channels/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("launch evidence archive verifier rejects failed checks when pass is required", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-archive-"));
  const file = join(dir, "failed-check-with-pass-summary.json");
  await writeFile(
    file,
    JSON.stringify(
      validBundle({
        checks: [
          check("productionReadinessStatic"),
          check("merchantLaunchPreflight"),
          { ...check("providerReadonlyPreflight"), status: "fail" },
          check("providerSafetyBoundary"),
          check("launchRunbookEvidence"),
        ],
      }),
      null,
      2,
    ),
    "utf8",
  );

  try {
    const failed = await execArchiveFailure([`--file=${file}`, "--require-pass"]);
    assert.match(failed.stderr, /check.status must be pass/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("launch evidence archive verifier redacts unknown argument values", async () => {
  const failed = await execArchiveFailure([
    "--file=missing.json",
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function withEnvFile(values, callback) {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-archive-"));
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

function validBundle(overrides = {}) {
  return {
    schemaVersion: "smart-cs-agent.launch-evidence.v1",
    generatedAt: new Date().toISOString(),
    summary: { status: "pass", failureCount: 0, warningCount: 0 },
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
    },
    launchTrack: {
      realChannelRequired: true,
      providerReadonlyRequired: true,
      liveCanaryIncluded: false,
    },
    checks: [
      check("productionReadinessStatic"),
      check("merchantLaunchPreflight"),
      check("providerReadonlyPreflight"),
      check("providerSafetyBoundary"),
      check("launchRunbookEvidence"),
    ],
    warnings: [],
    ...overrides,
  };
}

function check(name, evidence = ["nodeEnvProduction=true"]) {
  return {
    name,
    status: "pass",
    evidence,
    references: ["docs/deploy/production-readiness.md"],
  };
}

async function execArchive(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-launch-evidence-archive.mjs",
    ...args,
  ], {
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function execArchiveFailure(args) {
  try {
    const result = await execArchive(args);
    assert.fail(`Expected archive verification to fail, got stdout: ${result.stdout}`);
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
    "user:secret",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
