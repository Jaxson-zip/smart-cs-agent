import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SCRIPT_NAME = "verify-launch-manifest";
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
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_ARCHIVE_BYTES = 256 * 1024;
const FORBIDDEN_FIELD_NAMES = new Set([
  "apikey",
  "clientsecret",
  "credentialref",
  "customerdata",
  "customermessage",
  "envfile",
  "envfilepath",
  "envpath",
  "evidencearchivepath",
  "evidencepath",
  "externalconversationid",
  "externalmessageid",
  "logisticsid",
  "manifestpath",
  "metricbody",
  "metricsbody",
  "merchantid",
  "operatorapikey",
  "orderid",
  "providerpayload",
  "providerresponse",
  "providertoken",
  "rawbody",
  "responsebody",
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
const MANIFEST_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "releaseId",
  "requirements",
  "entries",
]);
const REQUIREMENT_KEYS = new Set([
  "requirePass",
  "requireProviderReadonly",
  "requireRealChannel",
]);
const MANIFEST_ENTRY_KEYS = new Set([
  "tenantFingerprint",
  "channel",
  "evidenceFile",
]);
const EVIDENCE_ARCHIVE_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "summary",
  "target",
  "launchTrack",
  "checks",
  "warnings",
]);
const EVIDENCE_SUMMARY_KEYS = new Set(["status", "failureCount", "warningCount"]);
const EVIDENCE_TARGET_KEYS = new Set(["tenantFingerprint", "channel"]);
const EVIDENCE_LAUNCH_TRACK_KEYS = new Set([
  "realChannelRequired",
  "providerReadonlyRequired",
  "liveCanaryIncluded",
]);
const EVIDENCE_CHECK_KEYS = new Set(["name", "status", "evidence", "references"]);
const BOOLEAN_EVIDENCE_KEYS = new Set([
  "adminOperatorConfigured",
  "customerVisibleActionsEnabled",
  "insecureHeadersDisabled",
  "launchChecklistLinked",
  "legacyDemoDisabled",
  "liveCanaryIncluded",
  "networkAttempted",
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
  "webhookAllowlisted",
  "webhookSecretConfigured",
]);
const FINGERPRINT_EVIDENCE_KEYS = new Set([
  "credentialRefFingerprint",
  "tenantFingerprint",
]);
const NETWORK_EXECUTION_VALUES = new Set(["not_implemented"]);

const failures = [];
const args = applySafeEnvDefaults(parseArgs(process.argv.slice(2)), process.env);

if (!hasValue(args.manifest)) {
  failures.push("--manifest is required");
}

const manifest = failures.length === 0 ? readJsonFile(args.manifest, "Manifest", MAX_MANIFEST_BYTES) : undefined;
const evidenceDir = resolveEvidenceDir(args, manifest);
if (manifest) {
  validateManifest(manifest, args, evidenceDir);
}

if (failures.length > 0) {
  console.error("Launch manifest verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

const channelCount = new Set(manifest.entries.map((entry) => entry.channel)).size;
console.log("Launch manifest verification passed.");
console.log(`- releaseId=${manifest.releaseId}`);
console.log(`- entries=${manifest.entries.length}`);
console.log(`- channels=${channelCount}`);

function validateManifest(value, options, baseDir) {
  if (!isRecord(value)) {
    failures.push("Manifest root must be an object");
    return;
  }
  validateAllowedKeys(value, MANIFEST_KEYS, "manifest contains unsupported field");

  if (value.schemaVersion !== "smart-cs-agent.launch-manifest.v1") {
    failures.push("schemaVersion must be smart-cs-agent.launch-manifest.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    failures.push("generatedAt must be an ISO timestamp");
  }
  if (
    typeof value.releaseId !== "string" ||
    !/^[A-Za-z0-9._-]{3,80}$/.test(value.releaseId)
  ) {
    failures.push("releaseId must be a safe release identifier");
  }

  validateRequirements(value.requirements, options);
  validateEntries(value.entries, baseDir, options);
  validateNoSensitiveFields(value, "manifest");
}

function validateRequirements(requirements, options) {
  if (!isRecord(requirements)) {
    failures.push("requirements must be an object");
    return;
  }
  validateAllowedKeys(requirements, REQUIREMENT_KEYS, "manifest requirements contain unsupported field");

  for (const key of [
    "requirePass",
    "requireProviderReadonly",
    "requireRealChannel",
  ]) {
    if (typeof requirements[key] !== "boolean") {
      failures.push(`requirements.${key} must be a boolean`);
    }
  }
  if (options.requirePass && requirements.requirePass !== true) {
    failures.push("requirements.requirePass must be true");
  }
  if (options.requireProviderReadonly && requirements.requireProviderReadonly !== true) {
    failures.push("requirements.requireProviderReadonly must be true");
  }
  if (options.requireRealChannel && requirements.requireRealChannel !== true) {
    failures.push("requirements.requireRealChannel must be true");
  }
}

function validateEntries(entries, baseDir, options) {
  if (!Array.isArray(entries) || entries.length === 0) {
    failures.push("entries must be a non-empty array");
    return;
  }
  if (entries.length > 100) {
    failures.push("entries must contain no more than 100 items");
    return;
  }

  const seen = new Set();
  for (const entry of entries) {
    if (!isRecord(entry)) {
      failures.push("each manifest entry must be an object");
      continue;
    }
    validateAllowedKeys(entry, MANIFEST_ENTRY_KEYS, "manifest entry contains unsupported field");

    const pairKey = `${entry.tenantFingerprint}:${entry.channel}`;
    if (seen.has(pairKey)) {
      failures.push("duplicate tenantFingerprint and channel pair");
      continue;
    }
    seen.add(pairKey);

    validateEntryShape(entry);
    if (!isValidEntry(entry)) {
      continue;
    }

    const archive = readJsonFile(
      join(baseDir, entry.evidenceFile),
      "Evidence archive",
      MAX_ARCHIVE_BYTES,
    );
    if (!archive) continue;
    validateEvidenceArchive(archive, entry, options);
  }
}

function validateEntryShape(entry) {
  if (
    typeof entry.tenantFingerprint !== "string" ||
    !/^[a-f0-9]{12}$/.test(entry.tenantFingerprint)
  ) {
    failures.push("entry.tenantFingerprint must be a 12-character fingerprint");
  }
  if (!VALID_CHANNELS.has(entry.channel)) {
    failures.push("entry.channel must be a supported commerce channel");
  }
  const expectedFile = `${entry.tenantFingerprint}-${entry.channel}.json`;
  if (entry.evidenceFile !== expectedFile) {
    failures.push("evidenceFile must match tenantFingerprint-channel.json");
  }
}

function isValidEntry(entry) {
  return (
    typeof entry.tenantFingerprint === "string" &&
    /^[a-f0-9]{12}$/.test(entry.tenantFingerprint) &&
    VALID_CHANNELS.has(entry.channel) &&
    entry.evidenceFile === `${entry.tenantFingerprint}-${entry.channel}.json`
  );
}

function validateEvidenceArchive(bundle, entry, options) {
  if (!isRecord(bundle)) {
    failures.push("Evidence archive root must be an object");
    return;
  }
  validateAllowedKeys(bundle, EVIDENCE_ARCHIVE_KEYS, "evidence archive contains unsupported field");
  if (bundle.schemaVersion !== "smart-cs-agent.launch-evidence.v1") {
    failures.push("evidence schemaVersion must be smart-cs-agent.launch-evidence.v1");
  }
  validateEvidenceSummary(bundle.summary, options);
  validateEvidenceTarget(bundle.target, entry);
  validateEvidenceLaunchTrack(bundle.launchTrack, options);
  validateEvidenceChecks(bundle.checks, options);
  if (!Array.isArray(bundle.warnings)) {
    failures.push("evidence warnings must be an array");
  }
  validateNoSensitiveFields(bundle, "archive");
}

function validateEvidenceSummary(summary, options) {
  if (!isRecord(summary)) {
    failures.push("evidence summary must be an object");
    return;
  }
  validateAllowedKeys(summary, EVIDENCE_SUMMARY_KEYS, "evidence summary contains unsupported field");
  if (!["pass", "fail"].includes(summary.status)) {
    failures.push("evidence summary.status must be pass or fail");
  }
  if (!isNonNegativeInteger(summary.failureCount)) {
    failures.push("evidence summary.failureCount must be a non-negative integer");
  }
  if (!isNonNegativeInteger(summary.warningCount)) {
    failures.push("evidence summary.warningCount must be a non-negative integer");
  }
  if (options.requirePass && summary.status !== "pass") {
    failures.push("evidence summary.status must be pass");
  }
  if (options.requirePass && summary.failureCount !== 0) {
    failures.push("evidence summary.failureCount must be 0");
  }
}

function validateEvidenceTarget(target, entry) {
  if (!isRecord(target)) {
    failures.push("evidence target must be an object");
    return;
  }
  validateAllowedKeys(target, EVIDENCE_TARGET_KEYS, "evidence target contains unsupported field");
  if (
    target.tenantFingerprint !== entry.tenantFingerprint ||
    target.channel !== entry.channel
  ) {
    failures.push("evidence archive target does not match manifest entry");
  }
}

function validateEvidenceLaunchTrack(launchTrack, options) {
  if (!isRecord(launchTrack)) {
    failures.push("evidence launchTrack must be an object");
    return;
  }
  validateAllowedKeys(
    launchTrack,
    EVIDENCE_LAUNCH_TRACK_KEYS,
    "evidence launchTrack contains unsupported field",
  );
  if (options.requireRealChannel && launchTrack.realChannelRequired !== true) {
    failures.push("evidence launchTrack.realChannelRequired must be true");
  }
  if (options.requireProviderReadonly && launchTrack.providerReadonlyRequired !== true) {
    failures.push("evidence launchTrack.providerReadonlyRequired must be true");
  }
  if (launchTrack.liveCanaryIncluded !== false) {
    failures.push("evidence launchTrack.liveCanaryIncluded must be false");
  }
}

function validateEvidenceChecks(checks, options) {
  if (!Array.isArray(checks)) {
    failures.push("evidence checks must be an array");
    return;
  }

  const names = new Set();
  for (const check of checks) {
    if (!isRecord(check)) {
      failures.push("each evidence check must be an object");
      continue;
    }
    validateAllowedKeys(check, EVIDENCE_CHECK_KEYS, "evidence check contains unsupported field");
    if (!REQUIRED_CHECKS.has(check.name)) {
      failures.push("evidence check.name must be a known launch evidence check");
    } else {
      names.add(check.name);
    }
    if (!["pass", "fail"].includes(check.status)) {
      failures.push("evidence check.status must be pass or fail");
    } else if (options.requirePass && check.status !== "pass") {
      failures.push("evidence check.status must be pass");
    }
    if (!Array.isArray(check.evidence)) {
      failures.push("evidence check.evidence must be an array");
    } else {
      validateEvidenceStrings(check.evidence);
    }
    if (!Array.isArray(check.references)) {
      failures.push("evidence check.references must be an array");
    }
  }

  for (const requiredCheck of REQUIRED_CHECKS) {
    if (!names.has(requiredCheck)) {
      failures.push(`evidence archive missing required check ${requiredCheck}`);
    }
  }
}

function validateEvidenceStrings(evidence) {
  for (const item of evidence) {
    if (typeof item !== "string") {
      failures.push("evidence entries must be strings");
      continue;
    }
    const separatorIndex = item.indexOf("=");
    if (separatorIndex === -1) {
      failures.push("evidence entries must be key=value strings");
      continue;
    }
    const key = item.slice(0, separatorIndex);
    const rawValue = item.slice(separatorIndex + 1);
    if (!ALLOWED_EVIDENCE_KEYS.has(key)) {
      failures.push("forbidden sensitive archive value");
      continue;
    }
    validateEvidenceValue(key, rawValue);
  }
}

function validateEvidenceValue(key, rawValue) {
  if (BOOLEAN_EVIDENCE_KEYS.has(key)) {
    if (!["true", "false"].includes(rawValue)) {
      failures.push("evidence boolean entries must be true or false");
    }
    return;
  }
  if (FINGERPRINT_EVIDENCE_KEYS.has(key)) {
    if (!/^[a-f0-9]{12}$/.test(rawValue)) {
      failures.push("evidence fingerprint entries must be 12-character fingerprints");
    }
    return;
  }
  if (key === "channel") {
    if (!VALID_CHANNELS.has(rawValue)) {
      failures.push("evidence channel entries must be supported commerce channels");
    }
    return;
  }
  if (key === "networkExecution") {
    if (!NETWORK_EXECUTION_VALUES.has(rawValue)) {
      failures.push("evidence networkExecution entries must use a supported value");
    }
    return;
  }

  failures.push("forbidden sensitive archive value");
}

function validateAllowedKeys(value, allowedKeys, message) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      failures.push(message);
    }
  }
}

function resolveEvidenceDir(options, manifest) {
  if (hasValue(options.evidenceDir)) return resolve(options.evidenceDir);
  if (hasValue(options.manifest)) return dirname(resolve(options.manifest));
  if (manifest) return process.cwd();
  return process.cwd();
}

function readJsonFile(file, label, maxBytes) {
  if (!existsSync(file)) {
    failures.push(`${label} file does not exist`);
    return undefined;
  }

  const stats = statSync(file);
  if (!stats.isFile()) {
    failures.push(`${label} path must point to a file`);
    return undefined;
  }
  if (stats.size > maxBytes) {
    failures.push(`${label} file is too large`);
    return undefined;
  }

  try {
    return JSON.parse(stripBom(readFileSync(file, "utf8")));
  } catch {
    failures.push(`${label} file must be valid JSON`);
    return undefined;
  }
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function validateNoSensitiveFields(value, label) {
  walk(value, label);
}

function walk(value, label) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, label));
    return;
  }

  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (isForbiddenFieldName(key)) {
        failures.push(
          label === "manifest"
            ? "forbidden sensitive manifest field"
            : "forbidden sensitive archive field",
        );
      }
      walk(nested, label);
    }
    return;
  }

  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push(
      label === "manifest"
        ? "forbidden sensitive manifest value"
        : "forbidden sensitive archive value",
    );
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
    evidenceDir: undefined,
    fromEnv: false,
    manifest: undefined,
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
    } else if (value.startsWith("--manifest=")) {
      parsed.manifest = value.slice("--manifest=".length);
    } else if (value.startsWith("--evidence-dir=")) {
      parsed.evidenceDir = value.slice("--evidence-dir=".length);
    } else {
      failures.push(`Unknown argument: ${redactArgument(value)}`);
    }
  }

  return parsed;
}

function applySafeEnvDefaults(parsed, input) {
  if (!parsed.fromEnv) return parsed;

  const result = { ...parsed };
  result.evidenceDir = result.evidenceDir ?? input.SMARTCS_LAUNCH_EVIDENCE_DIR;
  result.manifest = result.manifest ?? input.SMARTCS_LAUNCH_MANIFEST_FILE;
  result.requirePass =
    result.requirePass ||
    readLaunchBoolean(input.SMARTCS_LAUNCH_MANIFEST_REQUIRE_PASS, "SMARTCS_LAUNCH_MANIFEST_REQUIRE_PASS");
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
