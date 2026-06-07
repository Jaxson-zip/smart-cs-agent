import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const MAX_EVIDENCE_BYTES = 256 * 1024;
let args;
let content;

function main() {
  args = applySafeEnvDefaults(parseArgs(process.argv.slice(2)), process.env);

  const files = {
    packageJson: "package.json",
    releaseProvenanceDocs: "docs/deploy/production-release-provenance.md",
    releaseProvenanceWorkflow:
      "docs/deploy/production-release-provenance.yml.example",
    releaseProvenanceTest:
      "scripts/verify-production-release-provenance.test.mjs",
    imageSecurityDocs: "docs/deploy/production-image-security.md",
    deploymentDocs: "docs/deploy/production-deployment-artifacts.md",
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
  let imageCount = 0;
  if (hasValue(args.evidence)) {
    const evidence = readJsonFile(args.evidence, "Release provenance evidence");
    if (evidence) {
      validateReleaseProvenance(evidence, args);
      if (isRecord(evidence)) {
        releaseId = evidence.releaseId;
        imageCount = isRecord(evidence.images)
          ? Object.keys(evidence.images).length
          : 0;
      }
    }
  } else if (args.requirePass) {
    failures.push("release provenance evidence is required when pass evidence is required");
  }

  if (failures.length > 0) {
    console.error("Production release provenance verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Production release provenance verification passed.");
  if (hasValue(args.evidence)) {
    console.log(`- releaseId=${releaseId}`);
    console.log(`- images=${imageCount}`);
    console.log("- evidence=verified");
  } else {
    console.log("- evidence=skipped");
  }
}

function verifyStaticArtifacts() {
  mustContainAll("package scripts", content.packageJson, [
    "verify:production-release-provenance",
    "verify:production-release-provenance:safe",
    "scripts/verify-production-release-provenance.mjs",
  ]);

  mustContainAll("release provenance docs", content.releaseProvenanceDocs, [
    "PR51 Production Release Provenance And Promotion Boundary",
    "npm run verify:production-release-provenance",
    "npm run verify:production-release-provenance:safe",
    "smart-cs-agent.release-provenance.v1",
    "image digests",
    "signatureVerified",
    "provenanceVerified",
    "sbomAttestationVerified",
    "promotion approval",
    "does not publish images",
    "does not authenticate to a registry",
    "does not read GitHub secrets",
  ]);
  mustNotContainAny("release provenance docs unsafe", content.releaseProvenanceDocs, [
    "docker login",
    "docker push",
    "--push",
    "docker manifest push",
    "docker manifest create",
    "oras push",
    "crane push",
    "skopeo copy",
    "cosign sign",
    "cosign attest",
    "cosign attach",
    "gh attestation sign",
    "gh attestation generate",
    "aws secretsmanager get-secret-value",
    "gcloud secrets versions access",
    "az keyvault secret show",
    "vault kv get",
    "op read",
    "doppler secrets download",
    "sops -d",
    "kubectl set image",
    "helm upgrade",
    "fly deploy",
    "vercel --prod",
    "secrets.",
    "OPERATOR_API_KEYS=",
    "REAL_CHANNEL_WEBHOOK_SECRETS=",
    "PROVIDER_CREDENTIALS=",
    "dev_operator_key",
    "tenant_1",
  ]);

  mustContainAll("release provenance workflow", content.releaseProvenanceWorkflow, [
    "permissions:",
    "contents: read",
    "node-version: 24",
    "npm run verify:production-image-builds:docker",
    "npm run verify:production-container-smoke:docker",
    "npm run verify:production-image-security:docker",
    "npm run verify:production-release-provenance",
    "npm run verify:production-release-provenance:safe",
    "actions/upload-artifact@v4",
    "production-release-provenance-artifacts",
  ]);
  mustNotContainAny("release provenance workflow unsafe", content.releaseProvenanceWorkflow, [
    "docker login",
    "docker push",
    "--push",
    "docker manifest push",
    "docker manifest create",
    "oras push",
    "crane push",
    "skopeo copy",
    "cosign sign",
    "cosign attest",
    "cosign attach",
    "gh attestation sign",
    "gh attestation generate",
    "aws secretsmanager get-secret-value",
    "gcloud secrets versions access",
    "az keyvault secret show",
    "vault kv get",
    "op read",
    "doppler secrets download",
    "sops -d",
    "kubectl set image",
    "helm upgrade",
    "fly deploy",
    "vercel --prod",
    "packages: write",
    "id-token: write",
    "attestations: write",
    "secrets.",
    "OPERATOR_API_KEYS",
    "REAL_CHANNEL_WEBHOOK_SECRETS",
    "PROVIDER_CREDENTIALS",
    "tenant_1",
  ]);

  mustContainAll("release provenance tests", content.releaseProvenanceTest, [
    "production release provenance verifier passes static checks without evidence",
    "production release provenance verifier accepts sanitized pass evidence from safe env mode",
    "production release provenance verifier rejects mutable or unsigned evidence when pass is required",
    "production release provenance verifier rejects sensitive evidence without echoing values",
    "production release provenance verifier redacts unknown argument values",
    "assertNoSecretMarkers",
  ]);

  mustContainAll("image security docs reference release provenance", content.imageSecurityDocs, [
    "npm run verify:production-release-provenance",
    "production-release-provenance.yml.example",
  ]);
  mustContainAll("deployment docs reference release provenance", content.deploymentDocs, [
    "PR51 Production Release Provenance",
    "npm run verify:production-release-provenance",
    "production-release-provenance.yml.example",
  ]);
  mustContainAll("launch runbook references release provenance", content.launchRunbook, [
    "npm run verify:production-release-provenance",
    "npm run verify:production-release-provenance:safe",
    "docs/deploy/production-release-provenance.md",
    "SMARTCS_RELEASE_PROVENANCE_FILE",
    "SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS=true",
  ]);
  mustContainAll("production readiness references release provenance", content.productionReadiness, [
    "PR51 Production Release Provenance And Promotion Boundary",
    "npm run verify:production-release-provenance",
    "production-release-provenance.yml.example",
  ]);
  mustContainAll("production launch verifier references release provenance", content.productionLaunchVerifier, [
    "verify:production-release-provenance",
    "production-release-provenance.md",
    "production-release-provenance.yml.example",
  ]);
  mustContainAll("task plan references PR51", content.taskPlan, [
    "PR51 - Production Release Provenance And Promotion Boundary",
    "verify:production-release-provenance",
    "production-release-provenance.yml.example",
  ]);
  mustContainAll("progress references PR51", content.progress, [
    "Started PR51 production release provenance and promotion boundary",
    "verify:production-release-provenance",
  ]);
  mustContainAll("gitignore release provenance artifacts", content.gitignore, [
    "production-release-provenance-artifacts/",
  ]);
}

function validateReleaseProvenance(value, options) {
  if (!isRecord(value)) {
    failures.push("release provenance evidence root must be an object");
    return;
  }
  validateAllowedKeys(value, ROOT_KEYS, "release provenance evidence contains unsupported field");

  if (value.schemaVersion !== "smart-cs-agent.release-provenance.v1") {
    failures.push("schemaVersion must be smart-cs-agent.release-provenance.v1");
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
  validateImages(value.images, options);
  validateGates(value.gates, options);
  validateAttestations(value.attestations, options);
  validatePromotion(value.promotion, options);
  validateSafety(value.safety);
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
    typeof source.repository !== "string" ||
    !/^[A-Za-z0-9._/-]{3,120}$/.test(source.repository)
  ) {
    failures.push("source.repository must be a safe repository name");
  }
  if (
    typeof source.branch !== "string" ||
    !/^[A-Za-z0-9._/-]{1,120}$/.test(source.branch)
  ) {
    failures.push("source.branch must be a safe branch name");
  }
  if (typeof source.commitSha !== "string" || !/^[a-fA-F0-9]{40}$/.test(source.commitSha)) {
    failures.push("source.commitSha must be a 40-character git SHA");
  }
  if (
    typeof source.workflowName !== "string" ||
    !/^[A-Za-z0-9._ -]{3,120}$/.test(source.workflowName)
  ) {
    failures.push("source.workflowName must be a safe workflow name");
  }
  if (
    typeof source.workflowRunId !== "string" ||
    !/^[A-Za-z0-9._-]{3,80}$/.test(source.workflowRunId)
  ) {
    failures.push("source.workflowRunId must be a safe run identifier");
  }
}

function validateImages(images, options) {
  if (!isRecord(images)) {
    failures.push("images must be an object");
    return;
  }
  validateAllowedKeys(images, IMAGE_MAP_KEYS, "images contains unsupported field");
  for (const key of ["api", "web"]) {
    validateImage(key, images[key], options);
  }
}

function validateImage(label, image, options) {
  if (!isRecord(image)) {
    failures.push(`images.${label} must be an object`);
    return;
  }
  validateAllowedKeys(image, IMAGE_KEYS, `images.${label} contains unsupported field`);
  if (
    typeof image.repository !== "string" ||
    !/^[A-Za-z0-9._/-]{3,160}$/.test(image.repository)
  ) {
    failures.push(`images.${label}.repository must be a safe image repository`);
  }
  if (typeof image.digest !== "string" || !/^sha256:[a-fA-F0-9]{64}$/.test(image.digest)) {
    failures.push(`images.${label}.digest must be an immutable sha256 digest`);
  }
  for (const field of ["sbomArtifact", "vulnerabilityReport"]) {
    if (!isSafeArtifactName(image[field])) {
      failures.push(`images.${label}.${field} must be a safe artifact name`);
    }
  }
  for (const field of [
    "signatureVerified",
    "provenanceVerified",
    "sbomAttestationVerified",
  ]) {
    if (typeof image[field] !== "boolean") {
      failures.push(`images.${label}.${field} must be a boolean`);
    } else if (options.requirePass && image[field] !== true) {
      failures.push(`images.${label}.${field} must be true`);
    }
  }
}

function validateGates(gates, options) {
  if (!isRecord(gates)) {
    failures.push("gates must be an object");
    return;
  }
  validateAllowedKeys(gates, GATE_KEYS, "gates contains unsupported field");
  for (const key of GATE_KEYS) {
    if (!GATE_STATUSES.has(gates[key])) {
      failures.push(`${key} must be passed, failed, or not_run`);
    } else if (options.requirePass && gates[key] !== "passed") {
      failures.push(`${key} must be passed`);
    }
  }
}

function validateAttestations(attestations, options) {
  if (!isRecord(attestations)) {
    failures.push("attestations must be an object");
    return;
  }
  validateAllowedKeys(attestations, ATTESTATION_KEYS, "attestations contains unsupported field");
  if (!["keyless_oidc", "external"].includes(attestations.signerMode)) {
    failures.push("attestations.signerMode must be keyless_oidc or external");
  }
  if (options.requirePass && attestations.signerMode !== "keyless_oidc") {
    failures.push("attestations.signerMode must be keyless_oidc");
  }
  if (!["slsa-build", "custom-build"].includes(attestations.provenancePredicate)) {
    failures.push("attestations.provenancePredicate must be a supported predicate");
  }
  if (attestations.sbomFormat !== "spdx-json") {
    failures.push("attestations.sbomFormat must be spdx-json");
  }
  if (
    typeof attestations.buildType !== "string" ||
    !/^[A-Za-z0-9._/-]{3,120}$/.test(attestations.buildType)
  ) {
    failures.push("attestations.buildType must be a safe build type");
  }
}

function validatePromotion(promotion, options) {
  if (!isRecord(promotion)) {
    failures.push("promotion must be an object");
    return;
  }
  validateAllowedKeys(promotion, PROMOTION_KEYS, "promotion contains unsupported field");
  if (!["staging", "production", "rollback"].includes(promotion.sourceEnvironment)) {
    failures.push("promotion.sourceEnvironment must be a supported environment");
  }
  if (!["staging", "production"].includes(promotion.targetEnvironment)) {
    failures.push("promotion.targetEnvironment must be a supported environment");
  }
  if (promotion.sourceEnvironment === promotion.targetEnvironment) {
    failures.push("promotion source and target environments must differ");
  }
  if (!["approved", "pending", "rejected"].includes(promotion.approval)) {
    failures.push("promotion.approval must be approved, pending, or rejected");
  } else if (options.requirePass && promotion.approval !== "approved") {
    failures.push("promotion.approval must be approved");
  }
  if (
    typeof promotion.approvedByFingerprint !== "string" ||
    !/^[a-f0-9]{12}$/.test(promotion.approvedByFingerprint)
  ) {
    failures.push("promotion.approvedByFingerprint must be a 12-character fingerprint");
  }
  if (
    typeof promotion.changeTicket !== "string" ||
    !/^[A-Za-z0-9._-]{3,80}$/.test(promotion.changeTicket)
  ) {
    failures.push("promotion.changeTicket must be a safe change ticket id");
  }
}

function validateSafety(safety) {
  if (!isRecord(safety)) {
    failures.push("safety must be an object");
    return;
  }
  validateAllowedKeys(safety, SAFETY_KEYS, "safety contains unsupported field");
  for (const key of SAFETY_KEYS) {
    if (typeof safety[key] !== "boolean") {
      failures.push(`safety.${key} must be a boolean`);
    } else if (safety[key] !== false) {
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
        failures.push("forbidden sensitive release provenance field");
      }
      walkForSensitiveValues(nested);
    }
    return;
  }
  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push("forbidden sensitive release provenance value");
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
  if (!hasValue(result.evidence) && hasValue(input.SMARTCS_RELEASE_PROVENANCE_FILE)) {
    result.evidence = readSafeEvidencePath(input.SMARTCS_RELEASE_PROVENANCE_FILE);
  }
  result.requirePass =
    result.requirePass ||
    readBoolean(
      input.SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS,
      "SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS",
    );
  return result;
}

function readSafeEvidencePath(value) {
  if (
    hasValue(value) &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) &&
    !/[^/\s\\]+:[^/\s\\]+@/.test(value)
  ) {
    return resolve(value);
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

const ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "releaseId",
  "source",
  "images",
  "gates",
  "attestations",
  "promotion",
  "safety",
  "evidenceArtifacts",
]);
const SOURCE_KEYS = new Set([
  "repository",
  "branch",
  "commitSha",
  "workflowName",
  "workflowRunId",
]);
const IMAGE_MAP_KEYS = new Set(["api", "web"]);
const IMAGE_KEYS = new Set([
  "repository",
  "digest",
  "sbomArtifact",
  "vulnerabilityReport",
  "signatureVerified",
  "provenanceVerified",
  "sbomAttestationVerified",
]);
const GATE_KEYS = new Set([
  "productionImageBuilds",
  "productionContainerSmoke",
  "productionImageSecurity",
]);
const GATE_STATUSES = new Set(["passed", "failed", "not_run"]);
const ATTESTATION_KEYS = new Set([
  "signerMode",
  "provenancePredicate",
  "sbomFormat",
  "buildType",
]);
const PROMOTION_KEYS = new Set([
  "sourceEnvironment",
  "targetEnvironment",
  "approval",
  "approvedByFingerprint",
  "changeTicket",
]);
const SAFETY_KEYS = new Set([
  "registryPublishedByVerifier",
  "networkExecutedByVerifier",
  "secretsInEvidence",
  "rawTenantIdsInEvidence",
  "providerPayloadsInEvidence",
  "customerDataInEvidence",
  "realCommerceWritesEnabled",
  "customerVisibleActionsEnabled",
  "providerPayloadReadsEnabled",
]);
const EVIDENCE_ARTIFACT_KEYS = new Set([
  "imageSecurityBundle",
  "releaseProvenanceBundle",
  "apiSbom",
  "webSbom",
  "apiVulnerabilityReport",
  "webVulnerabilityReport",
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
  "operatorapikey",
  "orderid",
  "providerpayload",
  "providerresponse",
  "providertoken",
  "rawbody",
  "responsebody",
  "secret",
  "signaturevalue",
  "signatureraw",
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

main();
