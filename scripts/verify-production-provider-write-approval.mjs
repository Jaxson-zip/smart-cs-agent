import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const MAX_APPROVAL_BYTES = 256 * 1024;
const APPROVAL_ARTIFACT_DIR = resolve(
  repoRoot,
  "production-provider-write-approval-artifacts",
);

const ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "executionMode",
  "allowedActions",
  "approval",
  "artifactBindings",
  "controls",
  "limits",
  "safety",
]);
const APPROVAL_KEYS = new Set([
  "approvalStatus",
  "requestedByFingerprint",
  "approvedByFingerprint",
  "secondReviewerFingerprint",
  "approvedAt",
]);
const ARTIFACT_BINDING_KEYS = new Set([
  "productionChangeApprovalSha256",
  "productionReleaseEvidenceSha256",
  "productionLaunchBindingSha256",
  "dryRunRehearsalSha256",
  "providerWriteKillSwitchSha256",
]);
const TARGET_KEYS = new Set([
  "tenantFingerprint",
  "channel",
  "rolloutTrack",
  "changeTicket",
]);
const CONTROL_KEYS = new Set([
  "humanApprovalRequired",
  "twoPersonReviewRequired",
  "idempotencyRequired",
  "auditRequired",
  "providerWriteKillSwitchReady",
  "customerVisibleReplyRequiresApproval",
  "dryRunRehearsalPassed",
  "rollbackOwnerFingerprint",
]);
const LIMIT_KEYS = new Set([
  "maxDailyWriteCount",
  "maxCouponAmountCents",
  "maxAddressChangesPerOrder",
]);
const SAFETY_KEYS = new Set([
  "secretsInEvidence",
  "rawTenantIdsInEvidence",
  "customerDataInEvidence",
  "providerPayloadsInEvidence",
  "networkExecutedByVerifier",
  "providerWriteExecutedByVerifier",
  "automaticProviderWritesEnabled",
  "customerVisibleActionsAutoSent",
]);
const CHANNELS = new Set(["taobao", "douyin"]);
const EXECUTION_MODES = new Set(["real_actions_disabled", "human_review_required"]);
const FIRST_PILOT_ACTIONS = new Set([
  "modify_address",
  "issue_coupon",
  "urge_logistics",
]);
const FORBIDDEN_FIELD_NAMES = new Set([
  "accesstoken",
  "apikey",
  "clientsecret",
  "credentialref",
  "customerdata",
  "customermessage",
  "externalconversationid",
  "externalmessageid",
  "installationtoken",
  "logisticsid",
  "operatorapikey",
  "orderid",
  "password",
  "privatekey",
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
  if (hasValue(args.approval)) {
    const approval = readJsonFile(args.approval, "Production provider write approval");
    if (approval) {
      validateProviderWriteApproval(approval, args);
      if (isRecord(approval) && isRecord(approval.target)) {
        channel = approval.target.channel;
      }
    }
  } else if (args.requirePass) {
    failures.push("production provider write approval evidence is required when pass evidence is required");
  }

  if (failures.length > 0) {
    console.error("Production provider write approval verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Production provider write approval verification passed.");
  if (hasValue(args.approval)) {
    console.log(`- channel=${channel}`);
    console.log("- approval=verified");
  } else {
    console.log("- approval=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    providerWriteApprovalDocs:
      "docs/deploy/production-provider-write-approval.md",
    providerAdapterDocs: "docs/deploy/provider-adapter-contracts.md",
    launchRunbook: "docs/deploy/production-launch-runbook.md",
    productionReadiness: "docs/deploy/production-readiness.md",
    productionLaunchVerifier: "scripts/verify-production-launch.mjs",
    providerWriteApprovalTest:
      "scripts/verify-production-provider-write-approval.test.mjs",
    taskPlan: "task_plan.md",
    progress: "progress.md",
    gitignore: ".gitignore",
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
    "verify:production-provider-write-approval",
    "verify:production-provider-write-approval:safe",
    "\"verify:production-provider-write-approval:safe\": \"node scripts/verify-production-provider-write-approval.mjs --from-env --require-pass\"",
    "scripts/verify-production-provider-write-approval.mjs",
  ]);

  mustContainAll("provider write approval docs", content.providerWriteApprovalDocs, [
    "PR57 Production Provider Write Approval Gate",
    "npm run verify:production-provider-write-approval",
    "npm run verify:production-provider-write-approval:safe",
    "smart-cs-agent.production-provider-write-approval.v1",
    "human_review_required",
    "approvalStatus",
    "artifactBindings",
    "provider write kill switch",
    "verify:provider-write-kill-switch-rehearsal",
    "provider-write-kill-switch-rehearsal-artifacts",
    "providerWriteKillSwitchSha256",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not send customer-visible replies",
  ]);
  mustNotContainAny("provider write approval docs unsafe", content.providerWriteApprovalDocs, [
    "secrets.",
    "OPERATOR_API_KEYS=",
    "REAL_CHANNEL_WEBHOOK_SECRETS=",
    "PROVIDER_CREDENTIALS=",
    "tenant_1",
    "actual_provider_token_must_not_leak",
  ]);

  mustContainAll("provider adapter docs reference write approval", content.providerAdapterDocs, [
    "npm run verify:production-provider-write-approval",
    "production-provider-write-approval-artifacts",
    "human_review_required",
  ]);

  mustContainAll("launch runbook references provider write approval", content.launchRunbook, [
    "npm run verify:production-provider-write-approval",
    "npm run verify:production-provider-write-approval:safe",
    "npm run verify:provider-write-kill-switch-rehearsal:safe",
    "docs/deploy/production-provider-write-approval.md",
    "SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE",
    "SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_REQUIRE_PASS=true",
    "SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE",
    "SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS=true",
  ]);

  mustContainAll("production readiness references provider write approval", content.productionReadiness, [
    "PR57 Production Provider Write Approval Gate",
    "npm run verify:production-provider-write-approval",
    "npm run verify:production-provider-write-approval:safe",
  ]);

  mustContainAll("production launch verifier references provider write approval", content.productionLaunchVerifier, [
    "verify:production-provider-write-approval",
    "verify:provider-write-kill-switch-rehearsal",
    "production-provider-write-approval.md",
    "production-provider-write-approval-artifacts",
  ]);

  mustContainAll("provider write approval tests", content.providerWriteApprovalTest, [
    "production provider write approval verifier passes static checks without approval evidence",
    "production provider write approval verifier accepts sanitized human-reviewed pilot evidence",
    "production provider write approval verifier rejects evidence without approval and artifact bindings",
    "production provider write approval verifier rejects weak approval details and placeholder hashes",
    "production provider write approval verifier safe mode requires approval evidence",
    "production provider write approval verifier rejects auto-execute and weak safety controls",
    "production provider write approval verifier rejects unsupported actions and high-risk refunds",
    "production provider write approval verifier rejects sensitive approval evidence without echoing values",
    "production provider write approval verifier rejects approval paths outside the artifact directory",
    "production provider write approval verifier redacts unknown argument values",
    "assertNoSecretMarkers",
    "providerWriteKillSwitchSha256",
  ]);

  mustContainAll("task plan references PR57", content.taskPlan, [
    "PR57 - Production Provider Write Approval Gate",
    "verify:production-provider-write-approval",
  ]);
  mustContainAll("progress references PR57", content.progress, [
    "Started PR57 production provider write approval gate",
    "verify:production-provider-write-approval",
  ]);
  mustContainAll("gitignore provider write approval artifacts", content.gitignore, [
    "production-provider-write-approval-artifacts/",
  ]);
}

function validateProviderWriteApproval(value, options) {
  if (!isRecord(value)) {
    failures.push("production provider write approval root must be an object");
    return;
  }

  validateAllowedKeys(value, ROOT_KEYS, "production provider write approval contains unsupported field");
  if (value.schemaVersion !== "smart-cs-agent.production-provider-write-approval.v1") {
    failures.push("schemaVersion must be smart-cs-agent.production-provider-write-approval.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    failures.push("generatedAt must be an ISO timestamp");
  }

  validateTarget(value.target);
  validateExecutionMode(value.executionMode, options);
  validateAllowedActions(value.allowedActions);
  validateApproval(value.approval);
  validateArtifactBindings(value.artifactBindings);
  validateControls(value.controls, options);
  validateLimits(value.limits, options);
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

function validateExecutionMode(executionMode, options) {
  if (!EXECUTION_MODES.has(executionMode)) {
    failures.push("executionMode must be real_actions_disabled or human_review_required");
  }
  if ((options.requirePass || hasValue(options.approval)) && executionMode !== "human_review_required") {
    failures.push("executionMode must be human_review_required");
  }
}

function validateAllowedActions(allowedActions) {
  if (!Array.isArray(allowedActions) || allowedActions.length === 0) {
    failures.push("allowedActions must be a non-empty array");
    return;
  }
  const seen = new Set();
  for (const action of allowedActions) {
    if (seen.has(action)) failures.push("allowedActions must not contain duplicates");
    seen.add(action);
    if (action === "refund") {
      failures.push("allowedActions cannot include refund in the first write pilot");
    }
    if (!FIRST_PILOT_ACTIONS.has(action)) {
      failures.push("allowedActions contains unsupported provider write action");
    }
  }
}

function validateApproval(approval) {
  if (!isRecord(approval)) {
    failures.push("approval must be an object");
    return;
  }
  validateAllowedKeys(approval, APPROVAL_KEYS, "approval contains unsupported field");
  if (approval.approvalStatus !== "approved") {
    failures.push("approval.approvalStatus must be approved");
  }
  validateFingerprint("approval.requestedByFingerprint", approval.requestedByFingerprint);
  validateFingerprint("approval.approvedByFingerprint", approval.approvedByFingerprint);
  validateFingerprint(
    "approval.secondReviewerFingerprint",
    approval.secondReviewerFingerprint,
  );
  if (
    typeof approval.approvedByFingerprint === "string" &&
    approval.approvedByFingerprint === approval.secondReviewerFingerprint
  ) {
    failures.push("approval approvedByFingerprint and secondReviewerFingerprint must be different");
  }
  if (
    typeof approval.requestedByFingerprint === "string" &&
    (approval.requestedByFingerprint === approval.approvedByFingerprint ||
      approval.requestedByFingerprint === approval.secondReviewerFingerprint)
  ) {
    failures.push("approval reviewer fingerprints must be distinct from requester");
  }
  if (!isIsoTimestamp(approval.approvedAt)) {
    failures.push("approval.approvedAt must be an ISO timestamp");
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
    if (typeof artifactBindings[key] === "string") {
      hashes.push(artifactBindings[key]);
    }
  }
  if (hashes.length === ARTIFACT_BINDING_KEYS.size && new Set(hashes).size !== hashes.length) {
    failures.push("artifactBindings hashes must be distinct");
  }
}

function validateControls(controls, options) {
  if (!isRecord(controls)) {
    failures.push("controls must be an object");
    return;
  }
  validateAllowedKeys(controls, CONTROL_KEYS, "controls contains unsupported field");
  for (const key of [
    "humanApprovalRequired",
    "twoPersonReviewRequired",
    "idempotencyRequired",
    "auditRequired",
    "providerWriteKillSwitchReady",
    "customerVisibleReplyRequiresApproval",
    "dryRunRehearsalPassed",
  ]) {
    validateBoolean(`controls.${key}`, controls[key]);
    if ((options.requirePass || hasValue(options.approval)) && controls[key] !== true) {
      failures.push(`controls.${key} must be true`);
    }
  }
  validateFingerprint(
    "controls.rollbackOwnerFingerprint",
    controls.rollbackOwnerFingerprint,
  );
}

function validateLimits(limits, options) {
  if (!isRecord(limits)) {
    failures.push("limits must be an object");
    return;
  }
  validateAllowedKeys(limits, LIMIT_KEYS, "limits contains unsupported field");
  if (
    !Number.isInteger(limits.maxDailyWriteCount) ||
    limits.maxDailyWriteCount < 1 ||
    limits.maxDailyWriteCount > 100
  ) {
    failures.push("limits.maxDailyWriteCount must be between 1 and 100");
  }
  if (
    !Number.isInteger(limits.maxCouponAmountCents) ||
    limits.maxCouponAmountCents < 0 ||
    limits.maxCouponAmountCents > 10000
  ) {
    failures.push("limits.maxCouponAmountCents must be between 0 and 10000");
  }
  if (
    !Number.isInteger(limits.maxAddressChangesPerOrder) ||
    limits.maxAddressChangesPerOrder < 0 ||
    limits.maxAddressChangesPerOrder > 1
  ) {
    failures.push("limits.maxAddressChangesPerOrder must be between 0 and 1");
  }
  if (options.requirePass && limits.maxDailyWriteCount > 50) {
    failures.push("limits.maxDailyWriteCount must be at most 50 for first launch");
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
  if (stats.size > MAX_APPROVAL_BYTES) {
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

function mustNotContainAny(label, haystack, needles) {
  for (const needle of needles) {
    if (haystack.includes(needle)) {
      failures.push(`${label}: unexpectedly contains ${needle}`);
    }
  }
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
        failures.push("forbidden sensitive production provider write approval field");
      }
      walkForSensitiveValues(nested);
    }
    return;
  }
  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push("forbidden sensitive production provider write approval value");
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
    if (!allowedKeys.has(key)) {
      failures.push(message);
    }
  }
}

function parseArgs(values) {
  const parsed = {
    approval: undefined,
    fromEnv: false,
    requirePass: false,
  };

  for (const value of values) {
    if (value === "--from-env") {
      parsed.fromEnv = true;
    } else if (value === "--require-pass") {
      parsed.requirePass = true;
    } else if (value.startsWith("--approval=")) {
      parsed.approval = readSafeApprovalPath(value.slice("--approval=".length));
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
    !hasValue(result.approval) &&
    hasValue(input.SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE)
  ) {
    result.approval = readSafeApprovalPath(
      input.SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE,
    );
  }
  result.requirePass =
    result.requirePass ||
    readBoolean(
      input.SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_REQUIRE_PASS,
      "SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_REQUIRE_PASS",
    );
  return result;
}

function readSafeApprovalPath(value) {
  if (
    hasValue(value) &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) &&
    !/[^/\s\\]+:[^/\s\\]+@/.test(value) &&
    !/^\\\\/.test(value)
  ) {
    const resolved = resolve(repoRoot, value);
    if (isPathInside(APPROVAL_ARTIFACT_DIR, resolved)) {
      return resolved;
    }
    failures.push("--approval must be inside production-provider-write-approval-artifacts");
    return undefined;
  }
  failures.push("--approval must be a safe local path");
  return undefined;
}

function readBoolean(value, label) {
  if (!hasValue(value)) return false;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  failures.push(`${label} must be true or false`);
  return false;
}

function isPathInside(parent, child) {
  if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) {
    failures.push("production provider write approval artifact directory must not be a symlink");
    return false;
  }
  const repoRealPath = realpathSync(repoRoot);
  const parentRealPath = realpathIfExists(parent);
  if (!isResolvedPathInside(repoRealPath, parentRealPath)) {
    failures.push("production provider write approval artifact directory must stay inside repository");
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

function redactArgument(value) {
  if (/^https?:\/\//i.test(value)) return "<redacted>";
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) return "<redacted>";
  return `${value.slice(0, separatorIndex)}=<redacted>`;
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
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value) || /^0{64}$/.test(value)) {
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

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main();
