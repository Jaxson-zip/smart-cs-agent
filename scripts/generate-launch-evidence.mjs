import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const VALID_CHANNELS = new Set(["taobao", "douyin", "shopify", "wechat", "email"]);
const CREDENTIAL_REF_PATTERN =
  /^(secret|vault):\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/;

const failures = [];
const warnings = [];
const args = applySafeEnvDefaults(parseArgs(process.argv.slice(2)), process.env);
const target = {
  tenantId: args.tenant,
  channel: args.channel,
};
const outputPath = resolveOutputPath(args.out);
const env = {
  ...process.env,
  ...(args.envFile ? loadEnvFile(args.envFile) : {}),
};

if (!target.tenantId) {
  failures.push("--tenant is required");
}
if (!target.channel) {
  failures.push("--channel is required");
} else if (!VALID_CHANNELS.has(target.channel)) {
  failures.push("--channel must be a supported commerce channel");
}

const checks = failures.length === 0 ? buildChecks(env, target, args) : [];
const bundle = buildBundle({ args, checks, target });
const output = `${JSON.stringify(bundle, null, 2)}\n`;

if (outputPath) {
  writeFileSync(outputPath, output, { encoding: "utf8", flag: "wx" });
} else if (args.out === undefined) {
  process.stdout.write(output);
}

if (failures.length > 0) {
  console.error("Launch evidence generation failed.");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Launch evidence bundle generated.");
if (args.out) {
  console.log("- outputWritten=true");
}

function buildChecks(input, requested, options) {
  const result = [];
  result.push(checkProductionReadinessStatic(input));
  result.push(checkMerchantLaunchPreflight(input, requested, options));
  result.push(checkProviderReadonlyPreflight(input, requested, options));
  result.push(checkProviderSafetyBoundary());
  result.push(checkLaunchRunbookEvidence(options));
  return result;
}

function checkProductionReadinessStatic(input) {
  const evidence = [];
  const errors = [];

  addBooleanEvidence(evidence, "nodeEnvProduction", input.NODE_ENV === "production");
  addBooleanEvidence(evidence, "sandboxDisabled", input.WECOM_SANDBOX_ENABLED === "false");
  addBooleanEvidence(
    evidence,
    "legacyDemoDisabled",
    input.ENABLE_LEGACY_WEB_DEMO_API !== "true" &&
      input.NEXT_PUBLIC_ENABLE_OFFLINE_DEMO !== "true",
  );
  addBooleanEvidence(
    evidence,
    "operatorIdentityDatabase",
    input.OPERATOR_IDENTITY_PROVIDER === "database" &&
      input.OPERATOR_ACCOUNT_SOURCE === "database",
  );
  addBooleanEvidence(
    evidence,
    "insecureHeadersDisabled",
    input.ALLOW_INSECURE_OPERATOR_HEADERS !== "true",
  );

  for (const item of evidence) {
    if (item.endsWith("=false")) {
      errors.push(`${item.slice(0, item.indexOf("="))} must be true`);
    }
  }

  return checkResult("productionReadinessStatic", errors, evidence, [
    "docs/deploy/production-readiness.md",
    "scripts/verify-production-readiness.mjs",
  ]);
}

function checkMerchantLaunchPreflight(input, requested, options) {
  const evidence = [];
  const errors = [];
  evidence.push(`tenantFingerprint=${fingerprint(requested.tenantId)}`);
  evidence.push(`channel=${requested.channel}`);

  const operatorKeys = parseJsonArray(input.OPERATOR_API_KEYS, "OPERATOR_API_KEYS", errors);
  const hasAdminOperator =
    operatorKeys?.some(
      (item) =>
        isRecord(item) &&
        item.tenantId === requested.tenantId &&
        item.role === "admin" &&
        typeof item.key === "string" &&
        item.key.length >= 24,
    ) ?? false;
  addBooleanEvidence(evidence, "adminOperatorConfigured", hasAdminOperator);
  if (!hasAdminOperator) {
    errors.push("target tenant must have a production admin operator key");
  }

  if (options.requireRealChannel) {
    const realChannel = evaluateRealChannel(input, requested);
    evidence.push(...realChannel.evidence);
    errors.push(...realChannel.errors);
  } else {
    evidence.push("realChannelRequired=false");
  }

  return checkResult("merchantLaunchPreflight", errors, evidence, [
    "scripts/verify-merchant-launch-preflight.mjs",
  ]);
}

function checkProviderReadonlyPreflight(input, requested, options) {
  const evidence = [];
  const errors = [];

  if (options.requireProviderReadonly) {
    const providerReadonly = evaluateProviderReadonly(input, requested);
    evidence.push(...providerReadonly.evidence);
    errors.push(...providerReadonly.errors);
  } else {
    evidence.push("providerReadonlyRequired=false");
  }

  return checkResult("providerReadonlyPreflight", errors, evidence, [
    "scripts/verify-merchant-launch-preflight.mjs",
    "scripts/verify-provider-readonly.mjs",
  ]);
}

function checkProviderSafetyBoundary() {
  const evidence = [
    "networkExecution=not_implemented",
    "networkAttempted=false",
    "providerDataReturned=false",
    "providerResponseCaptured=false",
    "realCommerceActionsEnabled=false",
    "customerVisibleActionsEnabled=false",
  ];

  return checkResult("providerSafetyBoundary", [], evidence, [
    "docs/deploy/provider-adapter-contracts.md",
    "scripts/verify-provider-read-harness.mjs",
  ]);
}

function checkLaunchRunbookEvidence(options) {
  const evidence = [
    "rollbackRunbookLinked=true",
    "launchChecklistLinked=true",
    `realChannelRequired=${options.requireRealChannel}`,
    `providerReadonlyRequired=${options.requireProviderReadonly}`,
    "liveCanaryIncluded=false",
  ];

  return checkResult("launchRunbookEvidence", [], evidence, [
    "docs/deploy/production-launch-runbook.md",
  ]);
}

function evaluateRealChannel(input, requested) {
  const evidence = [];
  const errors = [];
  addBooleanEvidence(
    evidence,
    "realChannelWebhooksEnabled",
    input.REAL_CHANNEL_WEBHOOKS_ENABLED === "true",
  );
  addBooleanEvidence(
    evidence,
    "realChannelKillSwitchOff",
    input.REAL_CHANNEL_WEBHOOK_KILL_SWITCH !== "true",
  );

  const allowlist = parseJsonArray(
    input.REAL_CHANNEL_WEBHOOK_ALLOWLIST,
    "REAL_CHANNEL_WEBHOOK_ALLOWLIST",
    errors,
  );
  const secrets = parseJsonArray(
    input.REAL_CHANNEL_WEBHOOK_SECRETS,
    "REAL_CHANNEL_WEBHOOK_SECRETS",
    errors,
  );
  const allowlisted = allowlist?.some((item) => sameBoundary(item, requested)) ?? false;
  const matchingSecret = secrets?.find((item) => sameBoundary(item, requested));
  const webhookSecretConfigured =
    isRecord(matchingSecret) &&
    typeof matchingSecret.secret === "string" &&
    matchingSecret.secret.length >= 24 &&
    !matchingSecret.secret.includes("replace_with");

  addBooleanEvidence(evidence, "webhookAllowlisted", allowlisted);
  addBooleanEvidence(evidence, "webhookSecretConfigured", webhookSecretConfigured);
  addBooleanEvidence(
    evidence,
    "realChannelRateLimitConfigured",
    readPositiveInt(input.REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE) !== undefined,
  );
  addBooleanEvidence(
    evidence,
    "realChannelFreshnessWindowConfigured",
    readPositiveInt(input.REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS, { max: 300 }) !== undefined,
  );
  addBooleanEvidence(
    evidence,
    "queueThresholdsConfigured",
    readNonNegativeInt(input.CHANNEL_QUEUE_PENDING_WARN_THRESHOLD) !== undefined &&
      readPositiveInt(input.CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS) !== undefined &&
      readNonNegativeInt(input.CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD) !== undefined &&
      readPositiveInt(input.CHANNEL_QUEUE_STALE_AFTER_MINUTES) !== undefined,
  );

  for (const item of evidence) {
    if (item.endsWith("=false")) {
      errors.push(`${item.slice(0, item.indexOf("="))} must be true`);
    }
  }

  return { errors, evidence };
}

function evaluateProviderReadonly(input, requested) {
  const evidence = [];
  const errors = [];
  const adapters = parseJsonArray(
    input.PROVIDER_READONLY_ADAPTERS,
    "PROVIDER_READONLY_ADAPTERS",
    errors,
  );
  const credentials = parseJsonArray(input.PROVIDER_CREDENTIALS, "PROVIDER_CREDENTIALS", errors);
  const adapter = adapters?.find((item) => sameBoundary(item, requested));
  const adapterConfigured = isStrictReadonlyAdapter(adapter);
  addBooleanEvidence(evidence, "providerReadonlyAdapterConfigured", adapterConfigured);

  if (!adapterConfigured) {
    errors.push("target tenant/channel must have a strict provider readonly adapter record");
    return { errors, evidence };
  }

  evidence.push(`credentialRefFingerprint=${fingerprint(adapter.credentialRef)}`);
  const credentialRefs = [];
  for (const item of credentials ?? []) {
    if (!isStrictCredentialRecord(item)) {
      errors.push("PROVIDER_CREDENTIALS must contain only strict credentialRef records");
      return { errors, evidence };
    }
    credentialRefs.push(item.credentialRef);
  }
  if (new Set(credentialRefs).size !== credentialRefs.length) {
    errors.push("PROVIDER_CREDENTIALS must not contain duplicate refs");
  }
  addBooleanEvidence(
    evidence,
    "providerCredentialConfigured",
    credentialRefs.includes(adapter.credentialRef),
  );
  if (!credentialRefs.includes(adapter.credentialRef)) {
    errors.push("provider readonly credential ref must be listed in PROVIDER_CREDENTIALS");
  }

  return { errors, evidence };
}

function buildBundle({ args: options, checks, target: requested }) {
  const failureCount =
    failures.length +
    checks.reduce((total, item) => total + (item.status === "fail" ? 1 : 0), 0);
  const warningCount = warnings.length;
  return {
    schemaVersion: "smart-cs-agent.launch-evidence.v1",
    generatedAt: new Date().toISOString(),
    summary: {
      status: failureCount === 0 ? "pass" : "fail",
      failureCount,
      warningCount,
    },
    target: {
      tenantFingerprint: requested.tenantId ? fingerprint(requested.tenantId) : null,
      channel: sanitizeChannel(requested.channel),
    },
    launchTrack: {
      realChannelRequired: options.requireRealChannel,
      providerReadonlyRequired: options.requireProviderReadonly,
      liveCanaryIncluded: false,
    },
    checks,
    warnings,
  };
}

function checkResult(name, errors, evidence, references) {
  if (errors.length > 0) {
    failures.push(...errors);
  }
  return {
    name,
    status: errors.length === 0 ? "pass" : "fail",
    evidence,
    references,
  };
}

function parseArgs(values) {
  const parsed = {
    channel: undefined,
    envFile: undefined,
    fromEnv: false,
    out: undefined,
    requireProviderReadonly: false,
    requireRealChannel: false,
    tenant: undefined,
  };

  for (const value of values) {
    if (value === "--from-env") {
      parsed.fromEnv = true;
    } else if (value === "--require-real-channel") {
      parsed.requireRealChannel = true;
    } else if (value === "--require-provider-readonly") {
      parsed.requireProviderReadonly = true;
    } else if (value.startsWith("--channel=")) {
      parsed.channel = value.slice("--channel=".length);
    } else if (value.startsWith("--tenant=")) {
      parsed.tenant = value.slice("--tenant=".length);
    } else if (value.startsWith("--env-file=")) {
      parsed.envFile = value.slice("--env-file=".length);
    } else if (value.startsWith("--out=")) {
      parsed.out = value.slice("--out=".length);
    } else {
      failures.push(`Unknown argument: ${redactArgument(value)}`);
    }
  }

  return parsed;
}

function applySafeEnvDefaults(parsed, input) {
  if (!parsed.fromEnv) return parsed;

  const result = { ...parsed };
  result.channel = result.channel ?? input.SMARTCS_LAUNCH_CHANNEL;
  result.envFile = result.envFile ?? input.SMARTCS_LAUNCH_ENV_FILE;
  result.out = result.out ?? input.SMARTCS_LAUNCH_EVIDENCE_OUT;
  result.tenant = result.tenant ?? input.SMARTCS_LAUNCH_TENANT;
  result.requireProviderReadonly =
    result.requireProviderReadonly ||
    readLaunchBoolean(
      input.SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY,
      "SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY",
    );
  result.requireRealChannel =
    result.requireRealChannel ||
    readLaunchBoolean(
      input.SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL,
      "SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL",
    );
  return result;
}

function readLaunchBoolean(value, label) {
  if (!hasValue(value)) return false;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  failures.push(`${label} must be true or false`);
  return false;
}

function loadEnvFile(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    failures.push("Env file does not exist");
    return {};
  }

  return Object.fromEntries(
    readFileSync(absolutePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        const key = line.slice(0, separatorIndex).trim();
        const rawValue = line.slice(separatorIndex + 1).trim();
        return [key, rawValue.replace(/^["']|["']$/g, "")];
      }),
  );
}

function resolveOutputPath(value) {
  if (value === undefined) return undefined;
  if (!hasValue(value)) {
    failures.push("--out must not be empty");
    return undefined;
  }

  const absolutePath = resolve(value);
  if (existsSync(absolutePath)) {
    failures.push("Output file must not already exist");
    return undefined;
  }

  if (!existsSync(dirname(absolutePath))) {
    failures.push("Output directory does not exist");
    return undefined;
  }

  return absolutePath;
}

function parseJsonArray(value, label, errors) {
  if (!hasValue(value)) {
    errors.push(`${label} is required`);
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      errors.push(`${label} must be a JSON array`);
      return undefined;
    }
    return parsed;
  } catch {
    errors.push(`${label} must be valid JSON`);
    return undefined;
  }
}

function sameBoundary(item, requested) {
  return (
    isRecord(item) &&
    item.channel === requested.channel &&
    item.tenantId === requested.tenantId
  );
}

function isStrictReadonlyAdapter(value) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    JSON.stringify(keys) === JSON.stringify(["channel", "credentialRef", "tenantId"]) &&
    VALID_CHANNELS.has(value.channel) &&
    typeof value.tenantId === "string" &&
    value.tenantId.length > 0 &&
    typeof value.credentialRef === "string" &&
    CREDENTIAL_REF_PATTERN.test(value.credentialRef)
  );
}

function isStrictCredentialRecord(value) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    keys[0] === "credentialRef" &&
    typeof value.credentialRef === "string" &&
    CREDENTIAL_REF_PATTERN.test(value.credentialRef)
  );
}

function addBooleanEvidence(evidence, key, value) {
  evidence.push(`${key}=${value ? "true" : "false"}`);
}

function readPositiveInt(value, options = {}) {
  const parsed = readNonNegativeInt(value);
  if (parsed === undefined || parsed <= 0) return undefined;
  if (options.max !== undefined && parsed > options.max) return undefined;
  return parsed;
}

function readNonNegativeInt(value) {
  if (!hasValue(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function sanitizeChannel(value) {
  return VALID_CHANNELS.has(value) ? value : null;
}

function redactArgument(value) {
  if (/^https?:\/\//i.test(value)) return "<redacted>";
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) return "<redacted>";
  return `${value.slice(0, separatorIndex)}=<redacted>`;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
