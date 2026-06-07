import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const MAX_REHEARSAL_BYTES = 256 * 1024;
const REHEARSAL_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-dry-run-rehearsal-artifacts",
);

const ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "scenario",
  "request",
  "review",
  "executionAttempt",
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
const SCENARIO_KEYS = new Set([
  "rehearsalId",
  "action",
  "riskLevel",
  "rehearsalMode",
]);
const REQUEST_KEYS = new Set([
  "status",
  "requestFingerprint",
  "idempotencyKeyHashFingerprint",
  "payloadEscrowStatus",
  "rawPayloadStored",
  "providerMutationExecuted",
  "customerVisibleMessageSent",
  "networkExecution",
]);
const REVIEW_KEYS = new Set([
  "decision",
  "humanReviewRequired",
  "twoPersonReviewPassed",
  "requesterFingerprint",
  "reviewerFingerprint",
  "secondReviewerFingerprint",
  "reviewedAt",
]);
const EXECUTION_ATTEMPT_KEYS = new Set([
  "status",
  "policyReason",
  "attemptFingerprint",
  "networkExecution",
  "providerMutationExecuted",
  "customerVisibleMessageSent",
  "payloadEscrowOpened",
  "payloadEscrowStatus",
]);
const CONTROL_KEYS = new Set([
  "providerWriteKillSwitchVerified",
  "idempotencyVerified",
  "auditTrailVerified",
  "noProviderCredentialsRead",
  "noProviderNetworkCalls",
  "noPayloadEscrowOpened",
  "noCustomerVisibleReplySent",
  "noProviderMutationExecuted",
]);
const EVIDENCE_KEYS = new Set([
  "providerWriteRequestsVerifierPassed",
  "providerWriteApprovalStateVerifierPassed",
  "providerWriteExecutionAttemptsVerifierPassed",
  "providerWriteExecutionAttemptVisibilityVerifierPassed",
  "providerWritePayloadEscrowBoundaryVerifierPassed",
  "productionProviderWriteApprovalVerifierPassed",
  "productionLaunchVerifierPassed",
]);
const ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteRequestQueueSha256",
  "providerWriteApprovalStateSha256",
  "providerWriteExecutionAttemptSha256",
  "providerWritePayloadEscrowBoundarySha256",
]);
const SAFETY_KEYS = new Set([
  "secretsInEvidence",
  "rawTenantIdsInEvidence",
  "customerDataInEvidence",
  "providerPayloadsInEvidence",
  "providerResponsesInEvidence",
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
const EXECUTION_ATTEMPT_STATUSES = new Set(["blocked", "dry_run_recorded"]);
const EXECUTION_ATTEMPT_POLICY_REASONS = new Set([
  "execution_kill_switch_enabled",
  "dry_run_recorded",
  "unsupported_payload_escrow_state",
]);
const FORBIDDEN_FIELD_NAMES = new Set([
  "accesstoken",
  "address",
  "apikey",
  "clientsecret",
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
    const rehearsal = readJsonFile(args.rehearsal, "Provider write dry-run rehearsal");
    if (rehearsal) {
      validateRehearsal(rehearsal, args);
      if (isRecord(rehearsal) && isRecord(rehearsal.target)) {
        channel = rehearsal.target.channel;
      }
    }
  } else if (args.requirePass) {
    failures.push("provider write dry-run rehearsal evidence is required when pass evidence is required");
  }

  if (failures.length > 0) {
    console.error("Provider write dry-run rehearsal verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write dry-run rehearsal verification passed.");
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
    rehearsalDocs: "docs/deploy/provider-write-dry-run-rehearsal.md",
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
    "verify:provider-write-dry-run-rehearsal",
    "verify:provider-write-dry-run-rehearsal:safe",
    "\"verify:provider-write-dry-run-rehearsal:safe\": \"node scripts/verify-provider-write-dry-run-rehearsal.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-dry-run-rehearsal.mjs",
  ]);

  mustContainAll("provider write dry-run rehearsal docs", content.rehearsalDocs, [
    "PR63 Provider Write Dry-Run Rehearsal Evidence Gate",
    "smart-cs-agent.provider-write-dry-run-rehearsal.v1",
    "npm run verify:provider-write-dry-run-rehearsal",
    "npm run verify:provider-write-dry-run-rehearsal:safe",
    "SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE",
    "SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS=true",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR63 Provider Write Dry-Run Rehearsal Evidence Gate",
    "verify:provider-write-dry-run-rehearsal",
    "smart-cs-agent.provider-write-dry-run-rehearsal.v1",
  ]);

  mustContainAll(
    "production provider write approval docs",
    content.productionProviderWriteApproval,
    [
      "verify:provider-write-dry-run-rehearsal",
      "provider-write-dry-run-rehearsal-artifacts",
      "dryRunRehearsalSha256",
    ],
  );

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR63 Provider Write Dry-Run Rehearsal Evidence Gate",
    "verify:provider-write-dry-run-rehearsal",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "verify:provider-write-dry-run-rehearsal",
    "verify:provider-write-dry-run-rehearsal:safe",
    "docs/deploy/provider-write-dry-run-rehearsal.md",
    "SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE",
    "SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-dry-run-rehearsal.test.mjs",
    "npm run verify:provider-write-dry-run-rehearsal",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-dry-run-rehearsal.test.mjs",
    "npm run verify:provider-write-dry-run-rehearsal",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "verify-provider-write-dry-run-rehearsal.mjs",
    "verify:provider-write-dry-run-rehearsal",
    "provider write dry-run rehearsal",
  ]);

  mustContainAll("task plan references", content.taskPlan, [
    "PR63 - Provider Write Dry-Run Rehearsal Evidence Gate",
    "verify:provider-write-dry-run-rehearsal",
  ]);

  mustContainAll("progress references", content.progress, [
    "Started PR63 provider write dry-run rehearsal evidence gate",
  ]);

  mustContainAll("gitignore rehearsal artifacts", content.gitignore, [
    "provider-write-dry-run-rehearsal-artifacts/",
  ]);
}

function validateRehearsal(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write dry-run rehearsal root must be an object");
    return;
  }

  validateAllowedKeys(
    value,
    ROOT_KEYS,
    "provider write dry-run rehearsal contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-dry-run-rehearsal.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-dry-run-rehearsal.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    failures.push("generatedAt must be an ISO timestamp");
  }

  validateTarget(value.target);
  validateScenario(value.scenario);
  validateRequest(value.request);
  validateReview(value.review, options);
  validateExecutionAttempt(value.executionAttempt);
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

function validateScenario(scenario) {
  if (!isRecord(scenario)) {
    failures.push("scenario must be an object");
    return;
  }
  validateAllowedKeys(scenario, SCENARIO_KEYS, "scenario contains unsupported field");
  if (
    typeof scenario.rehearsalId !== "string" ||
    !/^[A-Za-z0-9._-]{6,120}$/.test(scenario.rehearsalId)
  ) {
    failures.push("scenario.rehearsalId must be a safe id");
  }
  if (scenario.action === "refund") {
    failures.push("scenario.action cannot include refund");
  }
  if (!FIRST_PILOT_ACTIONS.has(scenario.action)) {
    failures.push("scenario.action must be a first-pilot provider write action");
  }
  if (!["low", "medium"].includes(scenario.riskLevel)) {
    failures.push("scenario.riskLevel must be low or medium");
  }
  if (scenario.rehearsalMode !== "local_dry_run") {
    failures.push("scenario.rehearsalMode must be local_dry_run");
  }
}

function validateRequest(request) {
  if (!isRecord(request)) {
    failures.push("request must be an object");
    return;
  }
  validateAllowedKeys(request, REQUEST_KEYS, "request contains unsupported field");
  if (!["approval_required", "approved"].includes(request.status)) {
    failures.push("request.status must be approval_required or approved");
  }
  validateFingerprint("request.requestFingerprint", request.requestFingerprint);
  validateFingerprint(
    "request.idempotencyKeyHashFingerprint",
    request.idempotencyKeyHashFingerprint,
  );
  if (!["not_stored", "sealed_metadata"].includes(request.payloadEscrowStatus)) {
    failures.push("request.payloadEscrowStatus must be not_stored or sealed_metadata");
  }
  validateFalse("request.rawPayloadStored", request.rawPayloadStored);
  validateFalse("request.providerMutationExecuted", request.providerMutationExecuted);
  validateFalse(
    "request.customerVisibleMessageSent",
    request.customerVisibleMessageSent,
  );
  if (request.networkExecution !== "not_started") {
    failures.push("request.networkExecution must be not_started");
  }
}

function validateReview(review, options) {
  if (!isRecord(review)) {
    failures.push("review must be an object");
    return;
  }
  validateAllowedKeys(review, REVIEW_KEYS, "review contains unsupported field");
  if (review.decision !== "approved") {
    failures.push("review.decision must be approved");
  }
  validateBoolean("review.humanReviewRequired", review.humanReviewRequired);
  validateBoolean("review.twoPersonReviewPassed", review.twoPersonReviewPassed);
  if ((options.requirePass || hasValue(options.rehearsal)) && review.humanReviewRequired !== true) {
    failures.push("review.humanReviewRequired must be true");
  }
  if ((options.requirePass || hasValue(options.rehearsal)) && review.twoPersonReviewPassed !== true) {
    failures.push("review.twoPersonReviewPassed must be true");
  }
  validateFingerprint("review.requesterFingerprint", review.requesterFingerprint);
  validateFingerprint("review.reviewerFingerprint", review.reviewerFingerprint);
  validateFingerprint(
    "review.secondReviewerFingerprint",
    review.secondReviewerFingerprint,
  );
  if (
    typeof review.reviewerFingerprint === "string" &&
    review.reviewerFingerprint === review.secondReviewerFingerprint
  ) {
    failures.push("review reviewerFingerprint and secondReviewerFingerprint must be different");
  }
  if (
    typeof review.requesterFingerprint === "string" &&
    (review.requesterFingerprint === review.reviewerFingerprint ||
      review.requesterFingerprint === review.secondReviewerFingerprint)
  ) {
    failures.push("review reviewer fingerprints must be distinct from requester");
  }
  if (!isIsoTimestamp(review.reviewedAt)) {
    failures.push("review.reviewedAt must be an ISO timestamp");
  }
}

function validateExecutionAttempt(attempt) {
  if (!isRecord(attempt)) {
    failures.push("executionAttempt must be an object");
    return;
  }
  validateAllowedKeys(
    attempt,
    EXECUTION_ATTEMPT_KEYS,
    "executionAttempt contains unsupported field",
  );
  if (!EXECUTION_ATTEMPT_STATUSES.has(attempt.status)) {
    failures.push("executionAttempt.status must be blocked or dry_run_recorded");
  }
  if (!EXECUTION_ATTEMPT_POLICY_REASONS.has(attempt.policyReason)) {
    failures.push("executionAttempt.policyReason must be a safe no-network reason");
  }
  validateFingerprint("executionAttempt.attemptFingerprint", attempt.attemptFingerprint);
  if (attempt.networkExecution !== "not_started") {
    failures.push("executionAttempt.networkExecution must be not_started");
  }
  validateFalse(
    "executionAttempt.providerMutationExecuted",
    attempt.providerMutationExecuted,
  );
  validateFalse(
    "executionAttempt.customerVisibleMessageSent",
    attempt.customerVisibleMessageSent,
  );
  validateFalse("executionAttempt.payloadEscrowOpened", attempt.payloadEscrowOpened);
  if (attempt.payloadEscrowStatus !== "not_stored") {
    failures.push("executionAttempt.payloadEscrowStatus must be not_stored");
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
    hasValue(input.SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE)
  ) {
    result.rehearsal = readSafeRehearsalPath(
      input.SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE,
    );
  }
  result.requirePass =
    result.requirePass ||
    readBoolean(
      input.SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS,
      "SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS",
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
    failures.push("--rehearsal must be inside provider-write-dry-run-rehearsal-artifacts");
    return undefined;
  }
  failures.push("--rehearsal must be a safe local path");
  return undefined;
}

function isPathInside(parent, child) {
  if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) {
    failures.push("provider write dry-run rehearsal artifact directory must not be a symlink");
    return false;
  }
  const repoRealPath = realpathSync(repoRoot);
  const parentRealPath = realpathIfExists(parent);
  if (!isResolvedPathInside(repoRealPath, parentRealPath)) {
    failures.push("provider write dry-run rehearsal artifact directory must stay inside repository");
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
        failures.push("forbidden sensitive provider write dry-run rehearsal field");
      }
      walkForSensitiveValues(nested);
    }
    return;
  }
  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push("forbidden sensitive provider write dry-run rehearsal value");
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
    /^0{64}$/.test(value)
  ) {
    failures.push(`${label} must be a non-placeholder sha256 hash`);
  }
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
