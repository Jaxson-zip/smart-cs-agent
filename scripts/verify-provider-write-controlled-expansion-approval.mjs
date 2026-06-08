import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const COMMAND_NAME = "verify:provider-write-controlled-expansion-approval";
const MAX_APPROVAL_BYTES = 256 * 1024;
const APPROVAL_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-controlled-expansion-approval-artifacts",
);
const ASSEMBLY_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-safe-ledger-assembly-artifacts",
);
const ASSEMBLY_DRAFT_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-live-pilot-run-ledger-draft-artifacts",
);
const ASSEMBLY_REVIEW_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-manual-closeout-review-artifacts",
);
const ASSEMBLY_LEDGER_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-live-pilot-run-ledger-artifacts",
);

const ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "expansionScope",
  "approval",
  "prerequisiteEvidence",
  "operationalControls",
  "commercialReadiness",
  "safety",
]);
const TARGET_KEYS = new Set([
  "rolloutIdFingerprint",
  "fromRolloutTrack",
  "toRolloutTrack",
  "changeTicket",
]);
const EXPANSION_SCOPE_KEYS = new Set([
  "merchantFingerprints",
  "channels",
  "allowedActions",
  "maxMerchants",
  "maxDailyProviderWrites",
  "maxDailyProviderWritesPerMerchant",
  "maxCouponAmountCents",
  "businessHoursOnly",
]);
const APPROVAL_KEYS = new Set([
  "approvalStatus",
  "requestedByFingerprint",
  "approvedByFingerprint",
  "secondReviewerFingerprint",
  "approvedAt",
]);
const PREREQUISITE_KEYS = new Set([
  "providerWriteSafeLedgerAssemblyVerifierPassed",
  "providerWriteSafeLedgerAssemblySha256",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "productionBranchProtectionVerifierPassed",
  "productionAlertingVerifierPassed",
  "productionCanaryVerifierPassed",
]);
const OPERATIONAL_CONTROL_KEYS = new Set([
  "operatorCoverageMinutes",
  "namedOpsLeadFingerprint",
  "incidentOwnerFingerprint",
  "rollbackOwnerFingerprint",
  "killSwitchOwnerFingerprint",
  "rollbackPlaybookReviewed",
  "alertRoutesReviewed",
  "rateLimitReviewed",
  "noAutomaticCustomerVisibleReplies",
]);
const COMMERCIAL_READINESS_KEYS = new Set([
  "customerContractReviewed",
  "billingPlanConfigured",
  "supportSlaReviewed",
  "merchantNotificationPlanReviewed",
]);
const SAFETY_KEYS = new Set([
  "secretsInEvidence",
  "rawTenantIdsInEvidence",
  "rawMerchantIdsInEvidence",
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
const ASSEMBLY_ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "verificationPassed",
  "target",
  "artifactBindings",
  "safety",
]);
const ASSEMBLY_TARGET_KEYS = new Set([
  "tenantFingerprint",
  "channel",
  "rolloutTrack",
  "changeTicketFingerprint",
]);
const ASSEMBLY_ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteLivePilotRunLedgerDraftSha256",
  "providerWriteManualCloseoutReviewSha256",
  "providerWriteLivePilotRunLedgerSha256",
]);
const ASSEMBLY_SAFETY_KEYS = new Set([
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
const DRAFT_SOURCE_SAFETY_KEYS = new Set([
  "secretsInDraft",
  "rawTenantIdsInDraft",
  "customerDataInDraft",
  "providerPayloadsInDraft",
  "providerResponsesInDraft",
  "rawIdempotencyKeysInDraft",
  "networkExecutedByExporter",
  "providerWriteExecutedByExporter",
  "payloadEscrowOpenedByExporter",
  "credentialsReadByExporter",
  "customerVisibleActionsSentByExporter",
]);
const REVIEW_SOURCE_SAFETY_KEYS = new Set([
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
const LEDGER_SOURCE_SAFETY_KEYS = new Set([
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
  "merchantid",
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
const SAFE_CHANGE_TICKET_PATTERN = /^[A-Za-z0-9._-]{3,100}$/;
const PLACEHOLDER_SHA256_VALUES = new Set([
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "deadbeef".repeat(8),
  "0123456789abcdef".repeat(4),
  "abcdef0123456789".repeat(4),
]);

function main() {
  const args = applySafeEnvDefaults(parseArgs(process.argv.slice(2)), process.env);
  const content = readStaticContent();
  verifyStaticArtifacts(content);
  verifyStaticSafety();

  let approval = null;
  let assemblyEvidence = null;
  let assemblyDraftSource = null;
  let assemblyReviewSource = null;
  let assemblyLedgerSource = null;
  if (hasValue(args.approval)) {
    const approvalEvidence = readJsonFile(args.approval);
    if (approvalEvidence) {
      approval = approvalEvidence.value;
      validateApproval(approval);
    }
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion approval evidence is required when pass evidence is required");
  }
  if (hasValue(args.assembly)) {
    assemblyEvidence = readJsonFile(
      args.assembly,
      "provider write safe ledger assembly",
      ASSEMBLY_ARTIFACT_DIR,
      "--assembly",
      "provider-write-safe-ledger-assembly-artifacts",
    );
    if (assemblyEvidence) validateAssemblyReceipt(assemblyEvidence.value);
  } else if (args.requirePass) {
    failures.push("provider write safe ledger assembly evidence is required when pass evidence is required");
  }
  if (hasValue(args.assemblyDraft)) {
    assemblyDraftSource = readJsonFile(
      args.assemblyDraft,
      "provider write safe ledger assembly draft source",
      ASSEMBLY_DRAFT_ARTIFACT_DIR,
      "--assembly-draft",
      "provider-write-live-pilot-run-ledger-draft-artifacts",
    );
    if (assemblyDraftSource) validateAssemblyDraftSource(assemblyDraftSource.value);
  } else if (args.requirePass) {
    failures.push("provider write safe ledger assembly draft source evidence is required when pass evidence is required");
  }
  if (hasValue(args.assemblyReview)) {
    assemblyReviewSource = readJsonFile(
      args.assemblyReview,
      "provider write safe ledger assembly manual closeout review source",
      ASSEMBLY_REVIEW_ARTIFACT_DIR,
      "--assembly-review",
      "provider-write-manual-closeout-review-artifacts",
    );
    if (assemblyReviewSource) validateAssemblyReviewSource(assemblyReviewSource.value);
  } else if (args.requirePass) {
    failures.push("provider write safe ledger assembly manual closeout review source evidence is required when pass evidence is required");
  }
  if (hasValue(args.assemblyLedger)) {
    assemblyLedgerSource = readJsonFile(
      args.assemblyLedger,
      "provider write safe ledger assembly final ledger source",
      ASSEMBLY_LEDGER_ARTIFACT_DIR,
      "--assembly-ledger",
      "provider-write-live-pilot-run-ledger-artifacts",
    );
    if (assemblyLedgerSource) validateAssemblyLedgerSource(assemblyLedgerSource.value);
  } else if (args.requirePass) {
    failures.push("provider write safe ledger assembly final ledger source evidence is required when pass evidence is required");
  }
  if (approval && assemblyEvidence) {
    validateAssemblyBinding(approval, assemblyEvidence.sha256);
  }
  if (
    assemblyEvidence &&
    assemblyDraftSource &&
    assemblyReviewSource &&
    assemblyLedgerSource
  ) {
    validateAssemblySourceBindings(
      assemblyEvidence.value,
      assemblyDraftSource,
      assemblyReviewSource,
      assemblyLedgerSource,
    );
  }

  if (failures.length > 0) {
    console.error("Provider write controlled expansion approval verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write controlled expansion approval verification passed.");
  if (approval) {
    console.log(`- rollout=${approval.target.toRolloutTrack}`);
    console.log(`- merchants=${approval.expansionScope.merchantFingerprints.length}`);
    console.log("- approval=verified");
  } else {
    console.log("- approval=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    gitignore: ".gitignore",
    expansionDocs: "docs/deploy/provider-write-controlled-expansion-approval.md",
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
    COMMAND_NAME,
    "verify:provider-write-controlled-expansion-approval:safe",
    "\"verify:provider-write-controlled-expansion-approval:safe\": \"node scripts/verify-provider-write-controlled-expansion-approval.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-controlled-expansion-approval.mjs",
  ]);

  mustContainAll("provider write controlled expansion approval docs", content.expansionDocs, [
    "PR73 Provider Write Controlled Expansion Approval Gate",
    "npm run verify:provider-write-controlled-expansion-approval",
    "npm run verify:provider-write-controlled-expansion-approval:safe",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_DRAFT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_REQUIRE_PASS=true",
    "smart-cs-agent.provider-write-controlled-expansion-approval.v1",
    "smart-cs-agent.provider-write-safe-ledger-assembly.v1",
    "provider-write-controlled-expansion-approval-artifacts/",
    "provider-write-safe-ledger-assembly-artifacts/",
    "provider-write-live-pilot-run-ledger-draft-artifacts/",
    "provider-write-manual-closeout-review-artifacts/",
    "provider-write-live-pilot-run-ledger-artifacts/",
    "single_merchant_pilot",
    "controlled_multi_merchant",
    "providerWriteSafeLedgerAssemblyVerifierPassed=true",
    "providerWriteSafeLedgerAssemblySha256",
    "providerWriteLivePilotRunLedgerDraftSha256",
    "providerWriteManualCloseoutReviewSha256",
    "providerWriteLivePilotRunLedgerSha256",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not read production databases",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR73 Provider Write Controlled Expansion Approval Gate",
    "verify:provider-write-controlled-expansion-approval",
    "controlled_multi_merchant",
    "providerWriteSafeLedgerAssemblySha256",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR73 Provider Write Controlled Expansion Approval Gate",
    "verify:provider-write-controlled-expansion-approval",
    "controlled_multi_merchant",
    "providerWriteSafeLedgerAssemblyVerifierPassed=true",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "PR73 Provider Write Controlled Expansion Approval Gate",
    "npm run verify:provider-write-controlled-expansion-approval",
    "npm run verify:provider-write-controlled-expansion-approval:safe",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_DRAFT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-controlled-expansion-approval.test.mjs",
    "npm run verify:provider-write-controlled-expansion-approval",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-controlled-expansion-approval.test.mjs",
    "npm run verify:provider-write-controlled-expansion-approval",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "providerWriteControlledExpansionApproval",
    "verify:provider-write-controlled-expansion-approval",
    "provider write controlled expansion approval",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_DRAFT_FILE",
  ]);

  mustContainAll("task plan references PR73", content.taskPlan, [
    "PR73 - Provider Write Controlled Expansion Approval Gate",
    "verify:provider-write-controlled-expansion-approval",
  ]);

  mustContainAll("progress references PR73", content.progress, [
    "Started PR73 provider write controlled expansion approval gate",
  ]);

  mustContainAll("gitignore controlled expansion artifacts", content.gitignore, [
    "provider-write-controlled-expansion-approval-artifacts/",
    "provider-write-safe-ledger-assembly-artifacts/",
  ]);
}

function validateApproval(value) {
  if (!isRecord(value)) {
    failures.push("provider write controlled expansion approval root must be an object");
    return;
  }
  validateAllowedKeys(value, ROOT_KEYS, "provider write controlled expansion approval contains unsupported field");
  if (value.schemaVersion !== "smart-cs-agent.provider-write-controlled-expansion-approval.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-controlled-expansion-approval.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("generatedAt must be an ISO timestamp");
  validateTarget(value.target);
  validateExpansionScope(value.expansionScope);
  validateApprovalBlock(value.approval);
  validatePrerequisiteEvidence(value.prerequisiteEvidence);
  validateOperationalControls(value.operationalControls);
  validateAllTrueObject(value.commercialReadiness, COMMERCIAL_READINESS_KEYS, "commercialReadiness");
  validateAllFalseObject(value.safety, SAFETY_KEYS, "safety");
  validateNoSensitiveFields(value);
}

function validateTarget(value) {
  if (!isRecord(value)) {
    failures.push("target must be an object");
    return;
  }
  validateAllowedKeys(value, TARGET_KEYS, "target contains unsupported field");
  validateFingerprint("target.rolloutIdFingerprint", value.rolloutIdFingerprint);
  if (value.fromRolloutTrack !== "single_merchant_pilot") {
    failures.push("target.fromRolloutTrack must be single_merchant_pilot");
  }
  if (value.toRolloutTrack !== "controlled_multi_merchant") {
    failures.push("target.toRolloutTrack must be controlled_multi_merchant");
  }
  if (
    typeof value.changeTicket !== "string" ||
    !SAFE_CHANGE_TICKET_PATTERN.test(value.changeTicket)
  ) {
    failures.push("target.changeTicket must be a safe change ticket id");
  }
}

function validateExpansionScope(value) {
  if (!isRecord(value)) {
    failures.push("expansionScope must be an object");
    return;
  }
  validateAllowedKeys(value, EXPANSION_SCOPE_KEYS, "expansionScope contains unsupported field");
  validateFingerprintArray(
    "expansionScope.merchantFingerprints",
    value.merchantFingerprints,
    2,
    10,
  );
  validateEnumArray("expansionScope.channels", value.channels, CHANNELS, 1, 2);
  validateEnumArray(
    "expansionScope.allowedActions",
    value.allowedActions,
    FIRST_PILOT_ACTIONS,
    1,
    3,
  );
  validateIntegerInRange("expansionScope.maxMerchants", value.maxMerchants, 2, 10);
  validateIntegerInRange(
    "expansionScope.maxDailyProviderWritesPerMerchant",
    value.maxDailyProviderWritesPerMerchant,
    1,
    20,
  );
  validateIntegerInRange("expansionScope.maxDailyProviderWrites", value.maxDailyProviderWrites, 1, 100);
  if (
    Number.isInteger(value.maxDailyProviderWritesPerMerchant) &&
    Number.isInteger(value.maxMerchants) &&
    Number.isInteger(value.maxDailyProviderWrites) &&
    value.maxDailyProviderWrites >
      value.maxDailyProviderWritesPerMerchant * value.maxMerchants
  ) {
    failures.push("expansionScope.maxDailyProviderWrites must not exceed per-merchant limit times maxMerchants");
  }
  validateIntegerInRange("expansionScope.maxCouponAmountCents", value.maxCouponAmountCents, 0, 10000);
  if (value.businessHoursOnly !== true) failures.push("expansionScope.businessHoursOnly must be true");
}

function validateApprovalBlock(value) {
  if (!isRecord(value)) {
    failures.push("approval must be an object");
    return;
  }
  validateAllowedKeys(value, APPROVAL_KEYS, "approval contains unsupported field");
  if (value.approvalStatus !== "approved") {
    failures.push("approval.approvalStatus must be approved");
  }
  for (const key of [
    "requestedByFingerprint",
    "approvedByFingerprint",
    "secondReviewerFingerprint",
  ]) {
    validateFingerprint(`approval.${key}`, value[key]);
  }
  if (
    new Set([
      value.requestedByFingerprint,
      value.approvedByFingerprint,
      value.secondReviewerFingerprint,
    ]).size !== 3
  ) {
    failures.push("approval reviewers must be distinct and separate from requester");
  }
  if (!isIsoTimestamp(value.approvedAt)) failures.push("approval.approvedAt must be an ISO timestamp");
}

function validatePrerequisiteEvidence(value) {
  if (!isRecord(value)) {
    failures.push("prerequisiteEvidence must be an object");
    return;
  }
  validateAllowedKeys(value, PREREQUISITE_KEYS, "prerequisiteEvidence contains unsupported field");
  for (const key of PREREQUISITE_KEYS) {
    if (key === "providerWriteSafeLedgerAssemblySha256") continue;
    if (value[key] !== true) failures.push(`prerequisiteEvidence.${key} must be true`);
  }
  validateSha256(
    "prerequisiteEvidence.providerWriteSafeLedgerAssemblySha256",
    value.providerWriteSafeLedgerAssemblySha256,
  );
}

function validateOperationalControls(value) {
  if (!isRecord(value)) {
    failures.push("operationalControls must be an object");
    return;
  }
  validateAllowedKeys(value, OPERATIONAL_CONTROL_KEYS, "operationalControls contains unsupported field");
  validateIntegerInRange("operationalControls.operatorCoverageMinutes", value.operatorCoverageMinutes, 120, 1440);
  for (const key of [
    "namedOpsLeadFingerprint",
    "incidentOwnerFingerprint",
    "rollbackOwnerFingerprint",
    "killSwitchOwnerFingerprint",
  ]) {
    validateFingerprint(`operationalControls.${key}`, value[key]);
  }
  if (
    new Set([
      value.namedOpsLeadFingerprint,
      value.incidentOwnerFingerprint,
      value.rollbackOwnerFingerprint,
      value.killSwitchOwnerFingerprint,
    ]).size !== 4
  ) {
    failures.push("operationalControls owners must be distinct");
  }
  for (const key of [
    "rollbackPlaybookReviewed",
    "alertRoutesReviewed",
    "rateLimitReviewed",
    "noAutomaticCustomerVisibleReplies",
  ]) {
    if (value[key] !== true) failures.push(`operationalControls.${key} must be true`);
  }
}

function validateAssemblyReceipt(value) {
  if (!isRecord(value)) {
    failures.push("provider write safe ledger assembly evidence root must be an object");
    return;
  }
  validateAllowedKeys(value, ASSEMBLY_ROOT_KEYS, "provider write safe ledger assembly evidence contains unsupported field");
  if (value.schemaVersion !== "smart-cs-agent.provider-write-safe-ledger-assembly.v1") {
    failures.push("assembly.schemaVersion must be smart-cs-agent.provider-write-safe-ledger-assembly.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("assembly.generatedAt must be an ISO timestamp");
  if (value.verificationPassed !== true) failures.push("assembly.verificationPassed must be true");
  validateAssemblyTarget(value.target);
  validateArtifactBindings(value.artifactBindings, ASSEMBLY_ARTIFACT_BINDING_KEYS, "assembly.artifactBindings");
  validateAllFalseObject(value.safety, ASSEMBLY_SAFETY_KEYS, "assembly.safety");
  validateNoSensitiveFields(value);
}

function validateAssemblyTarget(value) {
  if (!isRecord(value)) {
    failures.push("assembly.target must be an object");
    return;
  }
  validateAllowedKeys(value, ASSEMBLY_TARGET_KEYS, "assembly.target contains unsupported field");
  validateFingerprint("assembly.target.tenantFingerprint", value.tenantFingerprint);
  if (!CHANNELS.has(value.channel)) failures.push("assembly.target.channel must be taobao or douyin");
  if (value.rolloutTrack !== "single_merchant_pilot") {
    failures.push("assembly.target.rolloutTrack must be single_merchant_pilot");
  }
  validateFingerprint("assembly.target.changeTicketFingerprint", value.changeTicketFingerprint);
}

function validateAssemblyBinding(approval, assemblySha256) {
  const boundSha256 =
    approval?.prerequisiteEvidence?.providerWriteSafeLedgerAssemblySha256;
  if (boundSha256 !== assemblySha256) {
    failures.push("prerequisiteEvidence.providerWriteSafeLedgerAssemblySha256 must match the safe ledger assembly file sha256");
  }
}

function validateAssemblyDraftSource(value) {
  if (!isRecord(value)) {
    failures.push("provider write safe ledger assembly draft source root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1") {
    failures.push("draft source.schemaVersion must be smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1");
  }
  validateAssemblySourceTarget(value.target, "draft source.target", true);
  if (value.summary?.readyForSafeLedger !== false) {
    failures.push("draft source.summary.readyForSafeLedger must be false");
  }
  if (value.evidenceReadiness?.draftOnly !== true) {
    failures.push("draft source.evidenceReadiness.draftOnly must be true");
  }
  if (value.evidenceReadiness?.canPassPr69SafeLedger !== false) {
    failures.push("draft source.evidenceReadiness.canPassPr69SafeLedger must be false");
  }
  validateAllFalseObject(value.safety, DRAFT_SOURCE_SAFETY_KEYS, "draft source.safety");
  validateNoSensitiveFields(value);
}

function validateAssemblyReviewSource(value) {
  if (!isRecord(value)) {
    failures.push("provider write safe ledger assembly manual closeout review source root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-manual-closeout-review.v1") {
    failures.push("review source.schemaVersion must be smart-cs-agent.provider-write-manual-closeout-review.v1");
  }
  validateAssemblySourceTarget(value.target, "review source.target", false);
  if (value.closeout?.decision !== "approved_for_safe_ledger") {
    failures.push("review source.closeout.decision must be approved_for_safe_ledger");
  }
  validateSha256(
    "review source.artifactBindings.providerWriteLivePilotRunLedgerDraftSha256",
    value.artifactBindings?.providerWriteLivePilotRunLedgerDraftSha256,
  );
  validateSha256(
    "review source.artifactBindings.auditExportSha256",
    value.artifactBindings?.auditExportSha256,
  );
  validateSha256(
    "review source.artifactBindings.productionLaunchSha256",
    value.artifactBindings?.productionLaunchSha256,
  );
  validateAllFalseObject(value.safety, REVIEW_SOURCE_SAFETY_KEYS, "review source.safety");
  validateNoSensitiveFields(value);
}

function validateAssemblyLedgerSource(value) {
  if (!isRecord(value)) {
    failures.push("provider write safe ledger assembly final ledger source root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-live-pilot-run-ledger.v1") {
    failures.push("ledger source.schemaVersion must be smart-cs-agent.provider-write-live-pilot-run-ledger.v1");
  }
  validateAssemblySourceTarget(value.target, "ledger source.target", false);
  if (value.summary?.noAutoCustomerReplies !== true) {
    failures.push("ledger source.summary.noAutoCustomerReplies must be true");
  }
  if (value.evidence?.providerWriteManualCloseoutReviewVerifierPassed !== true) {
    failures.push("ledger source.evidence.providerWriteManualCloseoutReviewVerifierPassed must be true");
  }
  validateSha256(
    "ledger source.artifactBindings.providerWriteManualCloseoutReviewSha256",
    value.artifactBindings?.providerWriteManualCloseoutReviewSha256,
  );
  validateSha256(
    "ledger source.artifactBindings.auditExportSha256",
    value.artifactBindings?.auditExportSha256,
  );
  validateSha256(
    "ledger source.artifactBindings.productionLaunchSha256",
    value.artifactBindings?.productionLaunchSha256,
  );
  validateAllFalseObject(value.safety, LEDGER_SOURCE_SAFETY_KEYS, "ledger source.safety");
  validateNoSensitiveFields(value);
}

function validateAssemblySourceTarget(value, label, draftShape) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateFingerprint(`${label}.tenantFingerprint`, value.tenantFingerprint);
  if (!CHANNELS.has(value.channel)) failures.push(`${label}.channel must be taobao or douyin`);
  if (value.rolloutTrack !== "single_merchant_pilot") {
    failures.push(`${label}.rolloutTrack must be single_merchant_pilot`);
  }
  if (draftShape) {
    validateFingerprint(`${label}.changeTicketFingerprint`, value.changeTicketFingerprint);
  } else if (
    typeof value.changeTicket !== "string" ||
    !SAFE_CHANGE_TICKET_PATTERN.test(value.changeTicket)
  ) {
    failures.push(`${label}.changeTicket must be a safe change ticket id`);
  }
}

function validateAssemblySourceBindings(
  assembly,
  draftSource,
  reviewSource,
  ledgerSource,
) {
  if (!isRecord(assembly)) return;
  const bindings = assembly.artifactBindings ?? {};

  if (bindings.providerWriteLivePilotRunLedgerDraftSha256 !== draftSource.sha256) {
    failures.push("assembly.artifactBindings.providerWriteLivePilotRunLedgerDraftSha256 must match the draft source file sha256");
  }
  if (bindings.providerWriteManualCloseoutReviewSha256 !== reviewSource.sha256) {
    failures.push("assembly.artifactBindings.providerWriteManualCloseoutReviewSha256 must match the manual closeout review source file sha256");
  }
  if (bindings.providerWriteLivePilotRunLedgerSha256 !== ledgerSource.sha256) {
    failures.push("assembly.artifactBindings.providerWriteLivePilotRunLedgerSha256 must match the final ledger source file sha256");
  }

  if (
    reviewSource.value?.artifactBindings?.providerWriteLivePilotRunLedgerDraftSha256 !==
    draftSource.sha256
  ) {
    failures.push("review source.artifactBindings.providerWriteLivePilotRunLedgerDraftSha256 must match the draft source file sha256");
  }
  if (
    ledgerSource.value?.artifactBindings?.providerWriteManualCloseoutReviewSha256 !==
    reviewSource.sha256
  ) {
    failures.push("ledger source.artifactBindings.providerWriteManualCloseoutReviewSha256 must match the manual closeout review source file sha256");
  }
  if (
    reviewSource.value?.artifactBindings?.auditExportSha256 !==
    ledgerSource.value?.artifactBindings?.auditExportSha256
  ) {
    failures.push("review and ledger source auditExportSha256 must match");
  }
  if (
    reviewSource.value?.artifactBindings?.productionLaunchSha256 !==
    ledgerSource.value?.artifactBindings?.productionLaunchSha256
  ) {
    failures.push("review and ledger source productionLaunchSha256 must match");
  }

  compareAssemblyTargetWithSource(assembly.target, draftSource.value?.target, "draft source.target");
  compareAssemblyTargetWithSource(assembly.target, reviewSource.value?.target, "review source.target");
  compareAssemblyTargetWithSource(assembly.target, ledgerSource.value?.target, "ledger source.target");
}

function compareAssemblyTargetWithSource(assemblyTarget, sourceTarget, label) {
  if (!isRecord(assemblyTarget) || !isRecord(sourceTarget)) return;
  for (const key of ["tenantFingerprint", "channel", "rolloutTrack"]) {
    if (assemblyTarget[key] !== sourceTarget[key]) {
      failures.push(`assembly.target.${key} must match ${label}.${key}`);
    }
  }
  if (
    sourceTarget.changeTicketFingerprint &&
    assemblyTarget.changeTicketFingerprint !== sourceTarget.changeTicketFingerprint
  ) {
    failures.push("assembly.target.changeTicketFingerprint must match draft source.target.changeTicketFingerprint");
  }
}

function readJsonFile(
  filePath,
  label = "provider write controlled expansion approval",
  artifactDir = APPROVAL_ARTIFACT_DIR,
  argName = "--approval",
  artifactDirName = "provider-write-controlled-expansion-approval-artifacts",
) {
  const resolvedPath = resolveArtifactPath(filePath, argName, artifactDir, artifactDirName);
  if (!resolvedPath) return null;
  if (!existsSync(resolvedPath)) {
    failures.push(`${label} file does not exist`);
    return null;
  }
  if (lstatSync(resolvedPath).isSymbolicLink()) {
    failures.push(`${label} file must not be a symlink`);
    return null;
  }
  const stats = statSync(resolvedPath);
  if (!stats.isFile()) {
    failures.push(`${label} path must point to a file`);
    return null;
  }
  if (stats.size > MAX_APPROVAL_BYTES) {
    failures.push(`${label} file is too large`);
    return null;
  }
  const bytes = readFileSync(resolvedPath);
  try {
    return {
      value: JSON.parse(stripBom(bytes.toString("utf8"))),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch {
    failures.push(`${label} file must be valid JSON`);
    return null;
  }
}

function resolveArtifactPath(filePath, argName, artifactDir, artifactDirName) {
  if (
    typeof filePath !== "string" ||
    filePath.trim() === "" ||
    /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(filePath) ||
    /[^/\s\\]+:[^/\s\\]+@/.test(filePath) ||
    /^\\\\/.test(filePath)
  ) {
    failures.push(`${argName} must be a safe local path`);
    return null;
  }
  const candidate = isAbsolute(filePath)
    ? resolve(filePath)
    : resolve(repoRoot, filePath);
  if (!isPathInside(repoRoot, candidate)) {
    failures.push(`${argName} must stay inside repository`);
    return null;
  }
  if (!isPathInside(artifactDir, candidate)) {
    failures.push(`${argName} must be inside ${artifactDirName}`);
    return null;
  }
  if (existsSync(artifactDir) && lstatSync(artifactDir).isSymbolicLink()) {
    failures.push(`${artifactDirName} must not be a symlink`);
    return null;
  }
  if (existsSync(candidate)) {
    const realCandidate = realpathSync(candidate);
    const realArtifactDir = existsSync(artifactDir)
      ? realpathSync(artifactDir)
      : artifactDir;
    if (!isPathInside(realArtifactDir, realCandidate)) {
      failures.push(`${argName} must resolve inside ${artifactDirName}`);
      return null;
    }
  }
  return candidate;
}

function parseArgs(argv) {
  const args = {
    approval: undefined,
    assembly: undefined,
    assemblyDraft: undefined,
    assemblyReview: undefined,
    assemblyLedger: undefined,
    fromEnv: false,
    requirePass: false,
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
    if (arg.startsWith("--approval=")) {
      args.approval = arg.slice("--approval=".length);
      continue;
    }
    if (arg.startsWith("--assembly=")) {
      args.assembly = arg.slice("--assembly=".length);
      continue;
    }
    if (arg.startsWith("--assembly-draft=")) {
      args.assemblyDraft = arg.slice("--assembly-draft=".length);
      continue;
    }
    if (arg.startsWith("--assembly-review=")) {
      args.assemblyReview = arg.slice("--assembly-review=".length);
      continue;
    }
    if (arg.startsWith("--assembly-ledger=")) {
      args.assemblyLedger = arg.slice("--assembly-ledger=".length);
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
    approval:
      args.approval ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_FILE,
    assembly:
      args.assembly ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_FILE,
    assemblyDraft:
      args.assemblyDraft ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_DRAFT_FILE,
    assemblyReview:
      args.assemblyReview ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_REVIEW_FILE,
    assemblyLedger:
      args.assemblyLedger ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_LEDGER_FILE,
    requirePass:
      args.requirePass ||
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_REQUIRE_PASS === "true",
  };
}

function verifyStaticSafety() {
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const forbiddenTokens = [
    "node:" + "http",
    "node:" + "https",
    "node:" + "net",
    "node:" + "tls",
    "child" + "_process",
    "ax" + "ios",
    "go" + "t(",
    "un" + "dici",
    "Prisma" + "Client",
    "provider" + "Adapter",
    "credential" + "Resolver",
    "loadProvider" + "Credential",
    "payloadEscrow" + "OpenedByVerifier: true",
    ".send" + "Message(",
    ".change" + "Address(",
    ".issue" + "Coupon(",
    "fetch" + "(",
  ];
  for (const token of forbiddenTokens) {
    if (source.includes(token)) {
      failures.push("verifier source must not import or call provider, network, database, credential, escrow, or customer reply code");
    }
  }
}

function validateAllTrueObject(value, allowedKeys, label) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, allowedKeys, `${label} contains unsupported field`);
  for (const key of allowedKeys) {
    if (value[key] !== true) failures.push(`${label}.${key} must be true`);
  }
}

function validateAllFalseObject(value, allowedKeys, label) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, allowedKeys, `${label} contains unsupported field`);
  for (const key of allowedKeys) {
    if (value[key] !== false) failures.push(`${label}.${key} must be false`);
  }
}

function validateArtifactBindings(value, allowedKeys, label) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, allowedKeys, `${label} contains unsupported field`);
  const hashes = [];
  for (const key of allowedKeys) {
    validateSha256(`${label}.${key}`, value[key]);
    hashes.push(value[key]);
  }
  if (new Set(hashes).size !== hashes.length) {
    failures.push(`${label} values must be distinct`);
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

function mustContainAll(label, haystack, needles) {
  for (const needle of needles) {
    if (!haystack.includes(needle)) {
      failures.push(`${label}: missing ${needle}`);
    }
  }
}

function validateFingerprintArray(label, value, min, max) {
  if (!Array.isArray(value)) {
    failures.push(`${label} must be an array`);
    return;
  }
  if (value.length < min || value.length > max) {
    failures.push(`${label} must contain between ${min} and ${max} values`);
  }
  if (new Set(value).size !== value.length) failures.push(`${label} must be unique`);
  for (const item of value) validateFingerprint(label, item);
}

function validateEnumArray(label, value, allowed, min, max) {
  if (!Array.isArray(value)) {
    failures.push(`${label} must be an array`);
    return;
  }
  if (value.length < min || value.length > max) {
    failures.push(`${label} must contain between ${min} and ${max} values`);
  }
  if (new Set(value).size !== value.length) failures.push(`${label} must be unique`);
  for (const item of value) {
    if (!allowed.has(item)) failures.push(`${label} contains unsupported value`);
  }
}

function validateNoSensitiveFields(value) {
  visit(value, (key, item) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_FIELD_NAMES.has(normalizedKey)) {
      failures.push("forbidden sensitive provider write controlled expansion approval field");
    }
    if (typeof item === "string" && isForbiddenValue(item)) {
      failures.push("forbidden sensitive provider write controlled expansion approval value");
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
    if (!allowedKeys.has(key)) failures.push(message);
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
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value) || isPlaceholderSha256(value)) {
    failures.push(`${label} must be a non-placeholder sha256 hash`);
  }
}

function isPlaceholderSha256(value) {
  return (
    /^(.)\1{63}$/.test(value) ||
    PLACEHOLDER_SHA256_VALUES.has(value) ||
    new Set(value).size < 8
  );
}

function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function isPathInside(parent, child) {
  const relativePath = relative(parent, child);
  return (
    relativePath === "" ||
    (relativePath.length > 0 &&
      !relativePath.startsWith("..") &&
      !isAbsolute(relativePath))
  );
}

function redactArg(value) {
  if (typeof value !== "string") return "<redacted>";
  const [name] = value.split("=", 1);
  return name.startsWith("--") ? `${name}=<redacted>` : "<redacted>";
}

main();
