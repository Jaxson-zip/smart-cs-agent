import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const MAX_EVIDENCE_BYTES = 256 * 1024;
const EVIDENCE_ARTIFACT_DIR = resolve(
  repoRoot,
  "production-release-evidence-artifacts",
);
let args;
let content;

const STATUS_VALUES = new Set(["passed", "failed", "not_run"]);
const ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "releaseId",
  "source",
  "releaseProvenance",
  "launchManifest",
  "deployHealth",
  "operations",
  "safety",
  "evidenceArtifacts",
]);
const SOURCE_KEYS = new Set(["branch", "commitSha"]);
const RELEASE_PROVENANCE_KEYS = new Set([
  "status",
  "releaseId",
  "imageCount",
  "signatureVerified",
  "provenanceVerified",
  "sbomAttestationVerified",
]);
const LAUNCH_MANIFEST_KEYS = new Set([
  "status",
  "entryCount",
  "channelCount",
  "requireRealChannel",
  "requireProviderReadonly",
]);
const DEPLOY_HEALTH_KEYS = new Set([
  "migrationStatus",
  "readinessStatus",
  "canaryStatus",
  "alertingStatus",
  "channelRunbookStatus",
  "operatorBootstrapStatus",
]);
const OPERATIONS_KEYS = new Set([
  "rollbackOwnerFingerprint",
  "incidentOwnerFingerprint",
  "operatorLeadFingerprint",
  "operatorCoverageMinutes",
  "rollbackDrillIncluded",
]);
const SAFETY_KEYS = new Set([
  "noRealCommerceWrites",
  "noCustomerVisibleActions",
  "noProviderPayloadReads",
  "noProviderPayloadsInEvidence",
  "noCustomerDataInEvidence",
  "noSecretsInEvidence",
  "noRawTenantIdsInEvidence",
  "networkExecutedByVerifier",
  "registryPublishedByVerifier",
]);
const EVIDENCE_ARTIFACT_KEYS = new Set([
  "releaseProvenanceBundle",
  "launchManifestBundle",
  "readinessSummary",
  "canarySummary",
  "rollbackDrillSummary",
]);
const TRUE_SAFETY_KEYS = new Set([
  "noRealCommerceWrites",
  "noCustomerVisibleActions",
  "noProviderPayloadReads",
  "noProviderPayloadsInEvidence",
  "noCustomerDataInEvidence",
  "noSecretsInEvidence",
  "noRawTenantIdsInEvidence",
]);
const FALSE_SAFETY_KEYS = new Set([
  "networkExecutedByVerifier",
  "registryPublishedByVerifier",
]);
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
    releaseEvidenceDocs: "docs/deploy/production-release-evidence.md",
    releaseEvidenceWorkflow:
      "docs/deploy/production-release-evidence.yml.example",
    releaseEvidenceTest: "scripts/verify-production-release-evidence.test.mjs",
    releaseProvenanceDocs: "docs/deploy/production-release-provenance.md",
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
    const evidence = readJsonFile(args.evidence, "Production release evidence");
    if (evidence) {
      validateReleaseEvidence(evidence, args);
      if (isRecord(evidence)) releaseId = evidence.releaseId;
    }
  } else if (args.requirePass) {
    failures.push("production release evidence is required when pass evidence is required");
  }

  if (failures.length > 0) {
    console.error("Production release evidence verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Production release evidence verification passed.");
  if (hasValue(args.evidence)) {
    console.log(`- releaseId=${releaseId}`);
    console.log("- evidence=verified");
  } else {
    console.log("- evidence=skipped");
  }
}

function verifyStaticArtifacts() {
  mustContainAll("package scripts", content.packageJson, [
    "verify:production-release-evidence",
    "verify:production-release-evidence:safe",
    "scripts/verify-production-release-evidence.mjs",
  ]);

  mustContainAll("release evidence docs", content.releaseEvidenceDocs, [
    "PR52 Production Release Evidence Archive",
    "npm run verify:production-release-evidence",
    "npm run verify:production-release-evidence:safe",
    "smart-cs-agent.production-release-evidence.v1",
    "release provenance",
    "launch manifest",
    "production readiness",
    "production canary",
    "rollback owner",
    "does not call the API",
    "does not publish images",
    "does not read GitHub secrets",
  ]);
  mustNotContainAny("release evidence docs unsafe", content.releaseEvidenceDocs, [
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

  mustContainAll("release evidence workflow", content.releaseEvidenceWorkflow, [
    "permissions:",
    "contents: read",
    "node-version: 24",
    "npm run verify:production-release-provenance:safe",
    "npm run verify:production-release-evidence",
    "npm run verify:production-release-evidence:safe",
    "actions/upload-artifact@v4",
    "production-release-evidence-artifacts",
  ]);
  mustNotContainAny("release evidence workflow unsafe", content.releaseEvidenceWorkflow, [
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

  mustContainAll("release evidence tests", content.releaseEvidenceTest, [
    "production release evidence verifier passes static checks without evidence",
    "production release evidence verifier accepts sanitized pass evidence from safe env mode",
    "production release evidence verifier rejects failed launch or unsafe safety facts",
    "production release evidence verifier rejects sensitive evidence without echoing values",
    "production release evidence verifier rejects evidence paths outside the artifact directory",
    "production release evidence verifier redacts unknown argument values",
    "assertNoSecretMarkers",
  ]);

  mustContainAll("release provenance docs reference release evidence", content.releaseProvenanceDocs, [
    "npm run verify:production-release-evidence",
    "production-release-evidence.yml.example",
  ]);
  mustContainAll("launch runbook references release evidence", content.launchRunbook, [
    "npm run verify:production-release-evidence",
    "npm run verify:production-release-evidence:safe",
    "docs/deploy/production-release-evidence.md",
    "SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE",
    "SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS=true",
  ]);
  mustContainAll("production readiness references release evidence", content.productionReadiness, [
    "PR52 Production Release Evidence Archive",
    "docs/deploy/production-release-evidence.yml.example",
    "npm run verify:production-release-evidence",
    "npm run verify:production-release-evidence:safe",
  ]);
  mustContainAll("production launch verifier references release evidence", content.productionLaunchVerifier, [
    "verify:production-release-evidence",
    "production-release-evidence.md",
    "production-release-evidence.yml.example",
  ]);
  mustContainAll("task plan references PR52", content.taskPlan, [
    "PR52 - Production Release Evidence Archive",
    "verify:production-release-evidence",
    "production-release-evidence.yml.example",
  ]);
  mustContainAll("progress references PR52", content.progress, [
    "Started PR52 production release evidence archive",
    "verify:production-release-evidence",
  ]);
  mustContainAll("gitignore release evidence artifacts", content.gitignore, [
    "production-release-evidence-artifacts/",
  ]);
}

function validateReleaseEvidence(value, options) {
  if (!isRecord(value)) {
    failures.push("production release evidence root must be an object");
    return;
  }
  validateAllowedKeys(value, ROOT_KEYS, "production release evidence contains unsupported field");

  if (value.schemaVersion !== "smart-cs-agent.production-release-evidence.v1") {
    failures.push("schemaVersion must be smart-cs-agent.production-release-evidence.v1");
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

  validateSource(value.source);
  validateReleaseProvenance(value.releaseProvenance, options);
  validateLaunchManifest(value.launchManifest, options);
  validateDeployHealth(value.deployHealth, options);
  validateOperations(value.operations, options);
  validateSafety(value.safety, options);
  validateEvidenceArtifacts(value.evidenceArtifacts);
  validateNoSensitiveFields(value);
}

function validateSource(source) {
  if (!isRecord(source)) {
    failures.push("source must be an object");
    return;
  }
  validateAllowedKeys(source, SOURCE_KEYS, "source contains unsupported field");
  if (
    typeof source.branch !== "string" ||
    !/^[A-Za-z0-9._/-]{1,120}$/.test(source.branch)
  ) {
    failures.push("source.branch must be a safe branch name");
  }
  if (typeof source.commitSha !== "string" || !/^[a-fA-F0-9]{40}$/.test(source.commitSha)) {
    failures.push("source.commitSha must be a 40-character git SHA");
  }
}

function validateReleaseProvenance(provenance, options) {
  if (!isRecord(provenance)) {
    failures.push("releaseProvenance must be an object");
    return;
  }
  validateAllowedKeys(
    provenance,
    RELEASE_PROVENANCE_KEYS,
    "releaseProvenance contains unsupported field",
  );
  validateStatus("releaseProvenance.status", provenance.status, options);
  if (
    typeof provenance.releaseId !== "string" ||
    !/^[A-Za-z0-9._-]{3,80}$/.test(provenance.releaseId)
  ) {
    failures.push("releaseProvenance.releaseId must be a safe release identifier");
  }
  if (!Number.isInteger(provenance.imageCount) || provenance.imageCount < 2) {
    failures.push("releaseProvenance.imageCount must be at least 2");
  }
  for (const key of [
    "signatureVerified",
    "provenanceVerified",
    "sbomAttestationVerified",
  ]) {
    validateBoolean(`releaseProvenance.${key}`, provenance[key]);
    if (options.requirePass && provenance[key] !== true) {
      failures.push(`releaseProvenance.${key} must be true`);
    }
  }
}

function validateLaunchManifest(launchManifest, options) {
  if (!isRecord(launchManifest)) {
    failures.push("launchManifest must be an object");
    return;
  }
  validateAllowedKeys(
    launchManifest,
    LAUNCH_MANIFEST_KEYS,
    "launchManifest contains unsupported field",
  );
  validateStatus("launchManifest.status", launchManifest.status, options);
  for (const key of ["entryCount", "channelCount"]) {
    if (!Number.isInteger(launchManifest[key]) || launchManifest[key] < 1) {
      failures.push(`launchManifest.${key} must be a positive integer`);
    }
  }
  for (const key of ["requireRealChannel", "requireProviderReadonly"]) {
    validateBoolean(`launchManifest.${key}`, launchManifest[key]);
    if (options.requirePass && launchManifest[key] !== true) {
      failures.push(`launchManifest.${key} must be true`);
    }
  }
}

function validateDeployHealth(deployHealth, options) {
  if (!isRecord(deployHealth)) {
    failures.push("deployHealth must be an object");
    return;
  }
  validateAllowedKeys(
    deployHealth,
    DEPLOY_HEALTH_KEYS,
    "deployHealth contains unsupported field",
  );
  for (const key of DEPLOY_HEALTH_KEYS) {
    validateStatus(`deployHealth.${key}`, deployHealth[key], options);
  }
}

function validateOperations(operations, options) {
  if (!isRecord(operations)) {
    failures.push("operations must be an object");
    return;
  }
  validateAllowedKeys(operations, OPERATIONS_KEYS, "operations contains unsupported field");
  for (const key of [
    "rollbackOwnerFingerprint",
    "incidentOwnerFingerprint",
    "operatorLeadFingerprint",
  ]) {
    if (typeof operations[key] !== "string" || !/^[a-f0-9]{12}$/.test(operations[key])) {
      failures.push(`operations.${key} must be a 12-character fingerprint`);
    }
  }
  if (
    !Number.isInteger(operations.operatorCoverageMinutes) ||
    operations.operatorCoverageMinutes < 30
  ) {
    failures.push("operations.operatorCoverageMinutes must be at least 30");
  }
  validateBoolean("operations.rollbackDrillIncluded", operations.rollbackDrillIncluded);
  if (options.requirePass && operations.rollbackDrillIncluded !== true) {
    failures.push("operations.rollbackDrillIncluded must be true");
  }
}

function validateSafety(safety, options) {
  if (!isRecord(safety)) {
    failures.push("safety must be an object");
    return;
  }
  validateAllowedKeys(safety, SAFETY_KEYS, "safety contains unsupported field");
  for (const key of TRUE_SAFETY_KEYS) {
    validateBoolean(`safety.${key}`, safety[key]);
    if (options.requirePass && safety[key] !== true) {
      failures.push(`safety.${key} must be true`);
    }
  }
  for (const key of FALSE_SAFETY_KEYS) {
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
        failures.push("forbidden sensitive production release evidence field");
      }
      walkForSensitiveValues(nested);
    }
    return;
  }
  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push("forbidden sensitive production release evidence value");
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
    hasValue(input.SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE)
  ) {
    result.evidence = readSafeEvidencePath(
      input.SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE,
    );
  }
  result.requirePass =
    result.requirePass ||
    readBoolean(
      input.SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS,
      "SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS",
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
    failures.push("--evidence must be inside production-release-evidence-artifacts");
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
