import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const MAX_REVIEW_BYTES = 256 * 1024;
const REVIEW_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-manual-closeout-review-artifacts",
);

const ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "launchWindow",
  "runSummary",
  "reviewers",
  "closeout",
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
const RUN_SUMMARY_KEYS = new Set([
  "totalRuns",
  "succeededRuns",
  "failedRuns",
  "rolledBackRuns",
  "blockedRuns",
  "failedProviderMutationRuns",
  "allRunsReviewed",
  "failedRunsHaveIncidentNotes",
  "rollbackActionsVerified",
  "noAutoCustomerReplies",
]);
const REVIEWER_KEYS = new Set([
  "releaseOwnerFingerprint",
  "operationsReviewerFingerprint",
  "rollbackOwnerFingerprint",
  "reviewedAt",
  "secondReviewCompleted",
]);
const CLOSEOUT_KEYS = new Set([
  "decision",
  "customerImpactReviewed",
  "providerMutationReviewCompleted",
  "incidentReviewCompleted",
  "rollbackReviewCompleted",
  "evidencePackageReviewed",
  "outstandingActions",
]);
const EVIDENCE_KEYS = new Set([
  "ledgerDraftExportReviewed",
  "auditExportReviewed",
  "providerWriteLivePilotRunLedgerVerifierReady",
  "productionLaunchVerifierPassed",
]);
const ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteLivePilotRunLedgerDraftSha256",
  "auditExportSha256",
  "productionLaunchSha256",
]);
const SAFETY_KEYS = new Set([
  "secretsInReview",
  "rawTenantIdsInReview",
  "customerDataInReview",
  "providerPayloadsInReview",
  "providerResponsesInReview",
  "rawIdempotencyKeysInReview",
  "networkExecutedByVerifier",
  "providerWriteExecutedByVerifier",
  "payloadEscrowOpenedByVerifier",
  "credentialsReadByVerifier",
  "customerVisibleActionsSentByVerifier",
]);
const CHANNELS = new Set(["taobao", "douyin"]);
const DECISIONS = new Set([
  "approved_for_safe_ledger",
  "rejected_needs_investigation",
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
  if (hasValue(args.review)) {
    const review = readJsonFile(args.review, "Provider write manual closeout review");
    if (review) {
      validateReview(review, args);
      if (isRecord(review) && isRecord(review.target)) {
        channel = review.target.channel;
      }
    }
  } else if (args.requirePass) {
    failures.push("provider write manual closeout review evidence is required when pass evidence is required");
  }

  if (failures.length > 0) {
    console.error("Provider write manual closeout review verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write manual closeout review verification passed.");
  if (hasValue(args.review)) {
    console.log(`- channel=${channel}`);
    console.log("- review=verified");
  } else {
    console.log("- review=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    gitignore: ".gitignore",
    closeoutDocs: "docs/deploy/provider-write-manual-closeout-review.md",
    ledgerDocs: "docs/deploy/provider-write-live-pilot-run-ledger.md",
    providerWriteDocs: "docs/deploy/provider-write-requests.md",
    productionReadiness: "docs/deploy/production-readiness.md",
    launchRunbook: "docs/deploy/production-launch-runbook.md",
    staticCiWorkflow: ".github/workflows/production-static-gates.yml",
    staticCiVerifier: "scripts/verify-production-static-ci.mjs",
    productionLaunchVerifier: "scripts/verify-production-launch.mjs",
    ledgerVerifier: "scripts/verify-provider-write-live-pilot-run-ledger.mjs",
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
    "verify:provider-write-manual-closeout-review",
    "verify:provider-write-manual-closeout-review:safe",
    "\"verify:provider-write-manual-closeout-review:safe\": \"node scripts/verify-provider-write-manual-closeout-review.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-manual-closeout-review.mjs",
  ]);

  mustContainAll("provider write manual closeout review docs", content.closeoutDocs, [
    "PR71 Provider Write Manual Closeout Review Gate",
    "smart-cs-agent.provider-write-manual-closeout-review.v1",
    "npm run verify:provider-write-manual-closeout-review",
    "npm run verify:provider-write-manual-closeout-review:safe",
    "SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_REQUIRE_PASS=true",
    "approved_for_safe_ledger",
    "manual closeout review",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("provider write live pilot run ledger docs", content.ledgerDocs, [
    "PR71 Provider Write Manual Closeout Review Gate",
    "verify:provider-write-manual-closeout-review",
    "providerWriteManualCloseoutReviewSha256",
    "manual closeout review",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR71 Provider Write Manual Closeout Review Gate",
    "verify:provider-write-manual-closeout-review",
    "smart-cs-agent.provider-write-manual-closeout-review.v1",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR71 Provider Write Manual Closeout Review Gate",
    "verify:provider-write-manual-closeout-review",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "verify:provider-write-manual-closeout-review",
    "verify:provider-write-manual-closeout-review:safe",
    "docs/deploy/provider-write-manual-closeout-review.md",
    "SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-manual-closeout-review.test.mjs",
    "npm run verify:provider-write-manual-closeout-review",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-manual-closeout-review.test.mjs",
    "npm run verify:provider-write-manual-closeout-review",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "verify:provider-write-manual-closeout-review",
    "provider write manual closeout review",
    "smart-cs-agent.provider-write-manual-closeout-review.v1",
  ]);

  mustContainAll("provider write live pilot run ledger verifier binding", content.ledgerVerifier, [
    "providerWriteManualCloseoutReviewVerifierPassed",
    "providerWriteManualCloseoutReviewSha256",
  ]);

  mustContainAll("task plan closeout review", content.taskPlan, [
    "PR71 - Provider Write Manual Closeout Review Gate",
    "verify:provider-write-manual-closeout-review",
  ]);

  mustContainAll("progress closeout review", content.progress, [
    "Started PR71 provider write manual closeout review gate",
  ]);

  mustContainAll("gitignore closeout artifacts", content.gitignore, [
    "provider-write-manual-closeout-review-artifacts/",
  ]);
}

function validateReview(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write manual closeout review root must be an object");
    return;
  }

  validateAllowedKeys(
    value,
    ROOT_KEYS,
    "provider write manual closeout review contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-manual-closeout-review.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-manual-closeout-review.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    failures.push("generatedAt must be an ISO timestamp");
  }

  validateTarget(value.target);
  validateLaunchWindow(value.launchWindow, options);
  validateRunSummary(value.runSummary, options);
  validateReviewers(value.reviewers, options);
  validateCloseout(value.closeout, options);
  validateAllTrueObject(
    value.evidence,
    EVIDENCE_KEYS,
    "evidence",
    "evidence contains unsupported field",
    options,
  );
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
  if ((options.requirePass || hasValue(options.review)) && window.freezeWindowActive !== true) {
    failures.push("launchWindow.freezeWindowActive must be true");
  }
}

function validateRunSummary(summary, options) {
  if (!isRecord(summary)) {
    failures.push("runSummary must be an object");
    return;
  }
  validateAllowedKeys(summary, RUN_SUMMARY_KEYS, "runSummary contains unsupported field");
  for (const key of [
    "totalRuns",
    "succeededRuns",
    "failedRuns",
    "rolledBackRuns",
    "blockedRuns",
    "failedProviderMutationRuns",
  ]) {
    validateIntegerInRange(`runSummary.${key}`, summary[key], 0, 50);
  }
  if (
    Number.isInteger(summary.totalRuns) &&
    Number.isInteger(summary.succeededRuns) &&
    Number.isInteger(summary.failedRuns) &&
    Number.isInteger(summary.rolledBackRuns) &&
    Number.isInteger(summary.blockedRuns) &&
    summary.totalRuns !==
      summary.succeededRuns +
        summary.failedRuns +
        summary.rolledBackRuns +
        summary.blockedRuns
  ) {
    failures.push("runSummary.totalRuns must equal status counts");
  }
  for (const key of [
    "allRunsReviewed",
    "failedRunsHaveIncidentNotes",
    "rollbackActionsVerified",
    "noAutoCustomerReplies",
  ]) {
    validateBoolean(`runSummary.${key}`, summary[key]);
    if ((options.requirePass || hasValue(options.review)) && summary[key] !== true) {
      failures.push(`runSummary.${key} must be true`);
    }
  }
  if (summary.failedRuns > 0 && summary.failedRunsHaveIncidentNotes !== true) {
    failures.push("runSummary.failedRunsHaveIncidentNotes must be true when failedRuns is greater than 0");
  }
  if (
    (summary.rolledBackRuns > 0 || summary.failedProviderMutationRuns > 0) &&
    summary.rollbackActionsVerified !== true
  ) {
    failures.push("runSummary.rollbackActionsVerified must be true when rolledBackRuns or failedProviderMutationRuns is greater than 0");
  }
}

function validateReviewers(reviewers, options) {
  if (!isRecord(reviewers)) {
    failures.push("reviewers must be an object");
    return;
  }
  validateAllowedKeys(reviewers, REVIEWER_KEYS, "reviewers contains unsupported field");
  validateFingerprint(
    "reviewers.releaseOwnerFingerprint",
    reviewers.releaseOwnerFingerprint,
  );
  validateFingerprint(
    "reviewers.operationsReviewerFingerprint",
    reviewers.operationsReviewerFingerprint,
  );
  validateFingerprint(
    "reviewers.rollbackOwnerFingerprint",
    reviewers.rollbackOwnerFingerprint,
  );
  if (!isIsoTimestamp(reviewers.reviewedAt)) {
    failures.push("reviewers.reviewedAt must be an ISO timestamp");
  }
  validateBoolean("reviewers.secondReviewCompleted", reviewers.secondReviewCompleted);
  if (
    (options.requirePass || hasValue(options.review)) &&
    reviewers.secondReviewCompleted !== true
  ) {
    failures.push("reviewers.secondReviewCompleted must be true");
  }
  const fingerprints = [
    reviewers.releaseOwnerFingerprint,
    reviewers.operationsReviewerFingerprint,
    reviewers.rollbackOwnerFingerprint,
  ].filter((item) => typeof item === "string");
  if (new Set(fingerprints).size !== fingerprints.length) {
    failures.push("reviewers must be distinct");
  }
}

function validateCloseout(closeout, options) {
  if (!isRecord(closeout)) {
    failures.push("closeout must be an object");
    return;
  }
  validateAllowedKeys(closeout, CLOSEOUT_KEYS, "closeout contains unsupported field");
  if (!DECISIONS.has(closeout.decision)) {
    failures.push("closeout.decision must be approved_for_safe_ledger or rejected_needs_investigation");
  }
  if (
    (options.requirePass || hasValue(options.review)) &&
    closeout.decision !== "approved_for_safe_ledger"
  ) {
    failures.push("closeout.decision must be approved_for_safe_ledger");
  }
  for (const key of [
    "customerImpactReviewed",
    "providerMutationReviewCompleted",
    "incidentReviewCompleted",
    "rollbackReviewCompleted",
    "evidencePackageReviewed",
  ]) {
    validateBoolean(`closeout.${key}`, closeout[key]);
    if ((options.requirePass || hasValue(options.review)) && closeout[key] !== true) {
      failures.push(`closeout.${key} must be true`);
    }
  }
  if (!Array.isArray(closeout.outstandingActions)) {
    failures.push("closeout.outstandingActions must be an array");
  } else if (closeout.outstandingActions.length > 0) {
    failures.push("closeout.outstandingActions must be empty");
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

function validateAllTrueObject(value, allowedKeys, label, unsupportedMessage, options) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, allowedKeys, unsupportedMessage);
  for (const key of allowedKeys) {
    validateBoolean(`${label}.${key}`, value[key]);
    if ((options.requirePass || hasValue(options.review)) && value[key] !== true) {
      failures.push(`${label}.${key} must be true`);
    }
  }
}

function readJsonFile(filePath, label) {
  const resolvedPath = resolveReviewPath(filePath);
  if (!resolvedPath) return null;
  if (!existsSync(resolvedPath)) {
    failures.push(`${label} file does not exist`);
    return null;
  }
  if (!statSync(resolvedPath).isFile()) {
    failures.push(`${label} path must point to a file`);
    return null;
  }
  if (statSync(resolvedPath).size > MAX_REVIEW_BYTES) {
    failures.push(`${label} file is too large`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch {
    failures.push(`${label} file must be valid JSON`);
    return null;
  }
}

function resolveReviewPath(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    failures.push("--review is required");
    return null;
  }
  const candidate = isAbsolute(filePath)
    ? resolve(filePath)
    : resolve(repoRoot, filePath);
  const relativeToRoot = relative(repoRoot, candidate);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    failures.push("--review must stay inside repository");
    return null;
  }
  const relativeToArtifacts = relative(REVIEW_ARTIFACT_DIR, candidate);
  if (relativeToArtifacts.startsWith("..") || isAbsolute(relativeToArtifacts)) {
    failures.push("--review must be inside provider-write-manual-closeout-review-artifacts");
    return null;
  }
  if (existsSync(candidate)) {
    const realCandidate = realpathSync(candidate);
    const realArtifactDir = existsSync(REVIEW_ARTIFACT_DIR)
      ? realpathSync(REVIEW_ARTIFACT_DIR)
      : REVIEW_ARTIFACT_DIR;
    const realRelative = relative(realArtifactDir, realCandidate);
    if (realRelative.startsWith("..") || isAbsolute(realRelative)) {
      failures.push("--review must resolve inside provider-write-manual-closeout-review-artifacts");
      return null;
    }
    if (lstatSync(candidate).isSymbolicLink()) {
      failures.push("provider write manual closeout review file must not be a symlink");
      return null;
    }
  }
  return candidate;
}

function parseArgs(argv) {
  const args = {
    review: undefined,
    requirePass: false,
    fromEnv: false,
  };
  for (const arg of argv) {
    if (arg === "--from-env") {
      args.fromEnv = true;
      continue;
    }
    if (arg === "--require-pass") {
      args.requirePass = true;
      continue;
    }
    if (arg.startsWith("--review=")) {
      args.review = arg.slice("--review=".length);
      continue;
    }
    failures.push(`Unknown argument: ${redactArg(arg)}`);
  }
  return args;
}

function applySafeEnvDefaults(args, env) {
  if (!args.fromEnv) return args;
  return {
    ...args,
    review:
      args.review ??
      env.SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_FILE,
    requirePass:
      args.requirePass ||
      env.SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_REQUIRE_PASS === "true",
  };
}

function validateNoSensitiveFields(value) {
  visit(value, (key, item) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_FIELD_NAMES.has(normalizedKey)) {
      failures.push("forbidden sensitive provider write manual closeout review field");
    }
    if (typeof item === "string" && isForbiddenValue(item)) {
      failures.push("forbidden sensitive provider write manual closeout review value");
    }
  });
}

function visit(value, visitor) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, visitor);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    visitor(key, item);
    visit(item, visitor);
  }
}

function isForbiddenValue(value) {
  return FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function validateAllowedKeys(value, allowedKeys, message) {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      failures.push(message);
    }
  }
}

function validateBoolean(label, value) {
  if (typeof value !== "boolean") {
    failures.push(`${label} must be boolean`);
  }
}

function validateIntegerInRange(label, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    failures.push(`${label} must be an integer between ${min} and ${max}`);
  }
}

function validateFingerprint(label, value) {
  if (typeof value !== "string" || !/^[a-f0-9]{12}$/.test(value)) {
    failures.push(`${label} must be a 12-character fingerprint`);
  }
}

function validateSha256(label, value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    failures.push(`${label} must be a non-placeholder sha256 hash`);
    return;
  }
  if (/^(.)\1{63}$/.test(value)) {
    failures.push(`${label} must be a non-placeholder sha256 hash`);
  }
}

function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function readRequired(label, relativePath) {
  const absolutePath = join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${label}: missing file ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function mustContainAll(label, haystack, needles) {
  for (const needle of needles) {
    if (!haystack.includes(needle)) {
      failures.push(`${label}: missing ${needle}`);
    }
  }
}

function hasValue(value) {
  return typeof value === "string" && value.trim() !== "";
}

function redactArg(arg) {
  const value = String(arg);
  if (value.startsWith("--") && value.includes("=")) {
    const [key] = value.split("=", 1);
    return `${key}=<redacted>`;
  }
  return "<redacted>";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main();
