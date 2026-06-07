import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const MAX_EVIDENCE_BYTES = 256 * 1024;
const EVIDENCE_ARTIFACT_DIR = resolve(
  repoRoot,
  "production-change-approval-artifacts",
);
let args;
let content;

const STATUS_VALUES = new Set(["passed", "failed", "not_run"]);
const APPROVAL_VALUES = new Set(["approved", "pending", "rejected"]);
const ENVIRONMENT_VALUES = new Set(["staging", "production"]);
const ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "releaseId",
  "changeWindow",
  "approvals",
  "rollback",
  "riskControls",
  "communications",
  "safety",
  "evidenceArtifacts",
]);
const CHANGE_WINDOW_KEYS = new Set([
  "targetEnvironment",
  "windowStart",
  "windowEnd",
  "expectedDurationMinutes",
  "freezeWindowConfirmed",
]);
const APPROVAL_KEYS = new Set([
  "approvalStatus",
  "approvedAt",
  "changeTicket",
  "productOwnerFingerprint",
  "engineeringOwnerFingerprint",
  "securityOwnerFingerprint",
  "operationsOwnerFingerprint",
]);
const ROLLBACK_KEYS = new Set([
  "rollbackOwnerFingerprint",
  "incidentOwnerFingerprint",
  "rollbackPlanLinked",
  "killSwitchReady",
  "rollbackDrillStatus",
  "maxRollbackMinutes",
]);
const RISK_CONTROL_KEYS = new Set([
  "launchManifestVerified",
  "releaseProvenanceVerified",
  "releaseEvidenceRequired",
  "productionCanaryRequired",
  "alertingRoutesConfirmed",
  "operatorCoverageConfirmed",
  "providerWritesDisabled",
  "customerVisibleActionsDisabled",
]);
const COMMUNICATION_KEYS = new Set([
  "incidentChannelFingerprint",
  "operatorBriefingStatus",
  "customerSupportBriefingStatus",
  "escalationPolicyStatus",
]);
const SAFETY_KEYS = new Set([
  "secretsInEvidence",
  "rawTenantIdsInEvidence",
  "customerDataInEvidence",
  "providerPayloadsInEvidence",
  "networkExecutedByVerifier",
  "registryPublishedByVerifier",
  "realCommerceWritesEnabled",
  "customerVisibleActionsEnabled",
]);
const EVIDENCE_ARTIFACT_KEYS = new Set([
  "changeApprovalBundle",
  "releaseEvidenceBundle",
  "rollbackDrillSummary",
  "operatorCoverageSummary",
]);
const MUST_BE_TRUE_RISK_CONTROLS = new Set(RISK_CONTROL_KEYS);
const MUST_BE_FALSE_SAFETY_KEYS = new Set(SAFETY_KEYS);
const FORBIDDEN_FIELD_NAMES = new Set([
  "apikey",
  "clientsecret",
  "credentialref",
  "customerdata",
  "customermessage",
  "envfile",
  "envfilepath",
  "envpath",
  "externalconversationid",
  "externalmessageid",
  "logisticsid",
  "merchantid",
  "metricbody",
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
  /tenant_1/i,
  /tenant_launch_secret/i,
  /super_secret_webhook_value/i,
  /production_operator_key/i,
  /actual_provider_token_must_not_leak/i,
  /plain_secret_token_must_not_leak/i,
  /user:secret/i,
];

function main() {
  args = applySafeEnvDefaults(parseArgs(process.argv.slice(2)), process.env);

  const files = {
    packageJson: "package.json",
    changeApprovalDocs: "docs/deploy/production-change-approval.md",
    changeApprovalWorkflow:
      "docs/deploy/production-change-approval.yml.example",
    changeApprovalTest: "scripts/verify-production-change-approval.test.mjs",
    releaseEvidenceDocs: "docs/deploy/production-release-evidence.md",
    launchRunbook: "docs/deploy/production-launch-runbook.md",
    productionReadiness: "docs/deploy/production-readiness.md",
    productionLaunchVerifier: "scripts/verify-production-launch.mjs",
    taskPlan: "task_plan.md",
    progress: "progress.md",
    gitignore: ".gitignore",
  };

  content = Object.fromEntries(
    Object.entries(files).map(([label, relativePath]) => [
      label,
      readRequired(label, relativePath),
    ]),
  );

  verifyStaticArtifacts();

  let releaseId = undefined;
  if (hasValue(args.evidence)) {
    const evidence = readJsonFile(args.evidence, "Production change approval");
    if (evidence) {
      validateChangeApproval(evidence, args);
      if (isRecord(evidence)) releaseId = evidence.releaseId;
    }
  } else if (args.requirePass) {
    failures.push("production change approval evidence is required when pass evidence is required");
  }

  if (failures.length > 0) {
    console.error("Production change approval verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Production change approval verification passed.");
  if (hasValue(args.evidence)) {
    console.log(`- releaseId=${releaseId}`);
    console.log("- evidence=verified");
  } else {
    console.log("- evidence=skipped");
  }
}

function verifyStaticArtifacts() {
  mustContainAll("package scripts", content.packageJson, [
    "verify:production-change-approval",
    "verify:production-change-approval:safe",
    "scripts/verify-production-change-approval.mjs",
  ]);

  mustContainAll("change approval docs", content.changeApprovalDocs, [
    "PR53 Production Change Approval Gate",
    "npm run verify:production-change-approval",
    "npm run verify:production-change-approval:safe",
    "smart-cs-agent.production-change-approval.v1",
    "rollback owner",
    "incident owner",
    "operator coverage",
    "freeze window",
    "does not call the API",
    "does not publish images",
    "does not read GitHub secrets",
  ]);
  mustNotContainAny("change approval docs unsafe", content.changeApprovalDocs, [
    "docker login",
    "docker push",
    "--push",
    "cosign sign",
    "cosign attest",
    "gh attestation sign",
    "aws secretsmanager get-secret-value",
    "gcloud secrets versions access",
    "az keyvault secret show",
    "vault kv get",
    "op read",
    "kubectl set image",
    "helm upgrade",
    "fly deploy",
    "vercel --prod",
    "secrets.",
    "OPERATOR_API_KEYS=",
    "REAL_CHANNEL_WEBHOOK_SECRETS=",
    "PROVIDER_CREDENTIALS=",
    "tenant_1",
  ]);

  mustContainAll("change approval workflow", content.changeApprovalWorkflow, [
    "permissions:",
    "contents: read",
    "node-version: 24",
    "npm run verify:production-release-evidence:safe",
    "npm run verify:production-change-approval",
    "npm run verify:production-change-approval:safe",
    "actions/upload-artifact@v4",
    "production-change-approval-artifacts",
    "path: production-change-approval-artifacts/production-change-approval.json",
  ]);
  mustNotContainAny("change approval workflow unsafe", content.changeApprovalWorkflow, [
    "docker login",
    "docker push",
    "--push",
    "cosign sign",
    "cosign attest",
    "packages: write",
    "id-token: write",
    "attestations: write",
    "secrets.",
    "OPERATOR_API_KEYS",
    "REAL_CHANNEL_WEBHOOK_SECRETS",
    "PROVIDER_CREDENTIALS",
    "tenant_1",
  ]);

  mustContainAll("change approval tests", content.changeApprovalTest, [
    "production change approval verifier passes static checks without evidence",
    "production change approval verifier accepts sanitized approved evidence from safe env mode",
    "production change approval verifier rejects pending approval or weak rollback controls",
    "production change approval verifier rejects sensitive evidence without echoing values",
    "production change approval verifier rejects evidence paths outside the artifact directory",
    "production change approval verifier redacts unknown argument values",
    "assertNoSecretMarkers",
  ]);

  mustContainAll("release evidence docs reference change approval", content.releaseEvidenceDocs, [
    "npm run verify:production-change-approval",
    "production-change-approval.yml.example",
  ]);
  mustContainAll("launch runbook references change approval", content.launchRunbook, [
    "npm run verify:production-change-approval",
    "npm run verify:production-change-approval:safe",
    "docs/deploy/production-change-approval.md",
    "SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE",
    "SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS=true",
  ]);
  mustContainAll("production readiness references change approval", content.productionReadiness, [
    "PR53 Production Change Approval Gate",
    "docs/deploy/production-change-approval.yml.example",
    "npm run verify:production-change-approval",
    "npm run verify:production-change-approval:safe",
  ]);
  mustContainAll("production launch verifier references change approval", content.productionLaunchVerifier, [
    "verify:production-change-approval",
    "production-change-approval.md",
    "production-change-approval.yml.example",
  ]);
  mustContainAll("task plan references PR53", content.taskPlan, [
    "PR53 - Production Change Approval Gate",
    "verify:production-change-approval",
    "production-change-approval.yml.example",
  ]);
  mustContainAll("progress references PR53", content.progress, [
    "Started PR53 production change approval gate",
    "verify:production-change-approval",
  ]);
  mustContainAll("gitignore change approval artifacts", content.gitignore, [
    "production-change-approval-artifacts/",
  ]);
}

function validateChangeApproval(value, options) {
  if (!isRecord(value)) {
    failures.push("production change approval root must be an object");
    return;
  }
  validateAllowedKeys(value, ROOT_KEYS, "production change approval contains unsupported field");

  if (value.schemaVersion !== "smart-cs-agent.production-change-approval.v1") {
    failures.push("schemaVersion must be smart-cs-agent.production-change-approval.v1");
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

  validateChangeWindow(value.changeWindow, options);
  validateApprovals(value.approvals, options);
  validateRollback(value.rollback, options);
  validateRiskControls(value.riskControls, options);
  validateCommunications(value.communications, options);
  validateSafety(value.safety);
  validateEvidenceArtifacts(value.evidenceArtifacts);
  validateNoSensitiveFields(value);
}

function validateChangeWindow(changeWindow, options) {
  if (!isRecord(changeWindow)) {
    failures.push("changeWindow must be an object");
    return;
  }
  validateAllowedKeys(changeWindow, CHANGE_WINDOW_KEYS, "changeWindow contains unsupported field");
  if (!ENVIRONMENT_VALUES.has(changeWindow.targetEnvironment)) {
    failures.push("changeWindow.targetEnvironment must be staging or production");
  } else if (options.requirePass && changeWindow.targetEnvironment !== "production") {
    failures.push("changeWindow.targetEnvironment must be production");
  }
  if (!isIsoTimestamp(changeWindow.windowStart)) {
    failures.push("changeWindow.windowStart must be an ISO timestamp");
  }
  if (!isIsoTimestamp(changeWindow.windowEnd)) {
    failures.push("changeWindow.windowEnd must be an ISO timestamp");
  }
  if (
    isIsoTimestamp(changeWindow.windowStart) &&
    isIsoTimestamp(changeWindow.windowEnd) &&
    Date.parse(changeWindow.windowEnd) <= Date.parse(changeWindow.windowStart)
  ) {
    failures.push("changeWindow.windowEnd must be after windowStart");
  }
  if (
    !Number.isInteger(changeWindow.expectedDurationMinutes) ||
    changeWindow.expectedDurationMinutes < 1 ||
    changeWindow.expectedDurationMinutes > 240
  ) {
    failures.push("changeWindow.expectedDurationMinutes must be between 1 and 240");
  }
  validateBoolean("changeWindow.freezeWindowConfirmed", changeWindow.freezeWindowConfirmed);
  if (options.requirePass && changeWindow.freezeWindowConfirmed !== true) {
    failures.push("changeWindow.freezeWindowConfirmed must be true");
  }
}

function validateApprovals(approvals, options) {
  if (!isRecord(approvals)) {
    failures.push("approvals must be an object");
    return;
  }
  validateAllowedKeys(approvals, APPROVAL_KEYS, "approvals contains unsupported field");
  if (!APPROVAL_VALUES.has(approvals.approvalStatus)) {
    failures.push("approvals.approvalStatus must be approved, pending, or rejected");
  } else if (options.requirePass && approvals.approvalStatus !== "approved") {
    failures.push("approvals.approvalStatus must be approved");
  }
  if (!isIsoTimestamp(approvals.approvedAt)) {
    failures.push("approvals.approvedAt must be an ISO timestamp");
  }
  if (
    typeof approvals.changeTicket !== "string" ||
    !/^[A-Za-z0-9._-]{3,80}$/.test(approvals.changeTicket)
  ) {
    failures.push("approvals.changeTicket must be a safe change ticket id");
  }
  for (const key of [
    "productOwnerFingerprint",
    "engineeringOwnerFingerprint",
    "securityOwnerFingerprint",
    "operationsOwnerFingerprint",
  ]) {
    validateFingerprint(`approvals.${key}`, approvals[key]);
  }
}

function validateRollback(rollback, options) {
  if (!isRecord(rollback)) {
    failures.push("rollback must be an object");
    return;
  }
  validateAllowedKeys(rollback, ROLLBACK_KEYS, "rollback contains unsupported field");
  validateFingerprint("rollback.rollbackOwnerFingerprint", rollback.rollbackOwnerFingerprint);
  validateFingerprint("rollback.incidentOwnerFingerprint", rollback.incidentOwnerFingerprint);
  for (const key of ["rollbackPlanLinked", "killSwitchReady"]) {
    validateBoolean(`rollback.${key}`, rollback[key]);
    if (options.requirePass && rollback[key] !== true) {
      failures.push(`rollback.${key} must be true`);
    }
  }
  validateStatus("rollback.rollbackDrillStatus", rollback.rollbackDrillStatus, options);
  if (
    !Number.isInteger(rollback.maxRollbackMinutes) ||
    rollback.maxRollbackMinutes < 1 ||
    rollback.maxRollbackMinutes > 60
  ) {
    failures.push("rollback.maxRollbackMinutes must be between 1 and 60");
  }
  if (options.requirePass && rollback.maxRollbackMinutes > 30) {
    failures.push("rollback.maxRollbackMinutes must be at most 30");
  }
}

function validateRiskControls(riskControls, options) {
  if (!isRecord(riskControls)) {
    failures.push("riskControls must be an object");
    return;
  }
  validateAllowedKeys(riskControls, RISK_CONTROL_KEYS, "riskControls contains unsupported field");
  for (const key of MUST_BE_TRUE_RISK_CONTROLS) {
    validateBoolean(`riskControls.${key}`, riskControls[key]);
    if (options.requirePass && riskControls[key] !== true) {
      failures.push(`riskControls.${key} must be true`);
    }
  }
}

function validateCommunications(communications, options) {
  if (!isRecord(communications)) {
    failures.push("communications must be an object");
    return;
  }
  validateAllowedKeys(communications, COMMUNICATION_KEYS, "communications contains unsupported field");
  validateFingerprint(
    "communications.incidentChannelFingerprint",
    communications.incidentChannelFingerprint,
  );
  for (const key of [
    "operatorBriefingStatus",
    "customerSupportBriefingStatus",
    "escalationPolicyStatus",
  ]) {
    validateStatus(`communications.${key}`, communications[key], options);
  }
}

function validateSafety(safety) {
  if (!isRecord(safety)) {
    failures.push("safety must be an object");
    return;
  }
  validateAllowedKeys(safety, SAFETY_KEYS, "safety contains unsupported field");
  for (const key of MUST_BE_FALSE_SAFETY_KEYS) {
    validateBoolean(`safety.${key}`, safety[key]);
    if (safety[key] !== false) {
      failures.push(`safety.${key} must be false`);
    }
  }
}

function validateEvidenceArtifacts(evidenceArtifacts) {
  if (!isRecord(evidenceArtifacts)) {
    failures.push("evidenceArtifacts must be an object");
    return;
  }
  validateAllowedKeys(
    evidenceArtifacts,
    EVIDENCE_ARTIFACT_KEYS,
    "evidenceArtifacts contains unsupported field",
  );
  for (const key of EVIDENCE_ARTIFACT_KEYS) {
    if (!isSafeArtifactName(evidenceArtifacts[key])) {
      failures.push(`evidenceArtifacts.${key} must be a safe artifact name`);
    }
  }
}

function validateStatus(label, value, options) {
  if (!STATUS_VALUES.has(value)) {
    failures.push(`${label} must be passed, failed, or not_run`);
  } else if (options.requirePass && value !== "passed") {
    failures.push(`${label} must be passed`);
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
  if (stats.size > MAX_EVIDENCE_BYTES) {
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
        failures.push("forbidden sensitive production change approval field");
      }
      walkForSensitiveValues(nested);
    }
    return;
  }
  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push("forbidden sensitive production change approval value");
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
    evidence: undefined,
    fromEnv: false,
    requirePass: false,
  };

  for (const value of values) {
    if (value === "--from-env") {
      parsed.fromEnv = true;
    } else if (value === "--require-pass") {
      parsed.requirePass = true;
    } else if (value.startsWith("--evidence=")) {
      parsed.evidence = readSafeEvidencePath(value.slice("--evidence=".length));
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
    !hasValue(result.evidence) &&
    hasValue(input.SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE)
  ) {
    result.evidence = readSafeEvidencePath(
      input.SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE,
    );
  }
  result.requirePass =
    result.requirePass ||
    readBoolean(
      input.SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS,
      "SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS",
    );
  return result;
}

function readSafeEvidencePath(value) {
  if (
    hasValue(value) &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) &&
    !/[^/\s\\]+:[^/\s\\]+@/.test(value) &&
    !/^\\\\/.test(value)
  ) {
    const resolved = resolve(repoRoot, value);
    if (isPathInside(EVIDENCE_ARTIFACT_DIR, resolved)) {
      return resolved;
    }
    failures.push("--evidence must be inside production-change-approval-artifacts");
    return undefined;
  }
  failures.push("--evidence must be a safe local path");
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
  const relativePath = relative(parent, child);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function redactArgument(value) {
  if (/^https?:\/\//i.test(value)) return "<redacted>";
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) return "<redacted>";
  return `${value.slice(0, separatorIndex)}=<redacted>`;
}

function isSafeArtifactName(value) {
  return (
    typeof value === "string" &&
    value === basename(value) &&
    /^[A-Za-z0-9._-]{3,120}$/.test(value)
  );
}

function isIsoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main();
