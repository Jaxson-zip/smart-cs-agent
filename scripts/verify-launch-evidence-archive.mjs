import { existsSync, readFileSync, statSync } from "node:fs";

const VALID_CHANNELS = new Set(["taobao", "douyin", "shopify", "wechat", "email"]);
const REQUIRED_CHECKS = new Set([
  "productionReadinessStatic",
  "merchantLaunchPreflight",
  "providerReadonlyPreflight",
  "providerSafetyBoundary",
  "launchRunbookEvidence",
]);
const ALLOWED_EVIDENCE_KEYS = new Set([
  "adminOperatorConfigured",
  "channel",
  "credentialRefFingerprint",
  "customerVisibleActionsEnabled",
  "insecureHeadersDisabled",
  "launchChecklistLinked",
  "legacyDemoDisabled",
  "liveCanaryIncluded",
  "networkAttempted",
  "networkExecution",
  "nodeEnvProduction",
  "operatorIdentityDatabase",
  "providerCredentialConfigured",
  "providerDataReturned",
  "providerReadonlyAdapterConfigured",
  "providerReadonlyRequired",
  "providerResponseCaptured",
  "queueThresholdsConfigured",
  "realChannelFreshnessWindowConfigured",
  "realChannelKillSwitchOff",
  "realChannelRateLimitConfigured",
  "realChannelRequired",
  "realChannelWebhooksEnabled",
  "realCommerceActionsEnabled",
  "rollbackRunbookLinked",
  "sandboxDisabled",
  "tenantFingerprint",
  "webhookAllowlisted",
  "webhookSecretConfigured",
]);
const MAX_ARCHIVE_BYTES = 256 * 1024;
const FORBIDDEN_FIELD_NAMES = new Set([
  "apikey",
  "clientsecret",
  "credentialref",
  "customerdata",
  "customermessage",
  "externalconversationid",
  "externalmessageid",
  "logisticsid",
  "merchantid",
  "operatorapikey",
  "orderid",
  "providerpayload",
  "providerresponse",
  "providertoken",
  "rawbody",
  "secret",
  "signature",
  "tenantid",
  "token",
  "webhooksecret",
]);
const FORBIDDEN_VALUE_PATTERNS = [
  /\b(?:secret|vault):\/\//i,
  /\bbearer\s+[a-z0-9._~+/=-]+/i,
  /\b(?:access|api|operator|provider)[_-]?(?:key|secret|token)=/i,
  /tenant_launch_secret/i,
  /super_secret_webhook_value/i,
  /production_operator_key/i,
  /actual_provider_token_must_not_leak/i,
  /plain_secret_token_must_not_leak/i,
  /user:secret/i,
];

const failures = [];
const args = applySafeEnvDefaults(parseArgs(process.argv.slice(2)), process.env);

if (!hasValue(args.file)) {
  failures.push("--file is required");
}

const bundle = failures.length === 0 ? readBundle(args.file) : undefined;
if (bundle) {
  validateBundle(bundle, args);
}

if (failures.length > 0) {
  console.error("Launch evidence archive verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Launch evidence archive verification passed.");
console.log(`- status=${bundle.summary.status}`);
console.log(`- tenantFingerprint=${bundle.target.tenantFingerprint}`);
console.log(`- channel=${bundle.target.channel}`);
console.log(`- checks=${bundle.checks.length}`);

function readBundle(file) {
  if (!existsSync(file)) {
    failures.push("Evidence archive file does not exist");
    return undefined;
  }

  const stats = statSync(file);
  if (!stats.isFile()) {
    failures.push("Evidence archive path must point to a file");
    return undefined;
  }
  if (stats.size > MAX_ARCHIVE_BYTES) {
    failures.push("Evidence archive file is too large");
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    failures.push("Evidence archive file must be valid JSON");
    return undefined;
  }
}

function validateBundle(bundle, options) {
  if (!isRecord(bundle)) {
    failures.push("Evidence archive root must be an object");
    return;
  }

  if (bundle.schemaVersion !== "smart-cs-agent.launch-evidence.v1") {
    failures.push("schemaVersion must be smart-cs-agent.launch-evidence.v1");
  }
  if (!isIsoTimestamp(bundle.generatedAt)) {
    failures.push("generatedAt must be an ISO timestamp");
  }
  validateSummary(bundle.summary, options);
  validateTarget(bundle.target);
  validateLaunchTrack(bundle.launchTrack, options);
  validateChecks(bundle.checks);
  if (!Array.isArray(bundle.warnings)) {
    failures.push("warnings must be an array");
  }
  validateNoSensitiveFields(bundle);
}

function validateSummary(summary, options) {
  if (!isRecord(summary)) {
    failures.push("summary must be an object");
    return;
  }
  if (!["pass", "fail"].includes(summary.status)) {
    failures.push("summary.status must be pass or fail");
  }
  if (!isNonNegativeInteger(summary.failureCount)) {
    failures.push("summary.failureCount must be a non-negative integer");
  }
  if (!isNonNegativeInteger(summary.warningCount)) {
    failures.push("summary.warningCount must be a non-negative integer");
  }
  if (options.requirePass && summary.status !== "pass") {
    failures.push("summary.status must be pass");
  }
}

function validateTarget(target) {
  if (!isRecord(target)) {
    failures.push("target must be an object");
    return;
  }
  if (
    typeof target.tenantFingerprint !== "string" ||
    !/^[a-f0-9]{12}$/.test(target.tenantFingerprint)
  ) {
    failures.push("target.tenantFingerprint must be a 12-character fingerprint");
  }
  if (!VALID_CHANNELS.has(target.channel)) {
    failures.push("target.channel must be a supported commerce channel");
  }
}

function validateLaunchTrack(launchTrack, options) {
  if (!isRecord(launchTrack)) {
    failures.push("launchTrack must be an object");
    return;
  }
  for (const key of [
    "realChannelRequired",
    "providerReadonlyRequired",
    "liveCanaryIncluded",
  ]) {
    if (typeof launchTrack[key] !== "boolean") {
      failures.push(`launchTrack.${key} must be a boolean`);
    }
  }
  if (options.requireRealChannel && launchTrack.realChannelRequired !== true) {
    failures.push("launchTrack.realChannelRequired must be true");
  }
  if (options.requireProviderReadonly && launchTrack.providerReadonlyRequired !== true) {
    failures.push("launchTrack.providerReadonlyRequired must be true");
  }
  if (launchTrack.liveCanaryIncluded !== false) {
    failures.push("launchTrack.liveCanaryIncluded must be false");
  }
}

function validateChecks(checks) {
  if (!Array.isArray(checks)) {
    failures.push("checks must be an array");
    return;
  }

  const names = new Set();
  for (const check of checks) {
    if (!isRecord(check)) {
      failures.push("each check must be an object");
      continue;
    }
    if (!REQUIRED_CHECKS.has(check.name)) {
      failures.push("check.name must be a known launch evidence check");
    } else {
      names.add(check.name);
    }
    if (!["pass", "fail"].includes(check.status)) {
      failures.push("check.status must be pass or fail");
    }
    if (!Array.isArray(check.evidence)) {
      failures.push("check.evidence must be an array");
    } else {
      validateEvidenceStrings(check.evidence);
    }
    if (!Array.isArray(check.references)) {
      failures.push("check.references must be an array");
    }
  }

  for (const requiredCheck of REQUIRED_CHECKS) {
    if (!names.has(requiredCheck)) {
      failures.push(`missing required check ${requiredCheck}`);
    }
  }
}

function validateEvidenceStrings(evidence) {
  for (const item of evidence) {
    if (typeof item !== "string") {
      failures.push("check.evidence entries must be strings");
      continue;
    }
    const separatorIndex = item.indexOf("=");
    if (separatorIndex === -1) {
      failures.push("check.evidence entries must be key=value strings");
      continue;
    }
    const key = item.slice(0, separatorIndex);
    if (!ALLOWED_EVIDENCE_KEYS.has(key)) {
      failures.push("forbidden sensitive archive value");
    }
  }
}

function validateNoSensitiveFields(value) {
  walk(value, []);
}

function walk(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, [...path, String(index)]));
    return;
  }

  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (isForbiddenFieldName(key)) {
        failures.push(`forbidden sensitive archive field: ${key}`);
      }
      walk(nested, [...path, key]);
    }
    return;
  }

  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push("forbidden sensitive archive value");
  }
}

function isForbiddenFieldName(key) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalized === "tenantfingerprint" || normalized === "credentialreffingerprint") {
    return false;
  }
  return FORBIDDEN_FIELD_NAMES.has(normalized);
}

function hasForbiddenValue(value) {
  return FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function parseArgs(values) {
  const parsed = {
    file: undefined,
    fromEnv: false,
    requirePass: false,
    requireProviderReadonly: false,
    requireRealChannel: false,
  };

  for (const value of values) {
    if (value === "--from-env") {
      parsed.fromEnv = true;
    } else if (value === "--require-pass") {
      parsed.requirePass = true;
    } else if (value === "--require-provider-readonly") {
      parsed.requireProviderReadonly = true;
    } else if (value === "--require-real-channel") {
      parsed.requireRealChannel = true;
    } else if (value.startsWith("--file=")) {
      parsed.file = value.slice("--file=".length);
    } else {
      failures.push(`Unknown argument: ${redactArgument(value)}`);
    }
  }

  return parsed;
}

function applySafeEnvDefaults(parsed, input) {
  if (!parsed.fromEnv) return parsed;

  const result = { ...parsed };
  result.file = result.file ?? input.SMARTCS_LAUNCH_EVIDENCE_FILE;
  result.requirePass =
    result.requirePass ||
    readLaunchBoolean(input.SMARTCS_LAUNCH_EVIDENCE_REQUIRE_PASS, "SMARTCS_LAUNCH_EVIDENCE_REQUIRE_PASS");
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

function redactArgument(value) {
  if (/^https?:\/\//i.test(value)) return "<redacted>";
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) return "<redacted>";
  return `${value.slice(0, separatorIndex)}=<redacted>`;
}

function isIsoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
