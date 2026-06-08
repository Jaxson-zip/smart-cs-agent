import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const MAX_LEDGER_BYTES = 512 * 1024;
const LEDGER_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-live-pilot-run-ledger-artifacts",
);

const ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "launchWindow",
  "summary",
  "runRecords",
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
const LAUNCH_WINDOW_KEYS = new Set([
  "startsAt",
  "endsAt",
  "closedAt",
  "durationMinutes",
  "freezeWindowActive",
]);
const SUMMARY_KEYS = new Set([
  "totalRuns",
  "succeededRuns",
  "failedRuns",
  "rolledBackRuns",
  "blockedRuns",
  "allRunsReviewed",
  "failedRunsHaveIncidentNotes",
  "rollbackActionsVerified",
  "noAutoCustomerReplies",
]);
const RUN_RECORD_KEYS = new Set([
  "runFingerprint",
  "requestFingerprint",
  "executionAttemptFingerprint",
  "auditLogSha256",
  "operatorFingerprint",
  "reviewerFingerprint",
  "rollbackOwnerFingerprint",
  "action",
  "riskLevel",
  "status",
  "networkExecution",
  "providerMutationExecuted",
  "customerVisibleMessageSent",
  "providerResponseStored",
  "providerPayloadStored",
  "createdAt",
  "completedAt",
]);
const EVIDENCE_KEYS = new Set([
  "providerWriteLivePilotPreflightVerifierPassed",
  "productionProviderWriteApprovalVerifierPassed",
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "auditExportVerified",
  "postPilotReviewCompleted",
  "productionLaunchVerifierPassed",
]);
const ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteLivePilotPreflightSha256",
  "productionProviderWriteApprovalSha256",
  "providerWriteKillSwitchControlPlaneSha256",
  "providerWriteLiveExecutorStartupGuardSha256",
  "providerWriteLiveExecutorControlPlaneSha256",
  "productionLaunchSha256",
  "auditExportSha256",
]);
const SAFETY_KEYS = new Set([
  "secretsInLedger",
  "rawTenantIdsInLedger",
  "customerDataInLedger",
  "providerPayloadsInLedger",
  "providerResponsesInLedger",
  "rawIdempotencyKeysInLedger",
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
const RUN_STATUSES = new Set([
  "succeeded",
  "failed",
  "rolled_back",
  "blocked",
]);
const NETWORK_EXECUTION = new Set([
  "provider_api_called",
  "blocked_before_network",
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
  if (hasValue(args.ledger)) {
    const ledger = readJsonFile(args.ledger, "Provider write live pilot run ledger");
    if (ledger) {
      validateLedger(ledger, args);
      if (isRecord(ledger) && isRecord(ledger.target)) {
        channel = ledger.target.channel;
      }
    }
  } else if (args.requirePass) {
    failures.push("provider write live pilot run ledger evidence is required when pass evidence is required");
  }

  if (failures.length > 0) {
    console.error("Provider write live pilot run ledger verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write live pilot run ledger verification passed.");
  if (hasValue(args.ledger)) {
    console.log(`- channel=${channel}`);
    console.log("- ledger=verified");
  } else {
    console.log("- ledger=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    gitignore: ".gitignore",
    ledgerDocs: "docs/deploy/provider-write-live-pilot-run-ledger.md",
    providerWriteDocs: "docs/deploy/provider-write-requests.md",
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
    "verify:provider-write-live-pilot-run-ledger",
    "verify:provider-write-live-pilot-run-ledger:safe",
    "\"verify:provider-write-live-pilot-run-ledger:safe\": \"node scripts/verify-provider-write-live-pilot-run-ledger.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-live-pilot-run-ledger.mjs",
  ]);

  mustContainAll("provider write live pilot run ledger docs", content.ledgerDocs, [
    "PR69 Provider Write Live Pilot Run Ledger Gate",
    "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
    "npm run verify:provider-write-live-pilot-run-ledger",
    "npm run verify:provider-write-live-pilot-run-ledger:safe",
    "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_REQUIRE_PASS=true",
    "single_merchant_pilot",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR69 Provider Write Live Pilot Run Ledger Gate",
    "verify:provider-write-live-pilot-run-ledger",
    "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR69 Provider Write Live Pilot Run Ledger Gate",
    "verify:provider-write-live-pilot-run-ledger",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "verify:provider-write-live-pilot-run-ledger",
    "verify:provider-write-live-pilot-run-ledger:safe",
    "docs/deploy/provider-write-live-pilot-run-ledger.md",
    "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-live-pilot-run-ledger.test.mjs",
    "npm run verify:provider-write-live-pilot-run-ledger",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-live-pilot-run-ledger.test.mjs",
    "npm run verify:provider-write-live-pilot-run-ledger",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "verify-provider-write-live-pilot-run-ledger.mjs",
    "verify:provider-write-live-pilot-run-ledger",
    "provider write live pilot run ledger",
  ]);

  mustContainAll("task plan references", content.taskPlan, [
    "PR69 - Provider Write Live Pilot Run Ledger Gate",
    "verify:provider-write-live-pilot-run-ledger",
  ]);

  mustContainAll("progress references", content.progress, [
    "Started PR69 provider write live pilot run ledger gate",
  ]);

  mustContainAll("gitignore live pilot run ledger artifacts", content.gitignore, [
    "provider-write-live-pilot-run-ledger-artifacts/",
  ]);
}

function validateLedger(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write live pilot run ledger root must be an object");
    return;
  }

  validateAllowedKeys(
    value,
    ROOT_KEYS,
    "provider write live pilot run ledger contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-live-pilot-run-ledger.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-live-pilot-run-ledger.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    failures.push("generatedAt must be an ISO timestamp");
  }

  validateTarget(value.target);
  validateLaunchWindow(value.launchWindow, options);
  validateRunRecords(value.runRecords, value.launchWindow, options);
  validateSummary(value.summary, value.runRecords, options);
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
  if (!isIsoTimestamp(window.closedAt)) {
    failures.push("launchWindow.closedAt must be an ISO timestamp");
  }
  if (
    isIsoTimestamp(window.startsAt) &&
    isIsoTimestamp(window.endsAt) &&
    Date.parse(window.startsAt) >= Date.parse(window.endsAt)
  ) {
    failures.push("launchWindow.startsAt must be before launchWindow.endsAt");
  }
  if (
    isIsoTimestamp(window.endsAt) &&
    isIsoTimestamp(window.closedAt) &&
    Date.parse(window.closedAt) < Date.parse(window.endsAt)
  ) {
    failures.push("launchWindow.closedAt must be at or after launchWindow.endsAt");
  }
  if (
    !Number.isInteger(window.durationMinutes) ||
    window.durationMinutes < 15 ||
    window.durationMinutes > 120
  ) {
    failures.push("launchWindow.durationMinutes must be between 15 and 120");
  }
  validateBoolean("launchWindow.freezeWindowActive", window.freezeWindowActive);
  if ((options.requirePass || hasValue(options.ledger)) && window.freezeWindowActive !== true) {
    failures.push("launchWindow.freezeWindowActive must be true");
  }
}

function validateSummary(summary, runRecords, options) {
  if (!isRecord(summary)) {
    failures.push("summary must be an object");
    return;
  }
  validateAllowedKeys(summary, SUMMARY_KEYS, "summary contains unsupported field");
  for (const key of [
    "totalRuns",
    "succeededRuns",
    "failedRuns",
    "rolledBackRuns",
    "blockedRuns",
  ]) {
    validateIntegerInRange(`summary.${key}`, summary[key], 0, 50);
  }
  const records = Array.isArray(runRecords) ? runRecords : [];
  const counts = countRunStatuses(records);
  if (summary.totalRuns !== records.length) {
    failures.push("summary.totalRuns must match runRecords length");
  }
  if (summary.succeededRuns !== counts.succeeded) {
    failures.push("summary.succeededRuns must match run record statuses");
  }
  if (summary.failedRuns !== counts.failed) {
    failures.push("summary.failedRuns must match run record statuses");
  }
  if (summary.rolledBackRuns !== counts.rolled_back) {
    failures.push("summary.rolledBackRuns must match run record statuses");
  }
  if (summary.blockedRuns !== counts.blocked) {
    failures.push("summary.blockedRuns must match run record statuses");
  }
  for (const key of [
    "allRunsReviewed",
    "failedRunsHaveIncidentNotes",
    "rollbackActionsVerified",
    "noAutoCustomerReplies",
  ]) {
    validateBoolean(`summary.${key}`, summary[key]);
  }
  if ((options.requirePass || hasValue(options.ledger)) && summary.allRunsReviewed !== true) {
    failures.push("summary.allRunsReviewed must be true");
  }
  if ((options.requirePass || hasValue(options.ledger)) && summary.noAutoCustomerReplies !== true) {
    failures.push("summary.noAutoCustomerReplies must be true");
  }
  if (summary.failedRuns > 0 && summary.failedRunsHaveIncidentNotes !== true) {
    failures.push("summary.failedRunsHaveIncidentNotes must be true when failedRuns is greater than 0");
  }
  if (summary.rolledBackRuns > 0 && summary.rollbackActionsVerified !== true) {
    failures.push("summary.rollbackActionsVerified must be true when rolledBackRuns is greater than 0");
  }
  const failedProviderMutationIndexes = records.flatMap((record, index) =>
    isRecord(record) &&
    record.status === "failed" &&
    record.providerMutationExecuted === true
      ? [index]
      : [],
  );
  if (
    failedProviderMutationIndexes.length > 0 &&
    summary.rollbackActionsVerified !== true
  ) {
    failures.push("summary.rollbackActionsVerified must be true when failed provider mutations exist");
    for (const index of failedProviderMutationIndexes) {
      failures.push(
        `runRecords[${index}].status cannot be failed with providerMutationExecuted=true without rollback verification`,
      );
    }
  }
}

function validateRunRecords(records, launchWindow, options) {
  if (!Array.isArray(records)) {
    failures.push("runRecords must be an array");
    return;
  }
  if ((options.requirePass || hasValue(options.ledger)) && records.length === 0) {
    failures.push("runRecords must contain at least one record when ledger evidence is required");
  }
  if (records.length > 50) {
    failures.push("runRecords must contain at most 50 records");
  }
  const fingerprints = new Set();
  const launchWindowBounds = getLaunchWindowBounds(launchWindow);
  records.forEach((record, index) =>
    validateRunRecord(record, index, fingerprints, launchWindowBounds),
  );
}

function validateRunRecord(record, index, fingerprints, launchWindowBounds) {
  const label = `runRecords[${index}]`;
  if (!isRecord(record)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(record, RUN_RECORD_KEYS, `${label} contains unsupported field`);
  validateSha256(`${label}.runFingerprint`, record.runFingerprint);
  if (typeof record.runFingerprint === "string") {
    if (fingerprints.has(record.runFingerprint)) {
      failures.push("runRecords runFingerprint values must be distinct");
    }
    fingerprints.add(record.runFingerprint);
  }
  validateFingerprint(`${label}.requestFingerprint`, record.requestFingerprint);
  validateFingerprint(
    `${label}.executionAttemptFingerprint`,
    record.executionAttemptFingerprint,
  );
  validateSha256(`${label}.auditLogSha256`, record.auditLogSha256);
  validateFingerprint(`${label}.operatorFingerprint`, record.operatorFingerprint);
  validateFingerprint(`${label}.reviewerFingerprint`, record.reviewerFingerprint);
  validateFingerprint(
    `${label}.rollbackOwnerFingerprint`,
    record.rollbackOwnerFingerprint,
  );
  if (!FIRST_PILOT_ACTIONS.has(record.action)) {
    failures.push(`${label}.action must be a first-pilot provider write action`);
  }
  if (record.riskLevel !== "low") {
    failures.push(`${label}.riskLevel must be low`);
  }
  if (!RUN_STATUSES.has(record.status)) {
    failures.push(`${label}.status must be succeeded, failed, rolled_back, or blocked`);
  }
  if (!NETWORK_EXECUTION.has(record.networkExecution)) {
    failures.push(`${label}.networkExecution must be provider_api_called or blocked_before_network`);
  }
  validateBoolean(`${label}.providerMutationExecuted`, record.providerMutationExecuted);
  validateBoolean(`${label}.customerVisibleMessageSent`, record.customerVisibleMessageSent);
  validateBoolean(`${label}.providerResponseStored`, record.providerResponseStored);
  validateBoolean(`${label}.providerPayloadStored`, record.providerPayloadStored);
  if (record.customerVisibleMessageSent !== false) {
    failures.push(`${label}.customerVisibleMessageSent must be false`);
  }
  if (record.providerResponseStored !== false) {
    failures.push(`${label}.providerResponseStored must be false`);
  }
  if (record.providerPayloadStored !== false) {
    failures.push(`${label}.providerPayloadStored must be false`);
  }
  if (
    (record.status === "succeeded" || record.status === "rolled_back") &&
    record.providerMutationExecuted !== true
  ) {
    failures.push(`${label}.providerMutationExecuted must be true for succeeded or rolled_back runs`);
  }
  if (record.status === "blocked" && record.providerMutationExecuted !== false) {
    failures.push(`${label}.providerMutationExecuted must be false for blocked runs`);
  }
  if (
    record.status === "blocked" &&
    record.networkExecution !== "blocked_before_network"
  ) {
    failures.push(`${label}.networkExecution must be blocked_before_network for blocked runs`);
  }
  if (!isIsoTimestamp(record.createdAt)) {
    failures.push(`${label}.createdAt must be an ISO timestamp`);
  }
  if (!isIsoTimestamp(record.completedAt)) {
    failures.push(`${label}.completedAt must be an ISO timestamp`);
  }
  if (
    isIsoTimestamp(record.createdAt) &&
    isIsoTimestamp(record.completedAt) &&
    Date.parse(record.createdAt) > Date.parse(record.completedAt)
  ) {
    failures.push(`${label}.createdAt must be before or equal to completedAt`);
  }
  if (
    launchWindowBounds &&
    isIsoTimestamp(record.createdAt) &&
    !isTimestampInsideWindow(record.createdAt, launchWindowBounds)
  ) {
    failures.push(`${label}.createdAt must be inside launchWindow`);
  }
  if (
    launchWindowBounds &&
    isIsoTimestamp(record.completedAt) &&
    !isTimestampInsideWindow(record.completedAt, launchWindowBounds)
  ) {
    failures.push(`${label}.completedAt must be inside launchWindow`);
  }
}

function getLaunchWindowBounds(window) {
  if (
    !isRecord(window) ||
    !isIsoTimestamp(window.startsAt) ||
    !isIsoTimestamp(window.endsAt)
  ) {
    return undefined;
  }
  const startsAtMs = Date.parse(window.startsAt);
  const endsAtMs = Date.parse(window.endsAt);
  if (startsAtMs > endsAtMs) return undefined;
  return { startsAtMs, endsAtMs };
}

function isTimestampInsideWindow(value, window) {
  const timestampMs = Date.parse(value);
  return timestampMs >= window.startsAtMs && timestampMs <= window.endsAtMs;
}

function countRunStatuses(records) {
  const counts = { succeeded: 0, failed: 0, rolled_back: 0, blocked: 0 };
  for (const record of records) {
    if (isRecord(record) && RUN_STATUSES.has(record.status)) {
      counts[record.status] += 1;
    }
  }
  return counts;
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
    if ((options.requirePass || hasValue(options.ledger)) && value[key] !== true) {
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
  if (stats.size > MAX_LEDGER_BYTES) {
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
    ledger: undefined,
    fromEnv: false,
    requirePass: false,
  };

  for (const value of values) {
    if (value === "--from-env") {
      parsed.fromEnv = true;
    } else if (value === "--require-pass") {
      parsed.requirePass = true;
    } else if (value.startsWith("--ledger=")) {
      parsed.ledger = readSafeLedgerPath(value.slice("--ledger=".length));
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
    !hasValue(result.ledger) &&
    hasValue(input.SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE)
  ) {
    result.ledger = readSafeLedgerPath(
      input.SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE,
    );
  }
  result.requirePass =
    result.requirePass ||
    readBoolean(
      input.SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_REQUIRE_PASS,
      "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_REQUIRE_PASS",
    );
  return result;
}

function readSafeLedgerPath(value) {
  if (
    hasValue(value) &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) &&
    !/[^/\s\\]+:[^/\s\\]+@/.test(value) &&
    !/^\\\\/.test(value)
  ) {
    const resolved = resolve(repoRoot, value);
    if (isPathInside(LEDGER_ARTIFACT_DIR, resolved)) {
      return resolved;
    }
    failures.push("--ledger must be inside provider-write-live-pilot-run-ledger-artifacts");
    return undefined;
  }
  failures.push("--ledger must be a safe local path");
  return undefined;
}

function isPathInside(parent, child) {
  if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) {
    failures.push("provider write live pilot run ledger artifact directory must not be a symlink");
    return false;
  }
  const repoRealPath = realpathSync(repoRoot);
  const parentRealPath = realpathIfExists(parent);
  if (!isResolvedPathInside(repoRealPath, parentRealPath)) {
    failures.push("provider write live pilot run ledger artifact directory must stay inside repository");
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
        failures.push("forbidden sensitive provider write live pilot run ledger field");
      }
      walkForSensitiveValues(nested);
    }
    return;
  }
  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push("forbidden sensitive provider write live pilot run ledger value");
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

function validateIntegerInRange(label, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    failures.push(`${label} must be between ${min} and ${max}`);
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
