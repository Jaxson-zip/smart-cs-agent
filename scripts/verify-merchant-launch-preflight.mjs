import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const VALID_CHANNELS = new Set(["taobao", "douyin", "shopify", "wechat", "email"]);
const CREDENTIAL_REF_PATTERN =
  /^(secret|vault):\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/;

const failures = [];
const warnings = [];
const evidence = [];
const args = parseArgs(process.argv.slice(2));
const target = {
  tenantId: args.tenant,
  channel: args.channel,
};

if (!target.tenantId) {
  failures.push("--tenant is required");
}
if (!target.channel) {
  failures.push("--channel is required");
} else if (!VALID_CHANNELS.has(target.channel)) {
  failures.push("--channel must be a supported commerce channel");
}

const env = {
  ...process.env,
  ...(args.envFile ? loadEnvFile(args.envFile) : {}),
};

if (failures.length === 0) {
  runPreflight(env, target, args);
}

if (failures.length > 0) {
  console.error("Merchant launch preflight failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  if (warnings.length > 0) {
    console.error("Warnings:");
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

console.log("Merchant launch preflight passed.");
for (const item of evidence) {
  console.log(`- ${item}`);
}
if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

function runPreflight(input, requested, options) {
  evidence.push(`tenantFingerprint=${fingerprint(requested.tenantId)}`);
  evidence.push(`channel=${requested.channel}`);

  checkProductionBoundary(input);
  checkAdminOperator(input, requested);

  if (options.requireRealChannel) {
    checkRealChannel(input, requested);
  } else {
    warnings.push(
      "Real-channel intake was not required for this merchant preflight.",
    );
  }

  if (options.requireProviderReadonly) {
    checkProviderReadonly(input, requested);
  } else {
    warnings.push(
      "Provider readonly configuration was not required for this merchant preflight.",
    );
  }
}

function checkProductionBoundary(input) {
  mustEqual(input.NODE_ENV, "production", "NODE_ENV must be production");
  mustEqual(
    input.WECOM_SANDBOX_ENABLED,
    "false",
    "WECOM_SANDBOX_ENABLED must be false for merchant launch preflight",
  );
  mustNotEqual(
    input.ALLOW_INSECURE_OPERATOR_HEADERS,
    "true",
    "ALLOW_INSECURE_OPERATOR_HEADERS must not be true",
  );
  mustNotEqual(
    input.ENABLE_LEGACY_WEB_DEMO_API,
    "true",
    "ENABLE_LEGACY_WEB_DEMO_API must not be true",
  );
  mustNotEqual(
    input.NEXT_PUBLIC_ENABLE_OFFLINE_DEMO,
    "true",
    "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO must not be true",
  );
  mustEqual(
    input.OPERATOR_IDENTITY_PROVIDER,
    "database",
    "OPERATOR_IDENTITY_PROVIDER must be database",
  );
  mustEqual(
    input.OPERATOR_ACCOUNT_SOURCE,
    "database",
    "OPERATOR_ACCOUNT_SOURCE must be database",
  );
  if (hasValue(input.OPERATOR_SESSION_ACCOUNTS)) {
    failures.push("OPERATOR_SESSION_ACCOUNTS must not be configured");
  }
}

function checkAdminOperator(input, requested) {
  const operatorKeys = parseJsonArray(input.OPERATOR_API_KEYS, "OPERATOR_API_KEYS");
  if (!operatorKeys) return;

  const hasAdmin = operatorKeys.some(
    (item) =>
      isRecord(item) &&
      item.tenantId === requested.tenantId &&
      item.role === "admin" &&
      typeof item.key === "string" &&
      item.key.length >= 24,
  );

  if (!hasAdmin) {
    failures.push("Target tenant must have at least one production admin operator key");
    return;
  }

  evidence.push("adminOperatorConfigured=true");
}

function checkRealChannel(input, requested) {
  mustEqual(
    input.REAL_CHANNEL_WEBHOOKS_ENABLED,
    "true",
    "REAL_CHANNEL_WEBHOOKS_ENABLED must be true",
  );
  mustNotEqual(
    input.REAL_CHANNEL_WEBHOOK_KILL_SWITCH,
    "true",
    "REAL_CHANNEL_WEBHOOK_KILL_SWITCH must be false",
  );

  const allowlist = parseJsonArray(
    input.REAL_CHANNEL_WEBHOOK_ALLOWLIST,
    "REAL_CHANNEL_WEBHOOK_ALLOWLIST",
  );
  const secrets = parseJsonArray(
    input.REAL_CHANNEL_WEBHOOK_SECRETS,
    "REAL_CHANNEL_WEBHOOK_SECRETS",
  );

  if (
    allowlist &&
    !allowlist.some((item) => sameBoundary(item, requested))
  ) {
    failures.push(
      "Target tenant/channel pair must be present in REAL_CHANNEL_WEBHOOK_ALLOWLIST",
    );
  } else if (allowlist) {
    evidence.push("webhookAllowlisted=true");
  }

  if (secrets) {
    const matchingSecret = secrets.find((item) => sameBoundary(item, requested));
    if (!matchingSecret) {
      failures.push(
        "Target tenant/channel pair must have a matching REAL_CHANNEL_WEBHOOK_SECRETS record",
      );
    } else if (
      !isRecord(matchingSecret) ||
      typeof matchingSecret.secret !== "string" ||
      matchingSecret.secret.length < 24 ||
      matchingSecret.secret.includes("replace_with")
    ) {
      failures.push("Target webhook secret must be production length and non-placeholder");
    } else {
      evidence.push("webhookSecretConfigured=true");
    }
  }

  mustBePositiveInt(
    input.REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE,
    "REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE",
  );
  mustBePositiveInt(
    input.REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS,
    "REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS",
    { max: 300 },
  );
  mustBeNonNegativeInt(
    input.CHANNEL_QUEUE_PENDING_WARN_THRESHOLD,
    "CHANNEL_QUEUE_PENDING_WARN_THRESHOLD",
  );
  mustBePositiveInt(
    input.CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS,
    "CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS",
  );
  mustBeNonNegativeInt(
    input.CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD,
    "CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD",
  );
  mustBePositiveInt(
    input.CHANNEL_QUEUE_STALE_AFTER_MINUTES,
    "CHANNEL_QUEUE_STALE_AFTER_MINUTES",
  );
  evidence.push("queueThresholdsConfigured=true");
}

function checkProviderReadonly(input, requested) {
  const adapters = parseJsonArray(
    input.PROVIDER_READONLY_ADAPTERS,
    "PROVIDER_READONLY_ADAPTERS",
  );
  const credentialInventory = parseJsonArray(
    input.PROVIDER_CREDENTIALS,
    "PROVIDER_CREDENTIALS",
  );
  if (!adapters || !credentialInventory) return;

  const adapter = adapters.find((item) => sameBoundary(item, requested));
  if (!adapter) {
    failures.push(
      "Target tenant/channel pair must be present in PROVIDER_READONLY_ADAPTERS",
    );
    return;
  }
  if (!isStrictReadonlyAdapter(adapter)) {
    failures.push(
      "Provider readonly adapter record must contain only channel, tenantId, and a secret:// or vault:// credentialRef",
    );
    return;
  }

  evidence.push("providerReadonlyAdapterConfigured=true");
  evidence.push(`credentialRefFingerprint=${fingerprint(adapter.credentialRef)}`);

  const credentialInventoryResult = validateCredentialInventory(
    credentialInventory,
    adapter.credentialRef,
  );
  if (credentialInventoryResult === "configured") {
    evidence.push("providerCredentialConfigured=true");
  }
}

function validateCredentialInventory(records, requiredRef) {
  const refs = [];
  for (const item of records) {
    if (!isStrictCredentialRecord(item)) {
      failures.push(
        "PROVIDER_CREDENTIALS must contain only credentialRef records without inline material",
      );
      return "invalid";
    }
    refs.push(item.credentialRef);
  }

  if (new Set(refs).size !== refs.length) {
    failures.push("PROVIDER_CREDENTIALS must not contain duplicate credential refs");
    return "invalid";
  }

  if (!refs.includes(requiredRef)) {
    failures.push(
      "Provider readonly credential ref must be listed in PROVIDER_CREDENTIALS",
    );
    return "missing";
  }

  return "configured";
}

function parseArgs(values) {
  const parsed = {
    channel: undefined,
    envFile: undefined,
    requireProviderReadonly: false,
    requireRealChannel: false,
    tenant: undefined,
  };

  for (const value of values) {
    if (value === "--require-real-channel") {
      parsed.requireRealChannel = true;
    } else if (value === "--require-provider-readonly") {
      parsed.requireProviderReadonly = true;
    } else if (value.startsWith("--channel=")) {
      parsed.channel = value.slice("--channel=".length);
    } else if (value.startsWith("--tenant=")) {
      parsed.tenant = value.slice("--tenant=".length);
    } else if (value.startsWith("--env-file=")) {
      parsed.envFile = value.slice("--env-file=".length);
    } else {
      failures.push(`Unknown argument: ${redactArgument(value)}`);
    }
  }

  return parsed;
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

function parseJsonArray(value, label) {
  if (!hasValue(value)) {
    failures.push(`${label} is required`);
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      failures.push(`${label} must be a JSON array`);
      return undefined;
    }
    return parsed;
  } catch {
    failures.push(`${label} must be valid JSON`);
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

function mustEqual(actual, expected, message) {
  if (actual !== expected) failures.push(message);
}

function mustNotEqual(actual, forbidden, message) {
  if (actual === forbidden) failures.push(message);
}

function mustBePositiveInt(value, label, options = {}) {
  const parsed = parseInteger(value);
  if (parsed === undefined || parsed <= 0) {
    failures.push(`${label} must be a positive integer`);
    return;
  }
  if (options.max !== undefined && parsed > options.max) {
    failures.push(`${label} must be <= ${options.max}`);
  }
}

function mustBeNonNegativeInt(value, label) {
  const parsed = parseInteger(value);
  if (parsed === undefined || parsed < 0) {
    failures.push(`${label} must be a non-negative integer`);
  }
}

function parseInteger(value) {
  if (!hasValue(value)) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
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
