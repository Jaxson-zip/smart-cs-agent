import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const MAX_ARTIFACT_BYTES = 512 * 1024;

const ARTIFACT_DIRS = {
  releaseProvenance: resolve(repoRoot, "production-release-provenance-artifacts"),
  productionReleaseEvidence: resolve(repoRoot, "production-release-evidence-artifacts"),
  productionChangeApproval: resolve(repoRoot, "production-change-approval-artifacts"),
  launchManifest: resolve(repoRoot, "launch-manifest-artifacts"),
};

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
  /tenant_launch_secret/i,
  /super_secret_webhook_value/i,
  /production_operator_key/i,
  /actual_provider_token_must_not_leak/i,
  /plain_secret_token_must_not_leak/i,
  /user:secret/i,
];

function main() {
  const args = applySafeEnvDefaults(parseArgs(process.argv.slice(2)), process.env);
  const content = readStaticContent();

  verifyStaticArtifacts(content);

  const fileEntries = [
    ["releaseProvenance", "Release provenance", args.releaseProvenance],
    [
      "productionReleaseEvidence",
      "Production release evidence",
      args.productionReleaseEvidence,
    ],
    [
      "productionChangeApproval",
      "Production change approval",
      args.productionChangeApproval,
    ],
    ["launchManifest", "Launch manifest", args.launchManifest],
  ];

  const hasBindingFiles = fileEntries.some(([, , file]) => hasValue(file));
  const hasAllBindingFiles = fileEntries.every(([, , file]) => hasValue(file));

  if ((args.requirePass || hasBindingFiles) && !hasAllBindingFiles) {
    failures.push("all production launch binding artifacts are required");
  }

  let releaseId = undefined;
  if (hasAllBindingFiles) {
    const artifacts = {};
    for (const [key, label, file] of fileEntries) {
      artifacts[key] = readJsonArtifact(file, label, ARTIFACT_DIRS[key]);
    }
    if (Object.values(artifacts).every(Boolean)) {
      validateBinding(artifacts, args);
      releaseId = artifacts.releaseProvenance.releaseId;
    }
  } else if (args.requirePass) {
    failures.push("production launch binding artifacts are required when pass evidence is required");
  }

  if (failures.length > 0) {
    console.error("Production launch binding verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Production launch binding verification passed.");
  if (hasAllBindingFiles) {
    console.log(`- releaseId=${releaseId}`);
    console.log("- binding=verified");
    console.log(
      hasAllHashes(args) ? "- artifactHashes=verified" : "- artifactHashes=skipped",
    );
  } else {
    console.log("- binding=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    bindingDocs: "docs/deploy/production-launch-binding.md",
    bindingWorkflow: "docs/deploy/production-launch-binding.yml.example",
    bindingTest: "scripts/verify-production-launch-binding.test.mjs",
    launchRunbook: "docs/deploy/production-launch-runbook.md",
    productionReadiness: "docs/deploy/production-readiness.md",
    productionLaunchVerifier: "scripts/verify-production-launch.mjs",
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
    "verify:production-launch-binding",
    "verify:production-launch-binding:safe",
    "scripts/verify-production-launch-binding.mjs",
  ]);
  mustContainAll("binding docs", content.bindingDocs, [
    "PR54 Production Launch Binding Gate",
    "npm run verify:production-launch-binding",
    "npm run verify:production-launch-binding:safe",
    "releaseId",
    "change ticket",
    "artifact SHA-256",
    "does not call the API",
    "does not read GitHub secrets",
  ]);
  mustContainAll("binding workflow", content.bindingWorkflow, [
    "permissions:",
    "contents: read",
    "node-version: 24",
    "npm run verify:production-release-provenance:safe",
    "npm run verify:production-release-evidence:safe",
    "npm run verify:production-change-approval:safe",
    "npm run verify:launch-manifest:safe",
    "npm run verify:production-launch-binding",
    "npm run verify:production-launch-binding:safe",
    "SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_FILE",
    "SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_FILE",
    "SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_FILE",
    "SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_FILE",
  ]);
  mustNotContainAny("binding workflow unsafe", content.bindingWorkflow, [
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
  mustContainAll("binding tests", content.bindingTest, [
    "production launch binding verifier accepts matching sanitized artifacts from safe env mode",
    "production launch binding verifier rejects cross-artifact release or ticket mismatch",
    "production launch binding verifier rejects staging target or expired approval window",
    "production launch binding verifier rejects artifact hash mismatch without echoing values",
    "assertNoSecretMarkers",
  ]);
  mustContainAll("launch runbook references binding", content.launchRunbook, [
    "npm run verify:production-launch-binding",
    "npm run verify:production-launch-binding:safe",
    "docs/deploy/production-launch-binding.md",
    "SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_FILE",
  ]);
  mustContainAll("readiness references binding", content.productionReadiness, [
    "PR54 Production Launch Binding Gate",
    "npm run verify:production-launch-binding",
    "npm run verify:production-launch-binding:safe",
  ]);
  mustContainAll("launch verifier references binding", content.productionLaunchVerifier, [
    "verify:production-launch-binding",
    "production-launch-binding.md",
    "production-launch-binding.yml.example",
  ]);
  mustContainAll("task plan references PR54", content.taskPlan, [
    "PR54 - Production Launch Binding Gate",
    "verify:production-launch-binding",
    "production-launch-binding.yml.example",
  ]);
  mustContainAll("progress references PR54", content.progress, [
    "Started PR54 production launch binding gate",
    "verify:production-launch-binding",
  ]);
  mustContainAll("gitignore launch manifest artifacts", content.gitignore, [
    "launch-manifest-artifacts/",
  ]);
}

function validateBinding(artifacts, args) {
  if (args.requirePass && !hasAllHashes(args)) {
    failures.push("all production launch binding artifact hashes are required");
  }

  validateExpectedHash(
    "releaseProvenance",
    args.releaseProvenance,
    args.releaseProvenanceSha256,
  );
  validateExpectedHash(
    "productionReleaseEvidence",
    args.productionReleaseEvidence,
    args.productionReleaseEvidenceSha256,
  );
  validateExpectedHash(
    "productionChangeApproval",
    args.productionChangeApproval,
    args.productionChangeApprovalSha256,
  );
  validateExpectedHash("launchManifest", args.launchManifest, args.launchManifestSha256);

  validateMinimalArtifactShape(artifacts);
  validateNoSensitiveFields(artifacts);

  const releaseIds = [
    artifacts.releaseProvenance.releaseId,
    artifacts.productionReleaseEvidence.releaseId,
    artifacts.productionReleaseEvidence.releaseProvenance?.releaseId,
    artifacts.productionChangeApproval.releaseId,
    artifacts.launchManifest.releaseId,
  ].filter(Boolean);
  if (new Set(releaseIds).size !== 1 || releaseIds.length !== 5) {
    failures.push("releaseId binding mismatch");
  }

  const provenanceSource = artifacts.releaseProvenance.source ?? {};
  const evidenceSource = artifacts.productionReleaseEvidence.source ?? {};
  if (!hasValue(provenanceSource.branch)) {
    failures.push("release provenance source branch is required");
  }
  if (!hasValue(evidenceSource.branch)) {
    failures.push("production release evidence source branch is required");
  }
  if (hasValue(provenanceSource.branch) && hasValue(evidenceSource.branch) && provenanceSource.branch !== evidenceSource.branch) {
    failures.push("source branch binding mismatch");
  }
  if (!hasValue(provenanceSource.commitSha)) {
    failures.push("release provenance source commit is required");
  }
  if (!hasValue(evidenceSource.commitSha)) {
    failures.push("production release evidence source commit is required");
  }
  if (hasValue(provenanceSource.commitSha) && hasValue(evidenceSource.commitSha) && provenanceSource.commitSha !== evidenceSource.commitSha) {
    failures.push("source commit binding mismatch");
  }

  const provenancePromotion = artifacts.releaseProvenance.promotion ?? {};
  const approval = artifacts.productionChangeApproval.approvals ?? {};
  if (!hasValue(provenancePromotion.changeTicket) || !hasValue(approval.changeTicket)) {
    failures.push("change ticket is required");
  } else if (provenancePromotion.changeTicket !== approval.changeTicket) {
    failures.push("change ticket binding mismatch");
  }

  if (args.requirePass) {
    if (provenancePromotion.targetEnvironment !== "production") {
      failures.push("promotion.targetEnvironment must be production");
    }
    if (provenancePromotion.approval !== "approved") {
      failures.push("promotion.approval must be approved");
    }
    if (approval.approvalStatus !== "approved") {
      failures.push("approvals.approvalStatus must be approved");
    }
  }

  const changeWindow = artifacts.productionChangeApproval.changeWindow ?? {};
  if (args.requirePass && changeWindow.targetEnvironment !== "production") {
    failures.push("changeWindow.targetEnvironment must be production");
  }
  if (isIsoTimestamp(changeWindow.windowStart) && isIsoTimestamp(changeWindow.windowEnd)) {
    if (Date.parse(changeWindow.windowEnd) <= Date.parse(changeWindow.windowStart)) {
      failures.push("change approval window end must be after start");
    }
    if (args.requirePass && Date.parse(changeWindow.windowEnd) <= Date.now()) {
      failures.push("change approval window must not be expired");
    }
  } else {
    failures.push("change approval window timestamps must be ISO timestamps");
  }

  validateManifestBinding(
    artifacts.productionReleaseEvidence.launchManifest,
    artifacts.launchManifest,
    args,
  );
  validateArtifactNameBinding(artifacts, args);
}

function validateMinimalArtifactShape(artifacts) {
  const expectedSchemas = {
    releaseProvenance: "smart-cs-agent.release-provenance.v1",
    productionReleaseEvidence: "smart-cs-agent.production-release-evidence.v1",
    productionChangeApproval: "smart-cs-agent.production-change-approval.v1",
    launchManifest: "smart-cs-agent.launch-manifest.v1",
  };
  for (const [key, schemaVersion] of Object.entries(expectedSchemas)) {
    if (!isRecord(artifacts[key])) {
      failures.push(`${key} must be an object`);
      continue;
    }
    if (artifacts[key].schemaVersion !== schemaVersion) {
      failures.push(`${key}.schemaVersion mismatch`);
    }
    if (!isSafeReleaseId(artifacts[key].releaseId)) {
      failures.push(`${key}.releaseId must be a safe release identifier`);
    }
  }
}

function validateManifestBinding(releaseManifestSummary, manifest, args) {
  if (!isRecord(releaseManifestSummary)) {
    failures.push("productionReleaseEvidence.launchManifest must be an object");
    return;
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    failures.push("launchManifest.entries must be a non-empty array");
    return;
  }

  const channelCount = new Set(manifest.entries.map((entry) => entry.channel)).size;
  if (releaseManifestSummary.entryCount !== manifest.entries.length) {
    failures.push("launch manifest entry count binding mismatch");
  }
  if (releaseManifestSummary.channelCount !== channelCount) {
    failures.push("launch manifest channel count binding mismatch");
  }

  const requirements = manifest.requirements ?? {};
  for (const key of ["requirePass", "requireProviderReadonly", "requireRealChannel"]) {
    if (typeof requirements[key] !== "boolean") {
      failures.push(`launchManifest.requirements.${key} must be a boolean`);
    }
  }
  if (args.requirePass && requirements.requirePass !== true) {
    failures.push("launchManifest.requirements.requirePass must be true");
  }
  if (releaseManifestSummary.requireRealChannel !== requirements.requireRealChannel) {
    failures.push("real-channel requirement binding mismatch");
  }
  if (
    releaseManifestSummary.requireProviderReadonly !==
    requirements.requireProviderReadonly
  ) {
    failures.push("provider-readonly requirement binding mismatch");
  }
  if (!isSha256Hex(releaseManifestSummary.scopeHash)) {
    failures.push("launchManifest.scopeHash must be a sha256 hex value");
  } else if (releaseManifestSummary.scopeHash.toLowerCase() !== manifestScopeHash(manifest)) {
    failures.push("launch manifest scope binding mismatch");
  }
}

function validateArtifactNameBinding(artifacts, args) {
  const releaseEvidenceArtifacts =
    artifacts.productionReleaseEvidence.evidenceArtifacts ?? {};
  const changeApprovalArtifacts =
    artifacts.productionChangeApproval.evidenceArtifacts ?? {};

  if (
    releaseEvidenceArtifacts.releaseProvenanceBundle !==
    basename(args.releaseProvenance)
  ) {
    failures.push("release provenance artifact binding mismatch");
  }
  if (releaseEvidenceArtifacts.launchManifestBundle !== basename(args.launchManifest)) {
    failures.push("launch manifest artifact binding mismatch");
  }
  if (
    changeApprovalArtifacts.changeApprovalBundle !==
    basename(args.productionChangeApproval)
  ) {
    failures.push("change approval artifact binding mismatch");
  }
  if (
    changeApprovalArtifacts.releaseEvidenceBundle !==
    basename(args.productionReleaseEvidence)
  ) {
    failures.push("release evidence artifact binding mismatch");
  }
}

function validateExpectedHash(label, file, expected) {
  if (!hasValue(expected)) {
    return;
  }
  if (!/^[a-fA-F0-9]{64}$/.test(expected)) {
    failures.push(`${label} hash must be a sha256 hex value`);
    return;
  }
  const actual = sha256(readFileSync(file, "utf8"));
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    failures.push(`${label} hash mismatch`);
  }
}

function readJsonArtifact(file, label, artifactDir) {
  if (!existsSync(file)) {
    failures.push(`${label} file does not exist`);
    return undefined;
  }
  const linkStats = lstatSync(file);
  if (linkStats.isSymbolicLink()) {
    failures.push(`${label} path must not be a symbolic link`);
    return undefined;
  }
  const realPath = realpathSync(file);
  if (!isPathInside(artifactDir, realPath)) {
    failures.push(`${label} real path must stay inside its artifact directory`);
    return undefined;
  }
  const stats = statSync(file);
  if (!stats.isFile()) {
    failures.push(`${label} path must point to a file`);
    return undefined;
  }
  if (stats.size > MAX_ARTIFACT_BYTES) {
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
        failures.push("forbidden sensitive production launch binding field");
      }
      walkForSensitiveValues(nested);
    }
    return;
  }
  if (typeof value === "string" && hasForbiddenValue(value)) {
    failures.push("forbidden sensitive production launch binding value");
  }
}

function isForbiddenFieldName(key) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return FORBIDDEN_FIELD_NAMES.has(normalized);
}

function hasForbiddenValue(value) {
  return FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function parseArgs(values) {
  const parsed = {
    releaseProvenance: undefined,
    productionReleaseEvidence: undefined,
    productionChangeApproval: undefined,
    launchManifest: undefined,
    releaseProvenanceSha256: undefined,
    productionReleaseEvidenceSha256: undefined,
    productionChangeApprovalSha256: undefined,
    launchManifestSha256: undefined,
    fromEnv: false,
    requirePass: false,
  };

  for (const value of values) {
    if (value === "--from-env") {
      parsed.fromEnv = true;
    } else if (value === "--require-pass") {
      parsed.requirePass = true;
    } else if (value.startsWith("--release-provenance=")) {
      parsed.releaseProvenance = readSafeArtifactPath(
        value.slice("--release-provenance=".length),
        "releaseProvenance",
        "--release-provenance",
      );
    } else if (value.startsWith("--release-evidence=")) {
      parsed.productionReleaseEvidence = readSafeArtifactPath(
        value.slice("--release-evidence=".length),
        "productionReleaseEvidence",
        "--release-evidence",
      );
    } else if (value.startsWith("--change-approval=")) {
      parsed.productionChangeApproval = readSafeArtifactPath(
        value.slice("--change-approval=".length),
        "productionChangeApproval",
        "--change-approval",
      );
    } else if (value.startsWith("--launch-manifest=")) {
      parsed.launchManifest = readSafeArtifactPath(
        value.slice("--launch-manifest=".length),
        "launchManifest",
        "--launch-manifest",
      );
    } else if (value.startsWith("--release-provenance-sha256=")) {
      parsed.releaseProvenanceSha256 = value.slice(
        "--release-provenance-sha256=".length,
      );
    } else if (value.startsWith("--release-evidence-sha256=")) {
      parsed.productionReleaseEvidenceSha256 = value.slice(
        "--release-evidence-sha256=".length,
      );
    } else if (value.startsWith("--change-approval-sha256=")) {
      parsed.productionChangeApprovalSha256 = value.slice(
        "--change-approval-sha256=".length,
      );
    } else if (value.startsWith("--launch-manifest-sha256=")) {
      parsed.launchManifestSha256 = value.slice(
        "--launch-manifest-sha256=".length,
      );
    } else {
      failures.push(`Unknown argument: ${redactArgument(value)}`);
    }
  }

  return parsed;
}

function applySafeEnvDefaults(parsed, input) {
  if (!parsed.fromEnv) return parsed;

  return {
    ...parsed,
    releaseProvenance:
      parsed.releaseProvenance ??
      readSafeEnvPath(
        input.SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_FILE,
        "releaseProvenance",
        "SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_FILE",
      ),
    productionReleaseEvidence:
      parsed.productionReleaseEvidence ??
      readSafeEnvPath(
        input.SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_FILE,
        "productionReleaseEvidence",
        "SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_FILE",
      ),
    productionChangeApproval:
      parsed.productionChangeApproval ??
      readSafeEnvPath(
        input.SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_FILE,
        "productionChangeApproval",
        "SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_FILE",
      ),
    launchManifest:
      parsed.launchManifest ??
      readSafeEnvPath(
        input.SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_FILE,
        "launchManifest",
        "SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_FILE",
      ),
    releaseProvenanceSha256:
      parsed.releaseProvenanceSha256 ??
      input.SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_SHA256,
    productionReleaseEvidenceSha256:
      parsed.productionReleaseEvidenceSha256 ??
      input.SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_SHA256,
    productionChangeApprovalSha256:
      parsed.productionChangeApprovalSha256 ??
      input.SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_SHA256,
    launchManifestSha256:
      parsed.launchManifestSha256 ??
      input.SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_SHA256,
    requirePass:
      parsed.requirePass ||
      readBoolean(
        input.SMARTCS_PRODUCTION_LAUNCH_BINDING_REQUIRE_PASS,
        "SMARTCS_PRODUCTION_LAUNCH_BINDING_REQUIRE_PASS",
      ),
  };
}

function readSafeEnvPath(value, key, label) {
  if (!hasValue(value)) return undefined;
  return readSafeArtifactPath(value, key, label);
}

function readSafeArtifactPath(value, key, label) {
  if (
    hasValue(value) &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) &&
    !/[^/\s\\]+:[^/\s\\]+@/.test(value) &&
    !/^\\\\/.test(value)
  ) {
    const resolved = resolve(repoRoot, value);
    if (isPathInside(ARTIFACT_DIRS[key], resolved)) {
      return resolved;
    }
    failures.push(`${label} must be inside ${basename(ARTIFACT_DIRS[key])}`);
    return undefined;
  }
  failures.push(`${label} must be a safe local path`);
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

function hasAllHashes(args) {
  return [
    args.releaseProvenanceSha256,
    args.productionReleaseEvidenceSha256,
    args.productionChangeApprovalSha256,
    args.launchManifestSha256,
  ].every(hasValue);
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function manifestScopeHash(manifest) {
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const normalized = entries
    .map((entry) => ({
      tenantFingerprint: entry?.tenantFingerprint,
      channel: entry?.channel,
      evidenceFile: entry?.evidenceFile,
    }))
    .sort((a, b) =>
      `${a.tenantFingerprint}:${a.channel}:${a.evidenceFile}`.localeCompare(
        `${b.tenantFingerprint}:${b.channel}:${b.evidenceFile}`,
      ),
    );
  return sha256(JSON.stringify(normalized));
}

function isSafeReleaseId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._-]{3,80}$/.test(value);
}

function isSha256Hex(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);
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
