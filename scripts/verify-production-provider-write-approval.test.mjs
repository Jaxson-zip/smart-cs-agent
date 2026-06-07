import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const artifactRoot = join(process.cwd(), "production-provider-write-approval-artifacts");

test("production provider write approval verifier passes static checks without approval evidence", async () => {
  const result = await execVerifier([]);

  assert.match(result.stdout, /Production provider write approval verification passed\./);
  assert.match(result.stdout, /approval=skipped/);
  assert.strictEqual(result.stderr, "");
});

test("production provider write approval verifier accepts sanitized human-reviewed pilot evidence", async () => {
  await withApprovalFixture(async ({ approvalFile }) => {
    const result = await execVerifier(["--from-env"], {
      SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE: approvalFile,
      SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_REQUIRE_PASS: "true",
    });

    assert.match(result.stdout, /Production provider write approval verification passed\./);
    assert.match(result.stdout, /channel=taobao/);
    assert.match(result.stdout, /approval=verified/);
    assertNoSecretMarkers(`${result.stdout}\n${result.stderr}`);
  });
});

test("production provider write approval verifier rejects evidence without approval and artifact bindings", async () => {
  await withApprovalFixture(
    async ({ approvalFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /approval must be an object/);
      assert.match(failed.stderr, /artifactBindings must be an object/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approval: undefined,
      artifactBindings: undefined,
    },
  );
});

test("production provider write approval verifier rejects weak approval details and placeholder hashes", async () => {
  await withApprovalFixture(
    async ({ approvalFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /approval\.approvalStatus must be approved/);
      assert.match(failed.stderr, /approval approvedByFingerprint and secondReviewerFingerprint must be different/);
      assert.match(failed.stderr, /artifactBindings\.productionChangeApprovalSha256 must be a non-placeholder sha256 hash/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      approval: {
        approvalStatus: "pending",
        approvedByFingerprint: "2b3c4d5e6f70",
        secondReviewerFingerprint: "2b3c4d5e6f70",
      },
      artifactBindings: {
        productionChangeApprovalSha256: "0".repeat(64),
      },
    },
  );
});

test("production provider write approval verifier safe mode requires approval evidence", async () => {
  const failed = await execVerifierFailure(["--from-env", "--require-pass"]);

  assert.match(failed.stderr, /production provider write approval evidence is required/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

test("production provider write approval verifier rejects auto-execute and weak safety controls", async () => {
  await withApprovalFixture(
    async ({ approvalFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /executionMode must be human_review_required/);
      assert.match(failed.stderr, /controls\.humanApprovalRequired must be true/);
      assert.match(failed.stderr, /controls\.idempotencyRequired must be true/);
      assert.match(failed.stderr, /controls\.providerWriteKillSwitchReady must be true/);
      assert.match(failed.stderr, /limits\.maxDailyWriteCount must be between 1 and 100/);
      assert.match(failed.stderr, /safety\.automaticProviderWritesEnabled must be false/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      executionMode: "auto_execute",
      controls: {
        humanApprovalRequired: false,
        idempotencyRequired: false,
        providerWriteKillSwitchReady: false,
      },
      limits: {
        maxDailyWriteCount: 0,
      },
      safety: {
        automaticProviderWritesEnabled: true,
      },
    },
  );
});

test("production provider write approval verifier rejects weak evidence without require-pass", async () => {
  await withApprovalFixture(
    async ({ approvalFile }) => {
      const failed = await execVerifierFailure([`--approval=${approvalFile}`]);

      assert.match(failed.stderr, /executionMode must be human_review_required/);
      assert.match(failed.stderr, /controls\.humanApprovalRequired must be true/);
      assert.match(failed.stderr, /controls\.auditRequired must be true/);
      assert.match(failed.stderr, /controls\.providerWriteKillSwitchReady must be true/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      executionMode: "real_actions_disabled",
      controls: {
        humanApprovalRequired: false,
        auditRequired: false,
        providerWriteKillSwitchReady: false,
      },
    },
  );
});

test("production provider write approval verifier rejects unsupported actions and high-risk refunds", async () => {
  await withApprovalFixture(
    async ({ approvalFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /allowedActions cannot include refund in the first write pilot/);
      assert.match(failed.stderr, /allowedActions contains unsupported provider write action/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      allowedActions: ["modify_address", "refund", "update_invoice"],
    },
  );
});

test("production provider write approval verifier rejects sensitive approval evidence without echoing values", async () => {
  await withApprovalFixture(
    async ({ approvalFile }) => {
      const failed = await execVerifierFailure([
        `--approval=${approvalFile}`,
        "--require-pass",
      ]);

      assert.match(failed.stderr, /production provider write approval contains unsupported field/);
      assert.match(failed.stderr, /forbidden sensitive production provider write approval field/);
      assert.match(failed.stderr, /forbidden sensitive production provider write approval value/);
      assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
    },
    {
      tenantId: "tenant_launch_secret",
      providerToken: "actual_provider_token_must_not_leak",
      safety: {
        secretsInEvidence: true,
      },
    },
  );
});

test("production provider write approval verifier rejects approval paths outside the artifact directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartcs-provider-write-outside-"));
  const approvalFile = join(dir, "production-provider-write-approval.json");
  await writeFile(approvalFile, JSON.stringify(validApproval(), null, 2), "utf8");

  try {
    const failed = await execVerifierFailure([
      `--approval=${approvalFile}`,
      "--require-pass",
    ]);

    assert.match(failed.stderr, /--approval must be inside production-provider-write-approval-artifacts/);
    assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("production provider write approval verifier redacts unknown argument values", async () => {
  const failed = await execVerifierFailure([
    "--unknown=actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "https://user:secret@example.com/provider-write.json",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assertNoSecretMarkers(`${failed.stdout}\n${failed.stderr}`);
});

async function withApprovalFixture(callback, overrides = {}) {
  await mkdir(artifactRoot, { recursive: true });
  const dir = await mkdtemp(join(artifactRoot, "fixture-"));
  const approvalFile = join(dir, "production-provider-write-approval.json");

  try {
    await writeFile(
      approvalFile,
      JSON.stringify(deepMerge(validApproval(), overrides), null, 2),
      "utf8",
    );
    await callback({ dir, approvalFile });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validApproval() {
  return {
    schemaVersion: "smart-cs-agent.production-provider-write-approval.v1",
    generatedAt: new Date().toISOString(),
    target: {
      tenantFingerprint: "6a805e005e94",
      channel: "taobao",
      rolloutTrack: "single_merchant_pilot",
      changeTicket: "chg-20260607-provider-write",
    },
    executionMode: "human_review_required",
    allowedActions: ["modify_address", "issue_coupon", "urge_logistics"],
    approval: {
      approvalStatus: "approved",
      requestedByFingerprint: "1a2b3c4d5e6f",
      approvedByFingerprint: "2b3c4d5e6f70",
      secondReviewerFingerprint: "3c4d5e6f7081",
      approvedAt: new Date().toISOString(),
    },
    artifactBindings: {
      productionChangeApprovalSha256: "a".repeat(64),
      productionReleaseEvidenceSha256: "b".repeat(64),
      productionLaunchBindingSha256: "c".repeat(64),
      dryRunRehearsalSha256: "d".repeat(64),
      providerWriteKillSwitchSha256: "e".repeat(64),
    },
    controls: {
      humanApprovalRequired: true,
      twoPersonReviewRequired: true,
      idempotencyRequired: true,
      auditRequired: true,
      providerWriteKillSwitchReady: true,
      customerVisibleReplyRequiresApproval: true,
      dryRunRehearsalPassed: true,
      rollbackOwnerFingerprint: "91d4987b6aa4",
    },
    limits: {
      maxDailyWriteCount: 20,
      maxCouponAmountCents: 5000,
      maxAddressChangesPerOrder: 1,
    },
    safety: {
      secretsInEvidence: false,
      rawTenantIdsInEvidence: false,
      customerDataInEvidence: false,
      providerPayloadsInEvidence: false,
      networkExecutedByVerifier: false,
      providerWriteExecutedByVerifier: false,
      automaticProviderWritesEnabled: false,
      customerVisibleActionsAutoSent: false,
    },
  };
}

function deepMerge(base, overrides) {
  const output = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      output[key] = deepMerge(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

async function execVerifier(args, env = {}) {
  return execFileAsync(process.execPath, [
    "scripts/verify-production-provider-write-approval.mjs",
    ...args,
  ], {
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function execVerifierFailure(args, env = {}) {
  try {
    const result = await execVerifier(args, env);
    assert.fail(`Expected provider write approval verification to fail, got stdout: ${result.stdout}`);
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
    "actual_provider_token_must_not_leak",
    "plain_secret_token_must_not_leak",
    "user:secret",
  ]) {
    assert.ok(!value.includes(marker), `leaked marker ${marker}`);
  }
}
