import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const failures = [];
const warnings = [];
const args = parseArgs(process.argv.slice(2));
const env = {
  ...process.env,
  ...(args.envFile ? loadEnvFile(args.envFile) : {}),
};

checkStaticProductionEnv(env, {
  requireRealChannel: args.requireRealChannel,
});

if (args.api) {
  await checkReadiness(args.api, {
    allowDegraded: args.allowDegraded,
    requireRealChannel: args.requireRealChannel,
  });
}

if (failures.length > 0) {
  console.error("Production readiness verification failed:");
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

console.log("Production readiness verification passed.");
if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

function checkStaticProductionEnv(input, options) {
  mustEqual(input.NODE_ENV, "production", "NODE_ENV must be production");
  mustBeUrl(input.WEB_ORIGIN, "WEB_ORIGIN");
  if (isLocalUrl(input.WEB_ORIGIN)) {
    failures.push("WEB_ORIGIN must not point to localhost in production");
  }

  mustBeDatabaseUrl(input.DATABASE_URL);
  if (input.SMART_CS_LOAD_DOTENV === "true") {
    failures.push("SMART_CS_LOAD_DOTENV must not be true in production");
  }

  mustEqual(
    input.WECOM_SANDBOX_ENABLED,
    "false",
    "WECOM_SANDBOX_ENABLED must be false for production readiness",
  );
  mustNotEqual(
    input.ALLOW_INSECURE_OPERATOR_HEADERS,
    "true",
    "ALLOW_INSECURE_OPERATOR_HEADERS must not be true in production",
  );
  mustNotEqual(
    input.ENABLE_LEGACY_WEB_DEMO_API,
    "true",
    "ENABLE_LEGACY_WEB_DEMO_API must not be true in production",
  );
  mustNotEqual(
    input.NEXT_PUBLIC_ENABLE_OFFLINE_DEMO,
    "true",
    "NEXT_PUBLIC_ENABLE_OFFLINE_DEMO must not be true in production",
  );

  mustBeUrl(input.API_URL, "API_URL");
  mustBeProductionSessionSecret(input.OPERATOR_SESSION_SECRET);
  mustEqual(
    input.OPERATOR_IDENTITY_PROVIDER,
    "database",
    "OPERATOR_IDENTITY_PROVIDER must be database until OIDC/SSO is implemented",
  );
  mustEqual(
    input.OPERATOR_ACCOUNT_SOURCE,
    "database",
    "OPERATOR_ACCOUNT_SOURCE must be database in production",
  );
  if (hasValue(input.OPERATOR_SESSION_ACCOUNTS)) {
    failures.push(
      "OPERATOR_SESSION_ACCOUNTS must not be configured for production readiness",
    );
  }
  mustHaveProductionOperatorApiKeys(input.OPERATOR_API_KEYS);

  if (options.requireRealChannel) {
    mustEqual(
      input.REAL_CHANNEL_WEBHOOKS_ENABLED,
      "true",
      "--require-real-channel requires REAL_CHANNEL_WEBHOOKS_ENABLED=true",
    );
    mustNotEqual(
      input.REAL_CHANNEL_WEBHOOK_KILL_SWITCH,
      "true",
      "--require-real-channel requires REAL_CHANNEL_WEBHOOK_KILL_SWITCH to be false",
    );
  } else if (input.REAL_CHANNEL_WEBHOOK_KILL_SWITCH === "true") {
    warnings.push(
      "REAL_CHANNEL_WEBHOOK_KILL_SWITCH is true; production can start, but real-channel intake is emergency-disabled.",
    );
  }

  if (input.REAL_CHANNEL_WEBHOOKS_ENABLED === "true") {
    const webhookSecrets = mustHaveProductionWebhookSecrets(
      input.REAL_CHANNEL_WEBHOOK_SECRETS,
    );
    mustHaveProductionWebhookAllowlist(
      input.REAL_CHANNEL_WEBHOOK_ALLOWLIST,
      webhookSecrets,
    );
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
  } else {
    warnings.push(
      "REAL_CHANNEL_WEBHOOKS_ENABLED is not true; production can start, but real-channel intake is not open.",
    );
  }
}

async function checkReadiness(apiUrl, options) {
  const baseUrl = trimTrailingSlash(apiUrl);
  let response;
  try {
    response = await fetch(`${baseUrl}/health/ready`, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    failures.push(`GET /health/ready failed: ${error.message}`);
    return;
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    failures.push(`GET /health/ready returned non-JSON HTTP ${response.status}`);
    return;
  }

  if (!response.ok) {
    failures.push(`GET /health/ready returned HTTP ${response.status}`);
    return;
  }

  if (
    options.requireRealChannel &&
    payload?.checks?.channelWebhooks?.status !== "ok"
  ) {
    failures.push(
      "GET /health/ready checks.channelWebhooks.status must be ok when --require-real-channel is set",
    );
  }
  if (
    options.requireRealChannel &&
    (!Number.isInteger(payload?.checks?.channelWebhooks?.allowlistedPairCount) ||
      payload.checks.channelWebhooks.allowlistedPairCount <= 0)
  ) {
    failures.push(
      "GET /health/ready checks.channelWebhooks.allowlistedPairCount must be positive when --require-real-channel is set",
    );
  }

  if (payload?.status === "ok") return;
  if (payload?.status === "degraded" && options.allowDegraded) {
    warnings.push("GET /health/ready is degraded but --allow-degraded was set");
    return;
  }

  failures.push(
    `GET /health/ready must return status=ok${options.allowDegraded ? " or degraded" : ""}`,
  );
}

function parseArgs(values) {
  const parsed = {
    allowDegraded: false,
    api: undefined,
    envFile: undefined,
    requireRealChannel: false,
  };

  for (const value of values) {
    if (value === "--allow-degraded") {
      parsed.allowDegraded = true;
    } else if (value === "--require-real-channel") {
      parsed.requireRealChannel = true;
    } else if (value.startsWith("--api=")) {
      parsed.api = value.slice("--api=".length);
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
    failures.push(`Env file does not exist: ${path}`);
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

function mustEqual(actual, expected, message) {
  if (actual !== expected) failures.push(message);
}

function mustNotEqual(actual, forbidden, message) {
  if (actual === forbidden) failures.push(message);
}

function mustBeUrl(value, label) {
  if (!hasValue(value)) {
    failures.push(`${label} is required`);
    return;
  }

  try {
    new URL(value);
  } catch {
    failures.push(`${label} must be a valid URL`);
  }
}

function mustBeDatabaseUrl(value) {
  if (!hasValue(value)) {
    failures.push("DATABASE_URL is required");
    return;
  }
  if (value.startsWith("file:")) {
    failures.push("DATABASE_URL must not use a local file database in production");
  }
  if (!value.startsWith("postgresql://") && !value.startsWith("postgres://")) {
    failures.push("DATABASE_URL must be a Postgres connection string");
  }
}

function mustBeProductionSessionSecret(value) {
  if (!hasValue(value)) {
    failures.push("OPERATOR_SESSION_SECRET is required");
    return;
  }
  if (value === "replace_with_a_long_random_secret" || value.length < 32) {
    failures.push("OPERATOR_SESSION_SECRET must be a long non-placeholder secret");
  }
}

function mustHaveProductionOperatorApiKeys(value) {
  const keys = parseJsonArray(value, "OPERATOR_API_KEYS");
  if (!keys) return;
  if (keys.length === 0) {
    failures.push("OPERATOR_API_KEYS must contain at least one key");
    return;
  }

  for (const [index, item] of keys.entries()) {
    if (!isRecord(item)) {
      failures.push(`OPERATOR_API_KEYS[${index}] must be an object`);
      continue;
    }
    const key = item.key;
    if (typeof key !== "string" || key.length < 24) {
      failures.push(`OPERATOR_API_KEYS[${index}].key must be at least 24 characters`);
    }
    if (key === "dev_operator_key" || key?.includes("replace_with")) {
      failures.push(`OPERATOR_API_KEYS[${index}].key must not be a demo or placeholder key`);
    }
    for (const field of ["tenantId", "operatorId"]) {
      if (typeof item[field] !== "string" || item[field].length === 0) {
        failures.push(`OPERATOR_API_KEYS[${index}].${field} is required`);
      }
    }
    if (
      item.role !== undefined &&
      item.role !== "admin" &&
      item.role !== "operator" &&
      item.role !== "viewer"
    ) {
      failures.push(`OPERATOR_API_KEYS[${index}].role must be admin, operator, or viewer`);
    }
  }
}

function mustHaveProductionWebhookSecrets(value) {
  const secrets = parseJsonArray(value, "REAL_CHANNEL_WEBHOOK_SECRETS");
  if (!secrets) return undefined;
  if (secrets.length === 0) {
    failures.push("REAL_CHANNEL_WEBHOOK_SECRETS must contain at least one secret");
    return secrets;
  }

  for (const [index, item] of secrets.entries()) {
    if (!isRecord(item)) {
      failures.push(`REAL_CHANNEL_WEBHOOK_SECRETS[${index}] must be an object`);
      continue;
    }
    for (const field of ["channel", "tenantId"]) {
      if (typeof item[field] !== "string" || item[field].length === 0) {
        failures.push(`REAL_CHANNEL_WEBHOOK_SECRETS[${index}].${field} is required`);
      }
    }
    const secret = item.secret;
    if (typeof secret !== "string" || secret.length < 24) {
      failures.push(`REAL_CHANNEL_WEBHOOK_SECRETS[${index}].secret must be at least 24 characters`);
    }
    if (
      secret === "real_channel_secret_123" ||
      secret?.includes("replace_with")
    ) {
      failures.push(
        `REAL_CHANNEL_WEBHOOK_SECRETS[${index}].secret must not be a demo or placeholder secret`,
      );
    }
  }

  return secrets;
}

function mustHaveProductionWebhookAllowlist(value, webhookSecrets) {
  const allowlist = parseJsonArray(value, "REAL_CHANNEL_WEBHOOK_ALLOWLIST");
  if (!allowlist) return;
  if (allowlist.length === 0) {
    failures.push("REAL_CHANNEL_WEBHOOK_ALLOWLIST must contain at least one tenant/channel pair");
    return;
  }

  const secretBoundaries = new Set(
    (webhookSecrets ?? [])
      .filter(isRecord)
      .map((item) => boundaryKey(item.channel, item.tenantId)),
  );

  for (const [index, item] of allowlist.entries()) {
    if (!isRecord(item)) {
      failures.push(`REAL_CHANNEL_WEBHOOK_ALLOWLIST[${index}] must be an object`);
      continue;
    }
    for (const field of ["channel", "tenantId"]) {
      if (typeof item[field] !== "string" || item[field].length === 0) {
        failures.push(`REAL_CHANNEL_WEBHOOK_ALLOWLIST[${index}].${field} is required`);
      }
    }
    if (
      typeof item.channel === "string" &&
      typeof item.tenantId === "string" &&
      secretBoundaries.size > 0 &&
      !secretBoundaries.has(boundaryKey(item.channel, item.tenantId))
    ) {
      failures.push(
        `REAL_CHANNEL_WEBHOOK_ALLOWLIST[${index}] must match a configured webhook secret`,
      );
    }
  }
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

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

function redactArgument(value) {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) return value;
  return `${value.slice(0, separatorIndex)}=<redacted>`;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundaryKey(channel, tenantId) {
  return JSON.stringify([channel, tenantId]);
}
