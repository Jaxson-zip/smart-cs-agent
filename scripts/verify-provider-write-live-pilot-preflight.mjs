import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const MAX_PREFLIGHT_BYTES = 256 * 1024;
const PREFLIGHT_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-live-pilot-preflight-artifacts",
);

const ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "pilot",
  "runtimeControls",
  "operatorCoverage",
  "rollback",
  "observability",
  "launchWindow",
  "evidence",
  "artifactBindings",
  "safety",
]);
const TARGET_KEYS = new Set([
  "tenantFingerprint",
  "channel",
  "rolloutTrack",
  "changeTicket",
]);
const PILOT_KEYS = new Set([
  "action",
  "riskLevel",
  "liveExecutorEnabledAtVerification",
  "maxPilotWrites",
  "maxWritesPerOrder",
]);
const RUNTIME_CONTROL_KEYS = new Set([
  "killSwitchEngagedBeforeWindow",
  "humanConfirmRequired",
  "idempotencyVerified",
  "auditTrailVerified",
  "payloadEscrowSealedMetadataOnly",
  "noCustomerVisibleAutoReply",
  "noProviderMutationDuringVerification",
]);
const OPERATOR_COVERAGE_KEYS = new Set([
  "primaryOperatorFingerprint",
  "backupOperatorFingerprint",
  "releaseOwnerFingerprint",
  "rollbackOwnerFingerprint",
  "liveWatchMinutes",
]);
const ROLLBACK_KEYS = new Set([
  "rollbackDrillPassed",
  "disableLiveExecutorWithinMinutes",
  "killSwitchReleaseRequiresTwoPersonReview",
  "providerWriteQueueDrainPlanReady",
]);
const OBSERVABILITY_KEYS = new Set([
  "canaryRequired",
  "metricsDashboardReady",
  "alertRoutesReady",
  "auditExportReady",
]);
const LAUNCH_WINDOW_KEYS = new Set([
  "startsAt",
  "endsAt",
  "durationMinutes",
  "freezeWindowActive",
]);
const EVIDENCE_KEYS = new Set([
  "providerWriteDryRunRehearsalVerifierPassed",
  "providerWriteKillSwitchRehearsalVerifierPassed",
  "productionProviderWriteApprovalVerifierPassed",
  "providerWriteLiveExecutorStartupGuardVerifierPassed",
  "providerWriteLiveExecutorControlPlaneVerifierPassed",
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "productionLaunchVerifierPassed",
]);
const ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteDryRunRehearsalSha256",
  "providerWriteKillSwitchRehearsalSha256",
  "productionProviderWriteApprovalSha256",
  "providerWriteLiveExecutorStartupGuardSha256",
  "providerWriteLiveExecutorControlPlaneSha256",
  "providerWriteKillSwitchControlPlaneSha256",
  "productionLaunchSha256",
]);
const SAFETY_KEYS = new Set([
  "secretsInEvidence",
  "rawTenantIdsInEvidence",
  "customerDataInEvidence",
  "providerPayloadsInEvidence",
  "providerResponsesInEvidence",
  "rawIdempotencyKeysInEvidence",
  "networkExecutedByVerifier",
  "providerWriteExecutedByVerifier",
  "payloadEscrowOpenedByVerifier",
  "credentialsReadByVerifier",
  "customerVisibleActionsSentByVerifier",
]);
const CHANNELS = new Set(["taobao", "douyin"]);
const FIRST_PILOT_ACTIONS = new Set([
  "modify_address",
  "issue_coupon",
  "urge_logistics",
]);
const FORBIDDEN_FIELD_NAMES = new Set([
  "accesstoken",
  "address",
  "apikey",
  "clientsecret",
  "credentialmaterial",
  "credentialref",
  "customerdata",
  "customermessage",
  "externalconversationid",
  "externalmessageid",
  "idempotencykey",
  "installationtoken",
  "logisticsid",
  "operatorapikey",
  "orderid",
  "password",
  "privatekey",
  "providerpayload",
  "providerresponse",
  "providertoken",
  "rawaddress",
  "rawbody",
  "rawpayload",
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
  /\bghp_[A-Za-z0-9_]+\b/,
  /\bgithub_pat_[A-Za-z0-9_]+\b/,
  /tenant_1/i,
  /tenant_launch_secret/i,
  /actual_provider_token_must_not_leak/i,
  /plain_secret_token_must_not_leak/i,
  /user:secret/i,
];

function main() {
  const args = applySafeEnvDefaults(parseArgs(process.argv.slice(2)), process.env);
  const content = readStaticContent();

  verifyStaticArtifacts(content);

  let channel = undefined;
  if (hasValue(args.preflight)) {
    const preflight = readJsonFile(args.preflight, "Provider write live pilot preflight");
    if (preflight) {
      validatePreflight(preflight, args);
      if (isRecord(preflight) && isRecord(preflight.target)) {
        channel = preflight.target.channel;
      }
    }
  } else if (args.requirePass) {
    failures.push("provider write live pilot preflight evidence is required when pass evidence is required");
  }

  if (failures.length > 0) {
    console.error("Provider write live pilot preflight verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write live pilot preflight verification passed.");
  if (hasValue(args.preflight)) {
    console.log(`- channel=${channel}`);
    console.log("- preflight=verified");
  } else {
    console.log("- preflight=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    gitignore: ".gitignore",
    preflightDocs: "docs/deploy/provider-write-live-pilot-preflight.md",
    providerWriteDocs: "docs/deploy/provider-write-requests.md",
    productionProviderWriteApproval:
      "docs/deploy/production-provider-write-approval.md",
    productionReadiness: "docs/deploy/production-readiness.md",
    launchRunbook: "docs/deploy/production-launch-runbook.md",
    staticCiWorkflow: ".github/workflows/production-static-gates.yml",
    staticCiVerifier: "scripts/verify-production-static-ci.mjs",
    productionLaunchVerifier: "scripts/verify-production-launch.mjs",
    taskPlan: "task_plan.md",
    progress: "progress.md",
  };

  return Object.fromEntries(
    Object.entries(files).map(([label, relativePath]) => [
      label,
      readRequired(label, relativePath),
    ]),
  );
}

function verifyStaticArtifacts(content) {
  mustContainAll("package scripts", content.packageJson, [
    "verify:provider-write-live-pilot-preflight",
    "verify:provider-write-live-pilot-preflight:safe",
    "\"verify:provider-write-live-pilot-preflight:safe\": \"node scripts/verify-provider-write-live-pilot-preflight.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-live-pilot-preflight.mjs",
  ]);

  mustContainAll("provider write live pilot preflight docs", content.preflightDocs, [
    "PR68 Provider Write Live Pilot Preflight Gate",
    "smart-cs-agent.provider-write-live-pilot-preflight.v1",
    "npm run verify:provider-write-live-pilot-preflight",
    "npm run verify:provider-write-live-pilot-preflight:safe",
    "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS=true",
    "single_merchant_pilot",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR68 Provider Write Live Pilot Preflight Gate",
    "verify:provider-write-live-pilot-preflight",
    "smart-cs-agent.provider-write-live-pilot-preflight.v1",
  ]);

  mustContainAll("production provider write approval docs", content.productionProviderWriteApproval, [
    "verify:provider-write-live-pilot-preflight",
    "provider-write-live-pilot-preflight-artifacts",
    "productionProviderWriteApprovalSha256",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR68 Provider Write Live Pilot Preflight Gate",
    "verify:provider-write-live-pilot-preflight",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "verify:provider-write-live-pilot-preflight",
    "verify:provider-write-live-pilot-preflight:safe",
    "docs/deploy/provider-write-live-pilot-preflight.md",
    "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-live-pilot-preflight.test.mjs",
    "npm run verify:provider-write-live-pilot-preflight",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-live-pilot-preflight.test.mjs",
    "npm run verify:provider-write-live-pilot-preflight",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "verify-provider-write-live-pilot-preflight.mjs",
    "verify:provider-write-live-pilot-preflight",
    "provider write live pilot preflight",
  ]);

  mustContainAll("task plan references", content.taskPlan, [
    "PR68 - Provider Write Live Pilot Preflight Gate",
    "verify:provider-write-live-pilot-preflight",
  ]);

  mustContainAll("progress references", content.progress, [
    "Started PR68 provider write live pilot preflight gate",
  ]);

  mustContainAll("gitignore live pilot artifacts", content.gitignore, [
    "provider-write-live-pilot-preflight-artifacts/",
  ]);
}

function validatePreflight(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write live pilot preflight root must be an object");
    return;
  }

  validateAllowedKeys(
    value,
    ROOT_KEYS,
    "provider write live pilot preflight contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-live-pilot-preflight.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-live-pilot-preflight.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    failures.push("generatedAt must be an ISO timestamp");
  }

  validateTarget(value.target);
  validatePilot(value.pilot);
  validateRuntimeControls(value.runtimeControls, options);
  validateOperatorCoverage(value.operatorCoverage);
  validateRollback(value.rollback, options);
  validateObservability(value.observability, options);
  validateLaunchWindow(value.launchWindow, options);
  validateEvidence(value.evidence, options);
  validateArtifactBindings(value.artifactBindings);
  validateSafety(value.safety);
  validateNoSensitiveFields(value);
}

function validateTarget(target) {
  if (!isRecord(target)) {
    failures.push("target must be an object");
    return;
  }
  validateAllowedKeys(target, TARGET_KEYS, "target contains unsupported field");
  validateFingerprint("target.tenantFingerprint", target.tenantFingerprint);
  if (!CHANNELS.has(target.channel)) {
    failures.push("target.channel must be taobao or douyin");
  }
  if (target.rolloutTrack !== "single_merchant_pilot") {
    failures.push("target.rolloutTrack must be single_merchant_pilot");
  }
  if (
    typeof target.changeTicket !== "string" ||
    !/^[A-Za-z0-9._-]{3,100}$/.test(target.changeTicket)
  ) {
    failures.push("target.changeTicket must be a safe change ticket id");
  }
}

function validatePilot(pilot) {
  if (!isRecord(pilot)) {
    failures.push("pilot must be an object");
    return;
  }
  validateAllowedKeys(pilot, PILOT_KEYS, "pilot contains unsupported field");
  if (pilot.action === "refund") {
    failures.push("pilot.action cannot include refund");
  }
  if (!FIRST_PILOT_ACTIONS.has(pilot.action)) {
    failures.push("pilot.action must be a first-pilot provider write action");
  }
  if (pilot.riskLevel !== "low") {
    failures.push("pilot.riskLevel must be low");
  }
  if (pilot.liveExecutorEnabledAtVerification !== false) {
    failures.push("pilot.liveExecutorEnabledAtVerification must be false");
  }
  if (
    !Number.isInteger(pilot.maxPilotWrites) ||
    pilot.maxPilotWrites < 1 ||
    pilot.maxPilotWrites > 50
  ) {
    failures.push("pilot.maxPilotWrites must be between 1 and 50");
  }
  if (
    !Number.isInteger(pilot.maxWritesPerOrder) ||
    pilot.maxWritesPerOrder < 1 ||
    pilot.maxWritesPerOrder > 1
  ) {
    failures.push("pilot.maxWritesPerOrder must be 1");
  }
}

function validateRuntimeControls(controls, options) {
  validateAllTrueObject(
    controls,
    RUNTIME_CONTROL_KEYS,
    "runtimeControls",
    "runtimeControls contains unsupported field",
    options,
  );
}

function validateOperatorCoverage(coverage) {
  if (!isRecord(coverage)) {
    failures.push("operatorCoverage must be an object");
    return;
  }
  validateAllowedKeys(
    coverage,
    OPERATOR_COVERAGE_KEYS,
    "operatorCoverage contains unsupported field",
  );
  validateFingerprint(
    "operatorCoverage.primaryOperatorFingerprint",
    coverage.primaryOperatorFingerprint,
  );
  validateFingerprint(
    "operatorCoverage.backupOperatorFingerprint",
    coverage.backupOperatorFingerprint,
  );
  validateFingerprint(
    "operatorCoverage.releaseOwnerFingerprint",
    coverage.releaseOwnerFingerprint,
  );
  validateFingerprint(
    "operatorCoverage.rollbackOwnerFingerprint",
    coverage.rollbackOwnerFingerprint,
  );
  if (coverage.primaryOperatorFingerprint === coverage.backupOperatorFingerprint) {
    failures.push("operatorCoverage.primaryOperatorFingerprint must differ from backupOperatorFingerprint");
  }
  if (coverage.releaseOwnerFingerprint === coverage.rollbackOwnerFingerprint) {
    failures.push("operatorCoverage.releaseOwnerFingerprint must differ from rollbackOwnerFingerprint");
  }
  if (!Number.isInteger(coverage.liveWatchMinutes) || coverage.liveWatchMinutes < 60) {
    failures.push("operatorCoverage.liveWatchMinutes must be at least 60");
  }
}

function validateRollback(rollback, options) {
  if (!isRecord(rollback)) {
    failures.push("rollback must be an object");
    return;
  }
  validateAllowedKeys(rollback, ROLLBACK_KEYS, "rollback contains unsupported field");
  for (const key of [
    "rollbackDrillPassed",
    "killSwitchReleaseRequiresTwoPersonReview",
    "providerWriteQueueDrainPlanReady",
  ]) {
    validateBoolean(`rollback.${key}`, rollback[key]);
    if ((options.requirePass || hasValue(options.preflight)) && rollback[key] !== true) {
      failures.push(`rollback.${key} must be true`);
    }
  }
  if (
    !Number.isInteger(rollback.disableLiveExecutorWithinMinutes) ||
    rollback.disableLiveExecutorWithinMinutes < 1 ||
    rollback.disableLiveExecutorWithinMinutes > 15
  ) {
    failures.push("rollback.disableLiveExecutorWithinMinutes must be between 1 and 15");
  }
}

function validateObservability(observability, options) {
  validateAllTrueObject(
    observability,
    OBSERVABILITY_KEYS,
    "observability",
    "observability contains unsupported field",
    options,
  );
}

function validateLaunchWindow(window, options) {
  if (!isRecord(window)) {
    failures.push("launchWindow must be an object");
    return;
  }
  validateAllowedKeys(window, LAUNCH_WINDOW_KEYS, "launchWindow contains unsupported field");
  if (!isIsoTimestamp(window.startsAt)) {
    failures.push("launchWindow.startsAt must be an ISO timestamp");
  }
  if (!isIsoTimestamp(window.endsAt)) {
    failures.push("launchWindow.endsAt must be an ISO timestamp");
  }
  if (
    isIsoTimestamp(window.startsAt) &&
    isIsoTimestamp(window.endsAt) &&
    Date.parse(window.startsAt) >= Date.parse(window.endsAt)
  ) {
    failures.push("launchWindow.startsAt must be before launchWindow.endsAt");
  }
  if (
    !Number.isInteger(window.durationMinutes) ||
    window.durationMinutes < 15 ||
    window.durationMinutes > 120
  ) {
    failures.push("launchWindow.durationMinutes must be between 15 and 120");
  }
  validateBoolean("launchWindow.freezeWindowActive", window.freezeWindowActive);
  if ((options.requirePass || hasValue(options.preflight)) && window.freezeWindowActive !== true) {
    failures.push("launchWindow.freezeWindowActive must be true");
  }
}

function validateEvidence(evidence, options) {
  validateAllTrueObject(
    evidence,
    EVIDENCE_KEYS,
    "evidence",
    "evidence contains unsupported field",
    options,
  );
}

function validateArtifactBindings(artifactBindings) {
  if (!isRecord(artifactBindings)) {
    failures.push("artifactBindings must be an object");
    return;
  }
  validateAllowedKeys(
    artifactBindings,
    ARTIFACT_BINDING_KEYS,
    "artifactBindings contains unsupported field",
  );
  const hashes = [];
  for (const key of ARTIFACT_BINDING_KEYS) {
    validateSha256(`artifactBindings.${key}`, artifactBindings[key]);
    if (typeof artifactBindings[key] === "string") hashes.push(artifactBindings[key]);
  }
  if (
    hashes.length === ARTIFACT_BINDING_KEYS.size &&
    new Set(hashes).size !== hashes.length
  ) {
    failures.push("artifactBindings hashes must be distinct");
  }
}

function validateSafety(safety) {
  if (!isRecord(safety)) {
    failures.push("safety must be an object");
    return;
  }
  validateAllowedKeys(safety, SAFETY_KEYS, "safety contains unsupported field");
  for (const key of SAFETY_KEYS) {
    validateBoolean(`safety.${key}`, safety[key]);
    if (safety[key] !== false) {
      failures.push(`safety.${key} must be false`);
    }
  }
}

function validateAllTrueObject(value, allowedKeys, label, unsupportedMessage, options) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, allowedKeys, unsupportedMessage);
  for (const key of allowedKeys) {
    validateBoolean(`${label}.${key}`, value[key]);
    if ((options.requirePass || hasValue(options.preflight)) && value[key] !== true) {
      failures.push(`${label}.${key} must be true`);
    }
  }
}

function readJsonFile(file, label) {
  if (!existsSync(file)) {
    failures.push(`${label} file does not exist`);
    return undefined;
  }
  const stats = statSync(file);
  if (!stats.isFile()) {
    failures.push(`${label} path must point to a file`);
    return undefined;
  }
  if (stats.size > MAX_PREFLIGHT_BYTES) {
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

function readRequired(label, relativePath) {
  const absolutePath = join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${label}: missing file ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function parseArgs(values) {
  const parsed = {
    preflight: undefined,
    fromEnv: false,
    requirePass: false,
  };

  for (const value of values) {
    if (value === "--from-env") {
      parsed.fromEnv = true;
    } else if (value === "--require-pass") {
      parsed.requirePass = true;
    } else if (value.startsWith("--preflight=")) {
      parsed.preflight = readSafePreflightPath(value.slice("--preflight=".length));
    } else {
      failures.push(`Unknown argument: ${redactArgument(value)}`);
    }
  }

  return parsed;
}

function applySafeEnvDefaults(parsed, input) {
  if (!parsed.fromEnv) return parsed;

  const result = { ...parsed };
  if (
    !hasValue(result.preflight) &&
    hasValue(input.SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE)
  ) {
    result.preflight = readSafePreflightPath(
      input.SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE,
    );
  }
  result.requirePass =
    result.requirePass ||
    readBoolean(
      input.SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS,
      "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS",
    );
  return result;
}

function readSafePreflightPath(value) {
  if (
    hasValue(value) &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) &&
    !/[^/\s\\]+:[^/\s\\]+@/.test(value) &&
    !/^\\\\/.test(value)
  ) {
    const resolved = resolve(repoRoot, value);
    if (isPathInside(PREFLIGHT_ARTIFACT_DIR, resolved)) {
      return resolved;
    }
    failures.push("--preflight must be inside provider-write-live-pilot-preflight-artifacts");
    return undefined;
  }
  failures.push("--preflight must be a safe local path");
  return undefined;
}

function isPathInside(parent, child) {
  if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) {
    failures.push("provider write live pilot preflight artifact directory must not be a symlink");
    return false;
  }
  const repoRealPath = realpathSync(repoRoot);
  const parentRealPath = realpathIfExists(parent);
  if (!isResolvedPathInside(repoRealPath, parentRealPath)) {
    failures.push("provider write live pilot preflight artifact directory must stay inside repository");
    return false;
  }
  const childRealPath = realpathIfExists(child);
  return isResolvedPathInside(parentRealPath, childRealPath);
}

function isResolvedPathInside(parent, child) {
  const relativePath = relative(parent, child);
  return (
    relativePath === "" ||
    (relativePath.length > 0 &&
      !relativePath.startsWith("..") &&
      !isAbsolute(relativePath))
  );
}

function realpathIfExists(value) {
  return existsSync(value) ? realpathSync(value) : resolve(value);
}

function validateNoSensitiveFields(value) {
  walkForSensitiveValues(value);
}

function walkForSensitiveValues(value) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkForSensitiveValues(item));
    return;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (isForbiddenFieldName(key)) {
        failures.push("forbidden sensitive provider write live pilot preflight field");
      }
      walkForSensitiveValues(nested);
    }
    return;
  }
  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push("forbidden sensitive provider write live pilot preflight value");
  }
}

function isForbiddenFieldName(key) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return FORBIDDEN_FIELD_NAMES.has(normalized);
}

function hasForbiddenValue(value) {
  return FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function validateAllowedKeys(value, allowedKeys, message) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) failures.push(message);
  }
}

function mustContainAll(label, haystack, needles) {
  for (const needle of needles) {
    if (!haystack.includes(needle)) {
      failures.push(`${label}: missing ${needle}`);
    }
  }
}

function validateBoolean(label, value) {
  if (typeof value !== "boolean") {
    failures.push(`${label} must be a boolean`);
  }
}

function validateFingerprint(label, value) {
  if (typeof value !== "string" || !/^[a-f0-9]{12}$/.test(value)) {
    failures.push(`${label} must be a 12-character fingerprint`);
  }
}

function validateSha256(label, value) {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{64}$/.test(value) ||
    isPlaceholderSha256(value)
  ) {
    failures.push(`${label} must be a non-placeholder sha256 hash`);
  }
}

function isPlaceholderSha256(value) {
  return (
    /^0{64}$/.test(value) ||
    /^([a-f0-9])\1{63}$/.test(value) ||
    value === "0123456789abcdef".repeat(4) ||
    value === "deadbeef".repeat(8) ||
    new Set(value).size < 8
  );
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function readBoolean(value, label) {
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

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main();
