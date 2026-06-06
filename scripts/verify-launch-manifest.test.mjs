import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("launch manifest verifier accepts multiple sanitized evidence archives", async () => {
  await withManifestFixture(async ({ dir, manifestFile }) => {
    const result = await execManifest([
      `--manifest=${manifestFile}`,
      `--evidence-dir=${dir}`,
      "--require-pass",
      "--require-real-channel",
      "--require-provider-readonly",
    ]);

    assert.match(result.stdout, /Launch manifest verification passed\./);
    assert.match(result.stdout, /entries=2/);
    assert.match(result.stdout, /channels=2/);
    assert.strictEqual(result.stderr, "");
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("launch manifest verifier reads file targets from safe env mode", async () => {
  await withManifestFixture(async ({ dir, manifestFile }) => {
    const result = await execManifest(["--from-env"], {
      SMARTCS_LAUNCH_EVIDENCE_DIR: dir,
      SMARTCS_LAUNCH_MANIFEST_FILE: manifestFile,
      SMARTCS_LAUNCH_MANIFEST_REQUIRE_PASS: "true",
      SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY: "true",
      SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL: "true",
    });

    assert.match(result.stdout, /Launch manifest verification passed\./);
    assert.match(result.stdout, /entries=2/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("launch manifest verifier accepts UTF-8 BOM encoded JSON files", async () => {
  await withManifestFixture(
    async ({ dir, manifestFile }) => {
      const result = await execManifest([
        `--manifest=${manifestFile}`,
        `--evidence-dir=${dir}`,
        "--require-pass",
        "--require-real-channel",
        "--require-provider-readonly",
      ]);

      assert.match(result.stdout, /Launch manifest verification passed\./);
      assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
    },
    { withBom: true },
  );
});

test("launch manifest verifier rejects duplicate tenant channel entries", async () => {
  await withManifestFixture(
    async ({ dir, manifestFile }) => {
      const failed = await execManifestFailure([
        `--manifest=${manifestFile}`,
        `--evidence-dir=${dir}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /duplicate tenantFingerprint and channel pair/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      entries: [
        entry("6a805e005e94", "taobao"),
        entry("6a805e005e94", "taobao"),
      ],
    },
  );
});

test("launch manifest verifier rejects raw sensitive manifest fields and unsafe evidence names", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-manifest-"));
  const manifestFile = join(dir, "launch-manifest.json");
  await writeFile(
    manifestFile,
    JSON.stringify(
      {
        schemaVersion: "smart-cs-agent.launch-manifest.v1",
        generatedAt: new Date().toISOString(),
        releaseId: "release-2026-06-07-a",
        requirements: {
          requirePass: true,
          requireProviderReadonly: true,
          requireRealChannel: true,
        },
        entries: [
          {
            tenantFingerprint: "6a805e005e94",
            tenantId: "tenant_launch_secret",
            channel: "taobao",
            evidenceFile: "tenant_launch_secret-taobao.json",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  try {
    const failed = await execManifestFailure([`--manifest=${manifestFile}`]);
    assert.match(failed.stderr, /forbidden sensitive manifest field/);
    assert.match(failed.stderr, /evidenceFile must match/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("launch manifest verifier rejects path and body fields", async () => {
  await withManifestFixture(
    async ({ dir, manifestFile }) => {
      const failed = await execManifestFailure([
        `--manifest=${manifestFile}`,
        `--evidence-dir=${dir}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /forbidden sensitive manifest field/);
      assert.match(failed.stderr, /forbidden sensitive archive field/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      manifest: {
        envPath: "production.env",
      },
      evidenceOverrides: {
        "6a805e005e94-taobao.json": {
          metricBody: "up",
          responseBody: "ok",
        },
      },
    },
  );
});

test("launch manifest verifier rejects evidence archives that do not match the manifest entry", async () => {
  await withManifestFixture(
    async ({ dir, manifestFile }) => {
      const failed = await execManifestFailure([
        `--manifest=${manifestFile}`,
        `--evidence-dir=${dir}`,
        "--require-pass",
        "--require-real-channel",
        "--require-provider-readonly",
      ]);

      assert.match(failed.stderr, /evidence archive target does not match manifest entry/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      evidenceOverrides: {
        "6a805e005e94-taobao.json": {
          target: {
            tenantFingerprint: "6a805e005e94",
            channel: "douyin",
          },
        },
      },
    },
  );
});

test("launch manifest verifier rejects unsafe values for allowed evidence keys", async () => {
  await withManifestFixture(
    async ({ dir, manifestFile }) => {
      const failed = await execManifestFailure([
        `--manifest=${manifestFile}`,
        `--evidence-dir=${dir}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /evidence fingerprint entries must be 12-character fingerprints/);
      assert.match(failed.stderr, /evidence boolean entries must be true or false/);
      assert.match(failed.stderr, /evidence channel entries must be supported commerce channels/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      evidenceOverrides: {
        "6a805e005e94-taobao.json": {
          checks: [
            check("productionReadinessStatic", [
              "nodeEnvProduction=yes",
              "sandboxDisabled=true",
            ]),
            check("merchantLaunchPreflight", [
              "tenantFingerprint=prod-tenant-1",
              "channel=amazon",
              "adminOperatorConfigured=true",
              "webhookAllowlisted=true",
              "webhookSecretConfigured=true",
            ]),
            check("providerReadonlyPreflight", [
              "providerReadonlyAdapterConfigured=true",
              "credentialRefFingerprint=op://vault/credential",
              "providerCredentialConfigured=true",
            ]),
            check("providerSafetyBoundary", [
              "networkExecution=not_implemented",
              "networkAttempted=false",
              "providerDataReturned=false",
              "providerResponseCaptured={\"body\":\"ok\"}",
            ]),
            check("launchRunbookEvidence", [
              "rollbackRunbookLinked=true",
              "launchChecklistLinked=true",
              "realChannelRequired=true",
              "providerReadonlyRequired=true",
              "liveCanaryIncluded=false",
            ]),
          ],
        },
      },
    },
  );
});

test("launch manifest verifier rejects failed archive checks even with a passing summary", async () => {
  await withManifestFixture(
    async ({ dir, manifestFile }) => {
      const failed = await execManifestFailure([
        `--manifest=${manifestFile}`,
        `--evidence-dir=${dir}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /evidence check.status must be pass/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      evidenceOverrides: {
        "6a805e005e94-taobao.json": {
          checks: [
            check("productionReadinessStatic", [
              "nodeEnvProduction=true",
              "sandboxDisabled=true",
            ]),
            check("merchantLaunchPreflight", [
              "tenantFingerprint=6a805e005e94",
              "channel=taobao",
              "adminOperatorConfigured=true",
              "webhookAllowlisted=true",
              "webhookSecretConfigured=true",
            ]),
            {
              ...check("providerReadonlyPreflight", [
                "providerReadonlyAdapterConfigured=false",
                "credentialRefFingerprint=626d085d7f2c",
                "providerCredentialConfigured=false",
              ]),
              status: "fail",
            },
            check("providerSafetyBoundary", [
              "networkExecution=not_implemented",
              "networkAttempted=false",
              "providerDataReturned=false",
              "providerResponseCaptured=false",
            ]),
            check("launchRunbookEvidence", [
              "rollbackRunbookLinked=true",
              "launchChecklistLinked=true",
              "realChannelRequired=true",
              "providerReadonlyRequired=true",
              "liveCanaryIncluded=false",
            ]),
          ],
        },
      },
    },
  );
});

test("launch manifest verifier redacts unknown argument values", async () => {
  const failed = await execManifestFailure([
    "--manifest=missing.json",
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function withManifestFixture(callback, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-manifest-"));
  const entries = overrides.entries ?? [
    entry("6a805e005e94", "taobao"),
    entry("91d4987b6aa4", "douyin"),
  ];
  const manifestFile = join(dir, "launch-manifest.json");

  try {
    for (const item of entries) {
      const file = join(dir, item.evidenceFile);
      await writeFile(
        file,
        `${overrides.withBom ? "\ufeff" : ""}${JSON.stringify(
          validBundle(
            item.tenantFingerprint,
            item.channel,
            overrides.evidenceOverrides?.[item.evidenceFile] ?? {},
          ),
          null,
          2,
        )}`,
        "utf8",
      );
    }

    await writeFile(
      manifestFile,
      `${overrides.withBom ? "\ufeff" : ""}${JSON.stringify(
        {
          schemaVersion: "smart-cs-agent.launch-manifest.v1",
          generatedAt: new Date().toISOString(),
          releaseId: "release-2026-06-07-a",
          requirements: {
            requirePass: true,
            requireProviderReadonly: true,
            requireRealChannel: true,
          },
          entries,
          ...overrides.manifest,
        },
        null,
        2,
      )}`,
      "utf8",
    );

    await callback({ dir, manifestFile });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function entry(tenantFingerprint, channel) {
  return {
    tenantFingerprint,
    channel,
    evidenceFile: `${tenantFingerprint}-${channel}.json`,
  };
}

function validBundle(tenantFingerprint, channel, overrides = {}) {
  return {
    schemaVersion: "smart-cs-agent.launch-evidence.v1",
    generatedAt: new Date().toISOString(),
    summary: { status: "pass", failureCount: 0, warningCount: 0 },
    target: {
      tenantFingerprint,
      channel,
    },
    launchTrack: {
      realChannelRequired: true,
      providerReadonlyRequired: true,
      liveCanaryIncluded: false,
    },
    checks: [
      check("productionReadinessStatic", [
        "nodeEnvProduction=true",
        "sandboxDisabled=true",
      ]),
      check("merchantLaunchPreflight", [
        `tenantFingerprint=${tenantFingerprint}`,
        `channel=${channel}`,
        "adminOperatorConfigured=true",
        "webhookAllowlisted=true",
        "webhookSecretConfigured=true",
      ]),
      check("providerReadonlyPreflight", [
        "providerReadonlyAdapterConfigured=true",
        "credentialRefFingerprint=626d085d7f2c",
        "providerCredentialConfigured=true",
      ]),
      check("providerSafetyBoundary", [
        "networkExecution=not_implemented",
        "networkAttempted=false",
        "providerDataReturned=false",
        "providerResponseCaptured=false",
      ]),
      check("launchRunbookEvidence", [
        "rollbackRunbookLinked=true",
        "launchChecklistLinked=true",
        "realChannelRequired=true",
        "providerReadonlyRequired=true",
        "liveCanaryIncluded=false",
      ]),
    ],
    warnings: [],
    ...overrides,
  };
}

function check(name, evidence) {
  return {
    name,
    status: "pass",
    evidence,
    references: ["docs/deploy/production-readiness.md"],
  };
}

async function execManifest(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-launch-manifest.mjs",
    ...args,
  ], {
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function execManifestFailure(args, env = {}) {
  try {
    const result = await execManifest(args, env);
    assert.fail(`Expected launch manifest verification to fail, got stdout: ${result.stdout}`);
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
