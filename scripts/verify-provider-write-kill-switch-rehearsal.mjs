import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const MAX_REHEARSAL_BYTES = 256 * 1024;
const REHEARSAL_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-kill-switch-rehearsal-artifacts",
);

const ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "rehearsal",
  "engage",
  "executionBlock",
  "release",
  "controls",
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
const REHEARSAL_KEYS = new Set([
  "rehearsalId",
  "initiatedByFingerprint",
  "observedByFingerprint",
  "secondObserverFingerprint",
  "rehearsalMode",
]);
const ENGAGE_KEYS = new Set([
  "action",
  "reasonCode",
  "requestedAt",
  "statusSource",
  "emergencyStopEngaged",
  "effectiveKillSwitchEnabled",
  "stateFingerprint",
  "idempotencyKeyHashFingerprint",
  "adminRouteVerified",
]);
const EXECUTION_BLOCK_KEYS = new Set([
  "attemptedAt",
  "requestFingerprint",
  "attemptFingerprint",
  "status",
  "policyReason",
  "networkExecution",
  "providerMutationExecuted",
  "customerVisibleMessageSent",
  "payloadEscrowOpened",
]);
const RELEASE_KEYS = new Set([
  "action",
  "reasonCode",
  "requestedAt",
  "persistedEmergencyStopReleased",
  "envKillSwitchStillControlled",
  "realWritesEnabled",
  "stateFingerprint",
  "idempotencyKeyHashFingerprint",
  "adminRouteVerified",
]);
const CONTROL_KEYS = new Set([
  "adminOnlyApiVerified",
  "bffAdminOnlyVerified",
  "twoPersonObservationVerified",
  "idempotencyVerified",
  "auditTrailVerified",
  "executionBlockedWhileEngaged",
  "releaseDoesNotEnableWrites",
  "noProviderCredentialsRead",
  "noProviderNetworkCalls",
  "noPayloadEscrowOpened",
  "noCustomerVisibleReplySent",
  "noProviderMutationExecuted",
]);
const EVIDENCE_KEYS = new Set([
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "providerWriteExecutionAttemptsVerifierPassed",
  "productionProviderWriteApprovalVerifierPassed",
  "productionLaunchVerifierPassed",
]);
const ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteKillSwitchControlPlaneSha256",
  "providerWriteExecutionAttemptSha256",
  "productionProviderWriteApprovalSha256",
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
const REASON_CODES = new Set([
  "incident_response",
  "provider_anomaly",
  "operator_error",
  "launch_rehearsal",
  "post_incident_restore",
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
  if (hasValue(args.rehearsal)) {
    const rehearsal = readJsonFile(args.rehearsal, "Provider write kill switch rehearsal");
    if (rehearsal) {
      validateRehearsal(rehearsal, args);
      if (isRecord(rehearsal) && isRecord(rehearsal.target)) {
        channel = rehearsal.target.channel;
      }
    }
  } else if (args.requirePass) {
    failures.push("provider write kill switch rehearsal evidence is required when pass evidence is required");
  }

  if (failures.length > 0) {
    console.error("Provider write kill switch rehearsal verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write kill switch rehearsal verification passed.");
  if (hasValue(args.rehearsal)) {
    console.log(`- channel=${channel}`);
    console.log("- rehearsal=verified");
  } else {
    console.log("- rehearsal=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    gitignore: ".gitignore",
    rehearsalDocs: "docs/deploy/provider-write-kill-switch-rehearsal.md",
    providerWriteDocs: "docs/deploy/provider-write-requests.md",
    productionProviderWriteApproval:
      "docs/deploy/production-provider-write-approval.md",
    productionReadiness: "docs/deploy/production-readiness.md",
    launchRunbook: "docs/deploy/production-launch-runbook.md",
    staticCiWorkflow: ".github/workflows/production-static-gates.yml",
    staticCiVerifier: "scripts/verify-production-static-ci.mjs",
    productionLaunchVerifier: "scripts/verify-production-launch.mjs",
    productionProviderWriteApprovalVerifier:
      "scripts/verify-production-provider-write-approval.mjs",
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
    "verify:provider-write-kill-switch-rehearsal",
    "verify:provider-write-kill-switch-rehearsal:safe",
    "\"verify:provider-write-kill-switch-rehearsal:safe\": \"node scripts/verify-provider-write-kill-switch-rehearsal.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-kill-switch-rehearsal.mjs",
  ]);

  mustContainAll("provider write kill switch rehearsal docs", content.rehearsalDocs, [
    "PR67 Provider Write Kill Switch Rehearsal Evidence Gate",
    "smart-cs-agent.provider-write-kill-switch-rehearsal.v1",
    "npm run verify:provider-write-kill-switch-rehearsal",
    "npm run verify:provider-write-kill-switch-rehearsal:safe",
    "SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE",
    "SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS=true",
    "emergency_stop_engaged",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR67 Provider Write Kill Switch Rehearsal Evidence Gate",
    "verify:provider-write-kill-switch-rehearsal",
    "smart-cs-agent.provider-write-kill-switch-rehearsal.v1",
  ]);

  mustContainAll("production provider write approval docs", content.productionProviderWriteApproval, [
    "verify:provider-write-kill-switch-rehearsal",
    "provider-write-kill-switch-rehearsal-artifacts",
    "providerWriteKillSwitchSha256",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR67 Provider Write Kill Switch Rehearsal Evidence Gate",
    "verify:provider-write-kill-switch-rehearsal",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "verify:provider-write-kill-switch-rehearsal",
    "verify:provider-write-kill-switch-rehearsal:safe",
    "docs/deploy/provider-write-kill-switch-rehearsal.md",
    "SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE",
    "SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-kill-switch-rehearsal.test.mjs",
    "npm run verify:provider-write-kill-switch-rehearsal",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-kill-switch-rehearsal.test.mjs",
    "npm run verify:provider-write-kill-switch-rehearsal",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "verify-provider-write-kill-switch-rehearsal.mjs",
    "verify:provider-write-kill-switch-rehearsal",
    "provider write kill switch rehearsal",
  ]);

  mustContainAll(
    "production provider write approval verifier wiring",
    content.productionProviderWriteApprovalVerifier,
    [
      "verify:provider-write-kill-switch-rehearsal",
      "providerWriteKillSwitchSha256",
      "provider-write-kill-switch-rehearsal-artifacts",
    ],
  );

  mustContainAll("task plan references", content.taskPlan, [
    "PR67 - Provider Write Kill Switch Rehearsal Evidence Gate",
    "verify:provider-write-kill-switch-rehearsal",
  ]);

  mustContainAll("progress references", content.progress, [
    "Started PR67 provider write kill switch rehearsal evidence gate",
  ]);

  mustContainAll("gitignore rehearsal artifacts", content.gitignore, [
    "provider-write-kill-switch-rehearsal-artifacts/",
  ]);
}

function validateRehearsal(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write kill switch rehearsal root must be an object");
    return;
  }

  validateAllowedKeys(
    value,
    ROOT_KEYS,
    "provider write kill switch rehearsal contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-kill-switch-rehearsal.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-kill-switch-rehearsal.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    failures.push("generatedAt must be an ISO timestamp");
  }

  validateTarget(value.target);
  validateRehearsalHeader(value.rehearsal);
  validateEngage(value.engage, options);
  validateExecutionBlock(value.executionBlock);
  validateRelease(value.release, options);
  validateRehearsalConsistency(value);
  validateControls(value.controls, options);
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

function validateRehearsalHeader(rehearsal) {
  if (!isRecord(rehearsal)) {
    failures.push("rehearsal must be an object");
    return;
  }
  validateAllowedKeys(rehearsal, REHEARSAL_KEYS, "rehearsal contains unsupported field");
  if (
    typeof rehearsal.rehearsalId !== "string" ||
    !/^[A-Za-z0-9._-]{6,120}$/.test(rehearsal.rehearsalId)
  ) {
    failures.push("rehearsal.rehearsalId must be a safe id");
  }
  validateFingerprint("rehearsal.initiatedByFingerprint", rehearsal.initiatedByFingerprint);
  validateFingerprint("rehearsal.observedByFingerprint", rehearsal.observedByFingerprint);
  validateFingerprint(
    "rehearsal.secondObserverFingerprint",
    rehearsal.secondObserverFingerprint,
  );
  if (
    typeof rehearsal.observedByFingerprint === "string" &&
    rehearsal.observedByFingerprint === rehearsal.secondObserverFingerprint
  ) {
    failures.push("rehearsal observedByFingerprint and secondObserverFingerprint must be different");
  }
  if (
    typeof rehearsal.initiatedByFingerprint === "string" &&
    (rehearsal.initiatedByFingerprint === rehearsal.observedByFingerprint ||
      rehearsal.initiatedByFingerprint === rehearsal.secondObserverFingerprint)
  ) {
    failures.push("rehearsal observer fingerprints must be distinct from initiator");
  }
  if (rehearsal.rehearsalMode !== "local_control_plane") {
    failures.push("rehearsal.rehearsalMode must be local_control_plane");
  }
}

function validateEngage(engage, options) {
  if (!isRecord(engage)) {
    failures.push("engage must be an object");
    return;
  }
  validateAllowedKeys(engage, ENGAGE_KEYS, "engage contains unsupported field");
  if (engage.action !== "engage") failures.push("engage.action must be engage");
  if (!REASON_CODES.has(engage.reasonCode)) {
    failures.push("engage.reasonCode must be a controlled reason code");
  }
  if (!isIsoTimestamp(engage.requestedAt)) {
    failures.push("engage.requestedAt must be an ISO timestamp");
  }
  if (engage.statusSource !== "emergency_stop") {
    failures.push("engage.statusSource must be emergency_stop");
  }
  validateBoolean("engage.emergencyStopEngaged", engage.emergencyStopEngaged);
  validateBoolean("engage.effectiveKillSwitchEnabled", engage.effectiveKillSwitchEnabled);
  validateBoolean("engage.adminRouteVerified", engage.adminRouteVerified);
  if ((options.requirePass || hasValue(options.rehearsal)) && engage.emergencyStopEngaged !== true) {
    failures.push("engage.emergencyStopEngaged must be true");
  }
  if ((options.requirePass || hasValue(options.rehearsal)) && engage.effectiveKillSwitchEnabled !== true) {
    failures.push("engage.effectiveKillSwitchEnabled must be true");
  }
  if ((options.requirePass || hasValue(options.rehearsal)) && engage.adminRouteVerified !== true) {
    failures.push("engage.adminRouteVerified must be true");
  }
  validateFingerprint("engage.stateFingerprint", engage.stateFingerprint);
  validateFingerprint(
    "engage.idempotencyKeyHashFingerprint",
    engage.idempotencyKeyHashFingerprint,
  );
}

function validateExecutionBlock(block) {
  if (!isRecord(block)) {
    failures.push("executionBlock must be an object");
    return;
  }
  validateAllowedKeys(
    block,
    EXECUTION_BLOCK_KEYS,
    "executionBlock contains unsupported field",
  );
  if (!isIsoTimestamp(block.attemptedAt)) {
    failures.push("executionBlock.attemptedAt must be an ISO timestamp");
  }
  validateFingerprint("executionBlock.requestFingerprint", block.requestFingerprint);
  validateFingerprint("executionBlock.attemptFingerprint", block.attemptFingerprint);
  if (block.status !== "blocked") {
    failures.push("executionBlock.status must be blocked");
  }
  if (block.policyReason !== "emergency_stop_engaged") {
    failures.push("executionBlock.policyReason must be emergency_stop_engaged");
  }
  if (block.networkExecution !== "not_started") {
    failures.push("executionBlock.networkExecution must be not_started");
  }
  validateFalse("executionBlock.providerMutationExecuted", block.providerMutationExecuted);
  validateFalse(
    "executionBlock.customerVisibleMessageSent",
    block.customerVisibleMessageSent,
  );
  validateFalse("executionBlock.payloadEscrowOpened", block.payloadEscrowOpened);
}

function validateRelease(release, options) {
  if (!isRecord(release)) {
    failures.push("release must be an object");
    return;
  }
  validateAllowedKeys(release, RELEASE_KEYS, "release contains unsupported field");
  if (release.action !== "release") failures.push("release.action must be release");
  if (!REASON_CODES.has(release.reasonCode)) {
    failures.push("release.reasonCode must be a controlled reason code");
  }
  if (!isIsoTimestamp(release.requestedAt)) {
    failures.push("release.requestedAt must be an ISO timestamp");
  }
  validateBoolean(
    "release.persistedEmergencyStopReleased",
    release.persistedEmergencyStopReleased,
  );
  validateBoolean("release.envKillSwitchStillControlled", release.envKillSwitchStillControlled);
  validateBoolean("release.realWritesEnabled", release.realWritesEnabled);
  validateBoolean("release.adminRouteVerified", release.adminRouteVerified);
  if ((options.requirePass || hasValue(options.rehearsal)) && release.persistedEmergencyStopReleased !== true) {
    failures.push("release.persistedEmergencyStopReleased must be true");
  }
  if ((options.requirePass || hasValue(options.rehearsal)) && release.envKillSwitchStillControlled !== true) {
    failures.push("release.envKillSwitchStillControlled must be true");
  }
  if (release.realWritesEnabled !== false) {
    failures.push("release.realWritesEnabled must be false");
  }
  if ((options.requirePass || hasValue(options.rehearsal)) && release.adminRouteVerified !== true) {
    failures.push("release.adminRouteVerified must be true");
  }
  validateFingerprint("release.stateFingerprint", release.stateFingerprint);
  validateFingerprint(
    "release.idempotencyKeyHashFingerprint",
    release.idempotencyKeyHashFingerprint,
  );
}

function validateRehearsalConsistency(value) {
  const { engage, executionBlock, release } = value;
  if (!isRecord(engage) || !isRecord(executionBlock) || !isRecord(release)) {
    return;
  }

  if (
    isIsoTimestamp(engage.requestedAt) &&
    isIsoTimestamp(executionBlock.attemptedAt) &&
    Date.parse(engage.requestedAt) > Date.parse(executionBlock.attemptedAt)
  ) {
    failures.push("engage.requestedAt must be before or equal to executionBlock.attemptedAt");
  }

  if (
    isIsoTimestamp(executionBlock.attemptedAt) &&
    isIsoTimestamp(release.requestedAt) &&
    Date.parse(executionBlock.attemptedAt) > Date.parse(release.requestedAt)
  ) {
    failures.push("executionBlock.attemptedAt must be before or equal to release.requestedAt");
  }

  if (
    typeof engage.stateFingerprint === "string" &&
    typeof release.stateFingerprint === "string" &&
    engage.stateFingerprint === release.stateFingerprint
  ) {
    failures.push("engage and release state fingerprints must differ");
  }
}

function validateControls(controls, options) {
  if (!isRecord(controls)) {
    failures.push("controls must be an object");
    return;
  }
  validateAllowedKeys(controls, CONTROL_KEYS, "controls contains unsupported field");
  for (const key of CONTROL_KEYS) {
    validateBoolean(`controls.${key}`, controls[key]);
    if ((options.requirePass || hasValue(options.rehearsal)) && controls[key] !== true) {
      failures.push(`controls.${key} must be true`);
    }
  }
}

function validateEvidence(evidence, options) {
  if (!isRecord(evidence)) {
    failures.push("evidence must be an object");
    return;
  }
  validateAllowedKeys(evidence, EVIDENCE_KEYS, "evidence contains unsupported field");
  for (const key of EVIDENCE_KEYS) {
    validateBoolean(`evidence.${key}`, evidence[key]);
    if ((options.requirePass || hasValue(options.rehearsal)) && evidence[key] !== true) {
      failures.push(`evidence.${key} must be true`);
    }
  }
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
  if (stats.size > MAX_REHEARSAL_BYTES) {
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
    rehearsal: undefined,
    fromEnv: false,
    requirePass: false,
  };

  for (const value of values) {
    if (value === "--from-env") {
      parsed.fromEnv = true;
    } else if (value === "--require-pass") {
      parsed.requirePass = true;
    } else if (value.startsWith("--rehearsal=")) {
      parsed.rehearsal = readSafeRehearsalPath(value.slice("--rehearsal=".length));
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
    !hasValue(result.rehearsal) &&
    hasValue(input.SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE)
  ) {
    result.rehearsal = readSafeRehearsalPath(
      input.SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE,
    );
  }
  result.requirePass =
    result.requirePass ||
    readBoolean(
      input.SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS,
      "SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS",
    );
  return result;
}

function readSafeRehearsalPath(value) {
  if (
    hasValue(value) &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) &&
    !/[^/\s\\]+:[^/\s\\]+@/.test(value) &&
    !/^\\\\/.test(value)
  ) {
    const resolved = resolve(repoRoot, value);
    if (isPathInside(REHEARSAL_ARTIFACT_DIR, resolved)) {
      return resolved;
    }
    failures.push("--rehearsal must be inside provider-write-kill-switch-rehearsal-artifacts");
    return undefined;
  }
  failures.push("--rehearsal must be a safe local path");
  return undefined;
}

function isPathInside(parent, child) {
  if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) {
    failures.push("provider write kill switch rehearsal artifact directory must not be a symlink");
    return false;
  }
  const repoRealPath = realpathSync(repoRoot);
  const parentRealPath = realpathIfExists(parent);
  if (!isResolvedPathInside(repoRealPath, parentRealPath)) {
    failures.push("provider write kill switch rehearsal artifact directory must stay inside repository");
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
        failures.push("forbidden sensitive provider write kill switch rehearsal field");
      }
      walkForSensitiveValues(nested);
    }
    return;
  }
  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push("forbidden sensitive provider write kill switch rehearsal value");
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

function validateFalse(label, value) {
  if (value !== false) {
    failures.push(`${label} must be false`);
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
