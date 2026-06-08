import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const COMMAND_NAME = "verify:provider-write-controlled-expansion-preflight";
const MAX_EVIDENCE_BYTES = 256 * 1024;
const PREFLIGHT_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-controlled-expansion-preflight-artifacts",
);
const APPROVAL_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-controlled-expansion-approval-artifacts",
);
const APPROVAL_ASSEMBLY_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-safe-ledger-assembly-artifacts",
);
const APPROVAL_ASSEMBLY_DRAFT_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-live-pilot-run-ledger-draft-artifacts",
);
const APPROVAL_ASSEMBLY_REVIEW_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-manual-closeout-review-artifacts",
);
const APPROVAL_ASSEMBLY_LEDGER_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-live-pilot-run-ledger-artifacts",
);

const PREFLIGHT_ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "expansionScope",
  "launchWindow",
  "prerequisiteEvidence",
  "rolloutPlan",
  "operationalControls",
  "safety",
]);
const PREFLIGHT_TARGET_KEYS = new Set([
  "rolloutIdFingerprint",
  "rolloutTrack",
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
const LAUNCH_WINDOW_KEYS = new Set([
  "startsAt",
  "endsAt",
  "durationMinutes",
  "freezeWindowActive",
  "businessHoursOnly",
]);
const PREREQUISITE_KEYS = new Set([
  "providerWriteControlledExpansionApprovalVerifierPassed",
  "providerWriteControlledExpansionApprovalSha256",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "productionBranchProtectionVerifierPassed",
  "productionAlertingVerifierPassed",
  "productionCanaryVerifierPassed",
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "providerWriteLiveExecutorControlPlaneVerifierPassed",
  "providerWritePayloadEscrowBoundaryVerifierPassed",
  "providerWriteExecutionAttemptVisibilityVerifierPassed",
]);
const ROLLOUT_PLAN_KEYS = new Set([
  "waveCount",
  "maxMerchantsPerWave",
  "holdMinutesBetweenWaves",
  "automaticNextWaveEnabled",
  "rollbackOnAnyFailedMutation",
  "stopOnCustomerComplaint",
]);
const OPERATIONAL_CONTROL_KEYS = new Set([
  "operatorCoverageMinutes",
  "namedOpsLeadFingerprint",
  "incidentOwnerFingerprint",
  "rollbackOwnerFingerprint",
  "killSwitchOwnerFingerprint",
  "billingOwnerFingerprint",
  "merchantNotificationPlanReady",
  "supportEscalationReady",
  "rollbackPlaybookReviewed",
  "alertRoutesReviewed",
  "rateLimitReviewed",
  "noAutomaticCustomerVisibleReplies",
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
const APPROVAL_ROOT_KEYS = new Set([
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
const APPROVAL_TARGET_KEYS = new Set([
  "rolloutIdFingerprint",
  "fromRolloutTrack",
  "toRolloutTrack",
  "changeTicket",
]);
const APPROVAL_KEYS = new Set([
  "approvalStatus",
  "requestedByFingerprint",
  "approvedByFingerprint",
  "secondReviewerFingerprint",
  "approvedAt",
]);
const APPROVAL_PREREQUISITE_KEYS = new Set([
  "providerWriteSafeLedgerAssemblyVerifierPassed",
  "providerWriteSafeLedgerAssemblySha256",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "productionBranchProtectionVerifierPassed",
  "productionAlertingVerifierPassed",
  "productionCanaryVerifierPassed",
]);
const APPROVAL_OPERATIONAL_CONTROL_KEYS = new Set([
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
const APPROVAL_COMMERCIAL_READINESS_KEYS = new Set([
  "customerContractReviewed",
  "billingPlanConfigured",
  "supportSlaReviewed",
  "merchantNotificationPlanReviewed",
]);
const APPROVAL_ASSEMBLY_ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "verificationPassed",
  "target",
  "artifactBindings",
  "safety",
]);
const APPROVAL_ASSEMBLY_TARGET_KEYS = new Set([
  "tenantFingerprint",
  "channel",
  "rolloutTrack",
  "changeTicketFingerprint",
]);
const APPROVAL_ASSEMBLY_ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteLivePilotRunLedgerDraftSha256",
  "providerWriteManualCloseoutReviewSha256",
  "providerWriteLivePilotRunLedgerSha256",
]);
const APPROVAL_ASSEMBLY_SAFETY_KEYS = new Set([
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
const APPROVAL_DRAFT_SOURCE_SAFETY_KEYS = new Set([
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
const APPROVAL_REVIEW_SOURCE_SAFETY_KEYS = new Set([
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
const APPROVAL_LEDGER_SOURCE_SAFETY_KEYS = new Set([
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
const CONTROLLED_EXPANSION_ACTIONS = new Set([
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

  let preflight = null;
  let approval = null;
  let approvalAssembly = null;
  let approvalAssemblyDraft = null;
  let approvalAssemblyReview = null;
  let approvalAssemblyLedger = null;

  if (hasValue(args.preflight)) {
    const preflightEvidence = readJsonFile(
      args.preflight,
      "provider write controlled expansion preflight",
      PREFLIGHT_ARTIFACT_DIR,
      "--preflight",
      "provider-write-controlled-expansion-preflight-artifacts",
    );
    if (preflightEvidence) {
      preflight = preflightEvidence.value;
      validatePreflight(preflight);
    }
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion preflight evidence is required when pass evidence is required");
  }

  if (hasValue(args.approval)) {
    const approvalEvidence = readJsonFile(
      args.approval,
      "provider write controlled expansion approval",
      APPROVAL_ARTIFACT_DIR,
      "--approval",
      "provider-write-controlled-expansion-approval-artifacts",
    );
    if (approvalEvidence) {
      approval = approvalEvidence;
      validateApproval(approval.value);
    }
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion approval evidence is required when pass evidence is required");
  }

  if (hasValue(args.approvalAssembly)) {
    approvalAssembly = readJsonFile(
      args.approvalAssembly,
      "provider write controlled expansion approval safe ledger assembly",
      APPROVAL_ASSEMBLY_ARTIFACT_DIR,
      "--approval-assembly",
      "provider-write-safe-ledger-assembly-artifacts",
    );
    if (approvalAssembly) validateApprovalAssemblyReceipt(approvalAssembly.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion approval safe ledger assembly evidence is required when pass evidence is required");
  }

  if (hasValue(args.approvalAssemblyDraft)) {
    approvalAssemblyDraft = readJsonFile(
      args.approvalAssemblyDraft,
      "provider write controlled expansion approval draft source",
      APPROVAL_ASSEMBLY_DRAFT_ARTIFACT_DIR,
      "--approval-assembly-draft",
      "provider-write-live-pilot-run-ledger-draft-artifacts",
    );
    if (approvalAssemblyDraft) validateApprovalAssemblyDraftSource(approvalAssemblyDraft.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion approval draft source evidence is required when pass evidence is required");
  }

  if (hasValue(args.approvalAssemblyReview)) {
    approvalAssemblyReview = readJsonFile(
      args.approvalAssemblyReview,
      "provider write controlled expansion approval manual closeout review source",
      APPROVAL_ASSEMBLY_REVIEW_ARTIFACT_DIR,
      "--approval-assembly-review",
      "provider-write-manual-closeout-review-artifacts",
    );
    if (approvalAssemblyReview) validateApprovalAssemblyReviewSource(approvalAssemblyReview.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion approval manual closeout review source evidence is required when pass evidence is required");
  }

  if (hasValue(args.approvalAssemblyLedger)) {
    approvalAssemblyLedger = readJsonFile(
      args.approvalAssemblyLedger,
      "provider write controlled expansion approval final ledger source",
      APPROVAL_ASSEMBLY_LEDGER_ARTIFACT_DIR,
      "--approval-assembly-ledger",
      "provider-write-live-pilot-run-ledger-artifacts",
    );
    if (approvalAssemblyLedger) validateApprovalAssemblyLedgerSource(approvalAssemblyLedger.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion approval final ledger source evidence is required when pass evidence is required");
  }

  if (preflight && approval) {
    validateApprovalBinding(preflight, approval);
    validatePreflightWithinApproval(preflight, approval.value);
  }
  if (approval && approvalAssembly) {
    validateApprovalSafeLedgerAssemblyBinding(approval.value, approvalAssembly.sha256);
  }
  if (
    approvalAssembly &&
    approvalAssemblyDraft &&
    approvalAssemblyReview &&
    approvalAssemblyLedger
  ) {
    validateApprovalAssemblySourceBindings(
      approvalAssembly.value,
      approvalAssemblyDraft,
      approvalAssemblyReview,
      approvalAssemblyLedger,
    );
  }

  if (failures.length > 0) {
    console.error("Provider write controlled expansion preflight verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write controlled expansion preflight verification passed.");
  if (preflight) {
    console.log(`- rollout=${preflight.target.rolloutTrack}`);
    console.log(`- merchants=${preflight.expansionScope.merchantFingerprints.length}`);
    console.log("- preflight=verified");
  } else {
    console.log("- preflight=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    gitignore: ".gitignore",
    preflightDocs: "docs/deploy/provider-write-controlled-expansion-preflight.md",
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
    "verify:provider-write-controlled-expansion-preflight:safe",
    "\"verify:provider-write-controlled-expansion-preflight:safe\": \"node scripts/verify-provider-write-controlled-expansion-preflight.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-controlled-expansion-preflight.mjs",
  ]);

  mustContainAll("provider write controlled expansion preflight docs", content.preflightDocs, [
    "PR74 Provider Write Controlled Expansion Preflight Gate",
    "npm run verify:provider-write-controlled-expansion-preflight",
    "npm run verify:provider-write-controlled-expansion-preflight:safe",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_REQUIRE_PASS=true",
    "smart-cs-agent.provider-write-controlled-expansion-preflight.v1",
    "smart-cs-agent.provider-write-controlled-expansion-approval.v1",
    "smart-cs-agent.provider-write-safe-ledger-assembly.v1",
    "provider-write-controlled-expansion-preflight-artifacts/",
    "provider-write-controlled-expansion-approval-artifacts/",
    "provider-write-safe-ledger-assembly-artifacts/",
    "provider-write-live-pilot-run-ledger-draft-artifacts/",
    "provider-write-manual-closeout-review-artifacts/",
    "provider-write-live-pilot-run-ledger-artifacts/",
    "controlled_multi_merchant",
    "providerWriteControlledExpansionApprovalVerifierPassed=true",
    "providerWriteControlledExpansionApprovalSha256",
    "providerWriteSafeLedgerAssemblyVerifierPassed=true",
    "providerWriteSafeLedgerAssemblySha256",
    "freezeWindowActive=true",
    "automaticNextWaveEnabled=false",
    "rollbackOnAnyFailedMutation=true",
    "noAutomaticCustomerVisibleReplies=true",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not read production databases",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR74 Provider Write Controlled Expansion Preflight Gate",
    "verify:provider-write-controlled-expansion-preflight",
    "smart-cs-agent.provider-write-controlled-expansion-preflight.v1",
    "controlled_multi_merchant",
    "providerWriteControlledExpansionApprovalSha256",
    "providerWriteSafeLedgerAssemblySha256",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR74 Provider Write Controlled Expansion Preflight Gate",
    "verify:provider-write-controlled-expansion-preflight",
    "providerWriteControlledExpansionApprovalVerifierPassed=true",
    "providerWriteControlledExpansionApprovalSha256",
    "providerWriteSafeLedgerAssemblyVerifierPassed=true",
    "providerWriteSafeLedgerAssemblySha256",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "PR74 Provider Write Controlled Expansion Preflight Gate",
    "npm run verify:provider-write-controlled-expansion-preflight",
    "npm run verify:provider-write-controlled-expansion-preflight:safe",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-controlled-expansion-preflight.test.mjs",
    "npm run verify:provider-write-controlled-expansion-preflight",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-controlled-expansion-preflight.test.mjs",
    "npm run verify:provider-write-controlled-expansion-preflight",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "providerWriteControlledExpansionPreflight",
    "verify-provider-write-controlled-expansion-preflight.mjs",
    "verify:provider-write-controlled-expansion-preflight",
    "provider write controlled expansion preflight",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE",
  ]);

  mustContainAll("task plan references PR74", content.taskPlan, [
    "PR74 - Provider Write Controlled Expansion Preflight Gate",
    "verify:provider-write-controlled-expansion-preflight",
  ]);

  mustContainAll("progress references PR74", content.progress, [
    "Started PR74 provider write controlled expansion preflight gate",
  ]);

  mustContainAll("gitignore controlled expansion preflight artifacts", content.gitignore, [
    "provider-write-controlled-expansion-preflight-artifacts/",
  ]);
}

function validatePreflight(value) {
  if (!isRecord(value)) {
    failures.push("provider write controlled expansion preflight root must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    PREFLIGHT_ROOT_KEYS,
    "provider write controlled expansion preflight contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-controlled-expansion-preflight.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-controlled-expansion-preflight.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("generatedAt must be an ISO timestamp");

  validatePreflightTarget(value.target);
  validateExpansionScope(value.expansionScope, "expansionScope", 1, 10);
  validateLaunchWindow(value.launchWindow);
  validatePrerequisiteEvidence(value.prerequisiteEvidence);
  validateRolloutPlan(value.rolloutPlan, value.expansionScope);
  validateOperationalControls(value.operationalControls);
  validateAllFalseObject(value.safety, SAFETY_KEYS, "safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write controlled expansion preflight field",
    "forbidden sensitive provider write controlled expansion preflight value",
  );
}

function validatePreflightTarget(value) {
  if (!isRecord(value)) {
    failures.push("target must be an object");
    return;
  }
  validateAllowedKeys(value, PREFLIGHT_TARGET_KEYS, "target contains unsupported field");
  validateFingerprint("target.rolloutIdFingerprint", value.rolloutIdFingerprint);
  if (value.rolloutTrack !== "controlled_multi_merchant") {
    failures.push("target.rolloutTrack must be controlled_multi_merchant");
  }
  if (
    typeof value.changeTicket !== "string" ||
    !SAFE_CHANGE_TICKET_PATTERN.test(value.changeTicket)
  ) {
    failures.push("target.changeTicket must be a safe change ticket id");
  }
}

function validateExpansionScope(value, label, minMerchants, maxMerchants) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, EXPANSION_SCOPE_KEYS, `${label} contains unsupported field`);
  validateFingerprintArray(`${label}.merchantFingerprints`, value.merchantFingerprints, minMerchants, maxMerchants);
  validateEnumArray(`${label}.channels`, value.channels, CHANNELS, 1, 2);
  validateEnumArray(`${label}.allowedActions`, value.allowedActions, CONTROLLED_EXPANSION_ACTIONS, 1, 3);
  validateIntegerInRange(`${label}.maxMerchants`, value.maxMerchants, minMerchants, maxMerchants);
  validateIntegerInRange(`${label}.maxDailyProviderWrites`, value.maxDailyProviderWrites, 1, 100);
  validateIntegerInRange(`${label}.maxDailyProviderWritesPerMerchant`, value.maxDailyProviderWritesPerMerchant, 1, 20);
  validateIntegerInRange(`${label}.maxCouponAmountCents`, value.maxCouponAmountCents, 0, 10000);
  if (Array.isArray(value.merchantFingerprints) && Number.isInteger(value.maxMerchants)) {
    if (value.merchantFingerprints.length > value.maxMerchants) {
      failures.push(`${label}.merchantFingerprints must not exceed maxMerchants`);
    }
  }
  if (
    Number.isInteger(value.maxDailyProviderWrites) &&
    Number.isInteger(value.maxDailyProviderWritesPerMerchant) &&
    Number.isInteger(value.maxMerchants) &&
    value.maxDailyProviderWrites >
      value.maxDailyProviderWritesPerMerchant * value.maxMerchants
  ) {
    failures.push(`${label}.maxDailyProviderWrites must not exceed per-merchant limit times maxMerchants`);
  }
  if (value.businessHoursOnly !== true) failures.push(`${label}.businessHoursOnly must be true`);
}

function validateLaunchWindow(value) {
  if (!isRecord(value)) {
    failures.push("launchWindow must be an object");
    return;
  }
  validateAllowedKeys(value, LAUNCH_WINDOW_KEYS, "launchWindow contains unsupported field");
  if (!isIsoTimestamp(value.startsAt)) failures.push("launchWindow.startsAt must be an ISO timestamp");
  if (!isIsoTimestamp(value.endsAt)) failures.push("launchWindow.endsAt must be an ISO timestamp");
  if (
    isIsoTimestamp(value.startsAt) &&
    isIsoTimestamp(value.endsAt) &&
    Date.parse(value.startsAt) >= Date.parse(value.endsAt)
  ) {
    failures.push("launchWindow.startsAt must be before launchWindow.endsAt");
  }
  validateIntegerInRange("launchWindow.durationMinutes", value.durationMinutes, 30, 240);
  if (value.freezeWindowActive !== true) failures.push("launchWindow.freezeWindowActive must be true");
  if (value.businessHoursOnly !== true) failures.push("launchWindow.businessHoursOnly must be true");
}

function validatePrerequisiteEvidence(value) {
  if (!isRecord(value)) {
    failures.push("prerequisiteEvidence must be an object");
    return;
  }
  validateAllowedKeys(value, PREREQUISITE_KEYS, "prerequisiteEvidence contains unsupported field");
  for (const key of PREREQUISITE_KEYS) {
    if (key === "providerWriteControlledExpansionApprovalSha256") continue;
    if (value[key] !== true) failures.push(`prerequisiteEvidence.${key} must be true`);
  }
  validateSha256(
    "prerequisiteEvidence.providerWriteControlledExpansionApprovalSha256",
    value.providerWriteControlledExpansionApprovalSha256,
  );
}

function validateRolloutPlan(value, expansionScope) {
  if (!isRecord(value)) {
    failures.push("rolloutPlan must be an object");
    return;
  }
  validateAllowedKeys(value, ROLLOUT_PLAN_KEYS, "rolloutPlan contains unsupported field");
  validateIntegerInRange("rolloutPlan.waveCount", value.waveCount, 1, 3);
  validateIntegerInRange("rolloutPlan.maxMerchantsPerWave", value.maxMerchantsPerWave, 1, 10);
  validateIntegerInRange("rolloutPlan.holdMinutesBetweenWaves", value.holdMinutesBetweenWaves, 30, 1440);
  if (value.automaticNextWaveEnabled !== false) {
    failures.push("rolloutPlan.automaticNextWaveEnabled must be false");
  }
  if (value.rollbackOnAnyFailedMutation !== true) {
    failures.push("rolloutPlan.rollbackOnAnyFailedMutation must be true");
  }
  if (value.stopOnCustomerComplaint !== true) {
    failures.push("rolloutPlan.stopOnCustomerComplaint must be true");
  }
  if (
    isRecord(expansionScope) &&
    Number.isInteger(expansionScope.maxMerchants) &&
    Number.isInteger(value.maxMerchantsPerWave) &&
    value.maxMerchantsPerWave > expansionScope.maxMerchants
  ) {
    failures.push("rolloutPlan.maxMerchantsPerWave must not exceed expansionScope.maxMerchants");
  }
}

function validateOperationalControls(value) {
  if (!isRecord(value)) {
    failures.push("operationalControls must be an object");
    return;
  }
  validateAllowedKeys(value, OPERATIONAL_CONTROL_KEYS, "operationalControls contains unsupported field");
  validateIntegerInRange("operationalControls.operatorCoverageMinutes", value.operatorCoverageMinutes, 180, 1440);
  const ownerKeys = [
    "namedOpsLeadFingerprint",
    "incidentOwnerFingerprint",
    "rollbackOwnerFingerprint",
    "killSwitchOwnerFingerprint",
    "billingOwnerFingerprint",
  ];
  for (const key of ownerKeys) validateFingerprint(`operationalControls.${key}`, value[key]);
  if (new Set(ownerKeys.map((key) => value[key])).size !== ownerKeys.length) {
    failures.push("operationalControls owners must be distinct");
  }
  for (const key of [
    "merchantNotificationPlanReady",
    "supportEscalationReady",
    "rollbackPlaybookReviewed",
    "alertRoutesReviewed",
    "rateLimitReviewed",
    "noAutomaticCustomerVisibleReplies",
  ]) {
    if (value[key] !== true) failures.push(`operationalControls.${key} must be true`);
  }
}

function validateApproval(value) {
  if (!isRecord(value)) {
    failures.push("provider write controlled expansion approval root must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_ROOT_KEYS,
    "provider write controlled expansion approval contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-controlled-expansion-approval.v1") {
    failures.push("approval.schemaVersion must be smart-cs-agent.provider-write-controlled-expansion-approval.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("approval.generatedAt must be an ISO timestamp");
  validateApprovalTarget(value.target);
  validateExpansionScope(value.expansionScope, "approval.expansionScope", 2, 10);
  validateApprovalBlock(value.approval);
  validateApprovalPrerequisiteEvidence(value.prerequisiteEvidence);
  validateApprovalOperationalControls(value.operationalControls);
  validateAllTrueObject(
    value.commercialReadiness,
    APPROVAL_COMMERCIAL_READINESS_KEYS,
    "approval.commercialReadiness",
  );
  validateAllFalseObject(value.safety, SAFETY_KEYS, "approval.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write controlled expansion approval field",
    "forbidden sensitive provider write controlled expansion approval value",
  );
}

function validateApprovalTarget(value) {
  if (!isRecord(value)) {
    failures.push("approval.target must be an object");
    return;
  }
  validateAllowedKeys(value, APPROVAL_TARGET_KEYS, "approval.target contains unsupported field");
  validateFingerprint("approval.target.rolloutIdFingerprint", value.rolloutIdFingerprint);
  if (value.fromRolloutTrack !== "single_merchant_pilot") {
    failures.push("approval.target.fromRolloutTrack must be single_merchant_pilot");
  }
  if (value.toRolloutTrack !== "controlled_multi_merchant") {
    failures.push("approval.target.toRolloutTrack must be controlled_multi_merchant");
  }
  if (
    typeof value.changeTicket !== "string" ||
    !SAFE_CHANGE_TICKET_PATTERN.test(value.changeTicket)
  ) {
    failures.push("approval.target.changeTicket must be a safe change ticket id");
  }
}

function validateApprovalBlock(value) {
  if (!isRecord(value)) {
    failures.push("approval.approval must be an object");
    return;
  }
  validateAllowedKeys(value, APPROVAL_KEYS, "approval.approval contains unsupported field");
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

function validateApprovalPrerequisiteEvidence(value) {
  if (!isRecord(value)) {
    failures.push("approval.prerequisiteEvidence must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_PREREQUISITE_KEYS,
    "approval.prerequisiteEvidence contains unsupported field",
  );
  for (const key of APPROVAL_PREREQUISITE_KEYS) {
    if (key === "providerWriteSafeLedgerAssemblySha256") continue;
    if (value[key] !== true) failures.push(`approval.prerequisiteEvidence.${key} must be true`);
  }
  validateSha256(
    "approval.prerequisiteEvidence.providerWriteSafeLedgerAssemblySha256",
    value.providerWriteSafeLedgerAssemblySha256,
  );
}

function validateApprovalOperationalControls(value) {
  if (!isRecord(value)) {
    failures.push("approval.operationalControls must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_OPERATIONAL_CONTROL_KEYS,
    "approval.operationalControls contains unsupported field",
  );
  validateIntegerInRange(
    "approval.operationalControls.operatorCoverageMinutes",
    value.operatorCoverageMinutes,
    120,
    1440,
  );
  const ownerKeys = [
    "namedOpsLeadFingerprint",
    "incidentOwnerFingerprint",
    "rollbackOwnerFingerprint",
    "killSwitchOwnerFingerprint",
  ];
  for (const key of ownerKeys) {
    validateFingerprint(`approval.operationalControls.${key}`, value[key]);
  }
  if (new Set(ownerKeys.map((key) => value[key])).size !== ownerKeys.length) {
    failures.push("approval.operationalControls owners must be distinct");
  }
  for (const key of [
    "rollbackPlaybookReviewed",
    "alertRoutesReviewed",
    "rateLimitReviewed",
    "noAutomaticCustomerVisibleReplies",
  ]) {
    if (value[key] !== true) failures.push(`approval.operationalControls.${key} must be true`);
  }
}

function validateApprovalAssemblyReceipt(value) {
  if (!isRecord(value)) {
    failures.push("approval safe ledger assembly root must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_ASSEMBLY_ROOT_KEYS,
    "approval safe ledger assembly contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-safe-ledger-assembly.v1") {
    failures.push("approval assembly.schemaVersion must be smart-cs-agent.provider-write-safe-ledger-assembly.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("approval assembly.generatedAt must be an ISO timestamp");
  if (value.verificationPassed !== true) failures.push("approval assembly.verificationPassed must be true");
  validateApprovalAssemblyTarget(value.target);
  validateArtifactBindings(
    value.artifactBindings,
    APPROVAL_ASSEMBLY_ARTIFACT_BINDING_KEYS,
    "approval assembly.artifactBindings",
  );
  validateAllFalseObject(value.safety, APPROVAL_ASSEMBLY_SAFETY_KEYS, "approval assembly.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write controlled expansion approval field",
    "forbidden sensitive provider write controlled expansion approval value",
  );
}

function validateApprovalAssemblyTarget(value) {
  if (!isRecord(value)) {
    failures.push("approval assembly.target must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_ASSEMBLY_TARGET_KEYS,
    "approval assembly.target contains unsupported field",
  );
  validateFingerprint("approval assembly.target.tenantFingerprint", value.tenantFingerprint);
  if (!CHANNELS.has(value.channel)) failures.push("approval assembly.target.channel must be taobao or douyin");
  if (value.rolloutTrack !== "single_merchant_pilot") {
    failures.push("approval assembly.target.rolloutTrack must be single_merchant_pilot");
  }
  validateFingerprint("approval assembly.target.changeTicketFingerprint", value.changeTicketFingerprint);
}

function validateApprovalAssemblyDraftSource(value) {
  if (!isRecord(value)) {
    failures.push("approval draft source root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1") {
    failures.push("approval draft source.schemaVersion must be smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1");
  }
  validateApprovalAssemblySourceTarget(value.target, "approval draft source.target", true);
  if (value.summary?.readyForSafeLedger !== false) {
    failures.push("approval draft source.summary.readyForSafeLedger must be false");
  }
  if (value.evidenceReadiness?.draftOnly !== true) {
    failures.push("approval draft source.evidenceReadiness.draftOnly must be true");
  }
  if (value.evidenceReadiness?.canPassPr69SafeLedger !== false) {
    failures.push("approval draft source.evidenceReadiness.canPassPr69SafeLedger must be false");
  }
  validateAllFalseObject(value.safety, APPROVAL_DRAFT_SOURCE_SAFETY_KEYS, "approval draft source.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write controlled expansion approval field",
    "forbidden sensitive provider write controlled expansion approval value",
  );
}

function validateApprovalAssemblyReviewSource(value) {
  if (!isRecord(value)) {
    failures.push("approval review source root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-manual-closeout-review.v1") {
    failures.push("approval review source.schemaVersion must be smart-cs-agent.provider-write-manual-closeout-review.v1");
  }
  validateApprovalAssemblySourceTarget(value.target, "approval review source.target", false);
  if (value.closeout?.decision !== "approved_for_safe_ledger") {
    failures.push("approval review source.closeout.decision must be approved_for_safe_ledger");
  }
  validateSha256(
    "approval review source.artifactBindings.providerWriteLivePilotRunLedgerDraftSha256",
    value.artifactBindings?.providerWriteLivePilotRunLedgerDraftSha256,
  );
  validateSha256(
    "approval review source.artifactBindings.auditExportSha256",
    value.artifactBindings?.auditExportSha256,
  );
  validateSha256(
    "approval review source.artifactBindings.productionLaunchSha256",
    value.artifactBindings?.productionLaunchSha256,
  );
  validateAllFalseObject(value.safety, APPROVAL_REVIEW_SOURCE_SAFETY_KEYS, "approval review source.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write controlled expansion approval field",
    "forbidden sensitive provider write controlled expansion approval value",
  );
}

function validateApprovalAssemblyLedgerSource(value) {
  if (!isRecord(value)) {
    failures.push("approval ledger source root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-live-pilot-run-ledger.v1") {
    failures.push("approval ledger source.schemaVersion must be smart-cs-agent.provider-write-live-pilot-run-ledger.v1");
  }
  validateApprovalAssemblySourceTarget(value.target, "approval ledger source.target", false);
  if (value.summary?.noAutoCustomerReplies !== true) {
    failures.push("approval ledger source.summary.noAutoCustomerReplies must be true");
  }
  if (value.evidence?.providerWriteManualCloseoutReviewVerifierPassed !== true) {
    failures.push("approval ledger source.evidence.providerWriteManualCloseoutReviewVerifierPassed must be true");
  }
  validateSha256(
    "approval ledger source.artifactBindings.providerWriteManualCloseoutReviewSha256",
    value.artifactBindings?.providerWriteManualCloseoutReviewSha256,
  );
  validateSha256(
    "approval ledger source.artifactBindings.auditExportSha256",
    value.artifactBindings?.auditExportSha256,
  );
  validateSha256(
    "approval ledger source.artifactBindings.productionLaunchSha256",
    value.artifactBindings?.productionLaunchSha256,
  );
  validateAllFalseObject(value.safety, APPROVAL_LEDGER_SOURCE_SAFETY_KEYS, "approval ledger source.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write controlled expansion approval field",
    "forbidden sensitive provider write controlled expansion approval value",
  );
}

function validateApprovalAssemblySourceTarget(value, label, draftShape) {
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

function validateApprovalSafeLedgerAssemblyBinding(approval, assemblySha256) {
  const boundSha256 =
    approval?.prerequisiteEvidence?.providerWriteSafeLedgerAssemblySha256;
  if (boundSha256 !== assemblySha256) {
    failures.push("approval.prerequisiteEvidence.providerWriteSafeLedgerAssemblySha256 must match the safe ledger assembly file sha256");
  }
}

function validateApprovalAssemblySourceBindings(
  assembly,
  draftSource,
  reviewSource,
  ledgerSource,
) {
  if (!isRecord(assembly)) return;
  const bindings = assembly.artifactBindings ?? {};

  if (bindings.providerWriteLivePilotRunLedgerDraftSha256 !== draftSource.sha256) {
    failures.push("approval assembly.artifactBindings.providerWriteLivePilotRunLedgerDraftSha256 must match the draft source file sha256");
  }
  if (bindings.providerWriteManualCloseoutReviewSha256 !== reviewSource.sha256) {
    failures.push("approval assembly.artifactBindings.providerWriteManualCloseoutReviewSha256 must match the manual closeout review source file sha256");
  }
  if (bindings.providerWriteLivePilotRunLedgerSha256 !== ledgerSource.sha256) {
    failures.push("approval assembly.artifactBindings.providerWriteLivePilotRunLedgerSha256 must match the final ledger source file sha256");
  }
  if (
    reviewSource.value?.artifactBindings?.providerWriteLivePilotRunLedgerDraftSha256 !==
    draftSource.sha256
  ) {
    failures.push("approval review source.artifactBindings.providerWriteLivePilotRunLedgerDraftSha256 must match the draft source file sha256");
  }
  if (
    ledgerSource.value?.artifactBindings?.providerWriteManualCloseoutReviewSha256 !==
    reviewSource.sha256
  ) {
    failures.push("approval ledger source.artifactBindings.providerWriteManualCloseoutReviewSha256 must match the manual closeout review source file sha256");
  }
  if (
    reviewSource.value?.artifactBindings?.auditExportSha256 !==
    ledgerSource.value?.artifactBindings?.auditExportSha256
  ) {
    failures.push("approval review and ledger source auditExportSha256 must match");
  }
  if (
    reviewSource.value?.artifactBindings?.productionLaunchSha256 !==
    ledgerSource.value?.artifactBindings?.productionLaunchSha256
  ) {
    failures.push("approval review and ledger source productionLaunchSha256 must match");
  }

  compareApprovalAssemblyTargetWithSource(
    assembly.target,
    draftSource.value?.target,
    "approval draft source.target",
  );
  compareApprovalAssemblyTargetWithSource(
    assembly.target,
    reviewSource.value?.target,
    "approval review source.target",
  );
  compareApprovalAssemblyTargetWithSource(
    assembly.target,
    ledgerSource.value?.target,
    "approval ledger source.target",
  );
}

function compareApprovalAssemblyTargetWithSource(assemblyTarget, sourceTarget, label) {
  if (!isRecord(assemblyTarget) || !isRecord(sourceTarget)) return;
  for (const key of ["tenantFingerprint", "channel", "rolloutTrack"]) {
    if (assemblyTarget[key] !== sourceTarget[key]) {
      failures.push(`approval assembly.target.${key} must match ${label}.${key}`);
    }
  }
  if (
    sourceTarget.changeTicketFingerprint &&
    assemblyTarget.changeTicketFingerprint !== sourceTarget.changeTicketFingerprint
  ) {
    failures.push("approval assembly.target.changeTicketFingerprint must match approval draft source.target.changeTicketFingerprint");
  }
}

function validateApprovalBinding(preflight, approvalEvidence) {
  const boundSha256 =
    preflight?.prerequisiteEvidence?.providerWriteControlledExpansionApprovalSha256;
  if (boundSha256 !== approvalEvidence.sha256) {
    failures.push("prerequisiteEvidence.providerWriteControlledExpansionApprovalSha256 must match the approval file sha256");
  }
}

function validatePreflightWithinApproval(preflight, approval) {
  if (!isRecord(preflight) || !isRecord(approval)) return;
  if (preflight.target?.rolloutIdFingerprint !== approval.target?.rolloutIdFingerprint) {
    failures.push("target.rolloutIdFingerprint must match approval target.rolloutIdFingerprint");
  }
  if (preflight.target?.rolloutTrack !== approval.target?.toRolloutTrack) {
    failures.push("target.rolloutTrack must match approval target.toRolloutTrack");
  }
  if (preflight.target?.changeTicket !== approval.target?.changeTicket) {
    failures.push("target.changeTicket must match approval target.changeTicket");
  }

  const preflightScope = preflight.expansionScope;
  const approvalScope = approval.expansionScope;
  if (!isRecord(preflightScope) || !isRecord(approvalScope)) return;

  if (!isSubset(preflightScope.merchantFingerprints, approvalScope.merchantFingerprints)) {
    failures.push("expansionScope.merchantFingerprints must stay inside the approved merchant scope");
  }
  if (!isSubset(preflightScope.channels, approvalScope.channels)) {
    failures.push("expansionScope.channels must stay inside the approved channel scope");
  }
  if (!isSubset(preflightScope.allowedActions, approvalScope.allowedActions)) {
    failures.push("expansionScope.allowedActions must stay inside the approved action scope");
  }
  if (
    Number.isInteger(preflightScope.maxMerchants) &&
    Number.isInteger(approvalScope.maxMerchants) &&
    preflightScope.maxMerchants > approvalScope.maxMerchants
  ) {
    failures.push("expansionScope.maxMerchants must not exceed approval limit");
  }
  if (
    Number.isInteger(preflightScope.maxDailyProviderWrites) &&
    Number.isInteger(approvalScope.maxDailyProviderWrites) &&
    preflightScope.maxDailyProviderWrites > approvalScope.maxDailyProviderWrites
  ) {
    failures.push("expansionScope.maxDailyProviderWrites must not exceed approval limit");
  }
  if (
    Number.isInteger(preflightScope.maxDailyProviderWritesPerMerchant) &&
    Number.isInteger(approvalScope.maxDailyProviderWritesPerMerchant) &&
    preflightScope.maxDailyProviderWritesPerMerchant >
      approvalScope.maxDailyProviderWritesPerMerchant
  ) {
    failures.push("expansionScope.maxDailyProviderWritesPerMerchant must not exceed approval limit");
  }
  if (
    Number.isInteger(preflightScope.maxCouponAmountCents) &&
    Number.isInteger(approvalScope.maxCouponAmountCents) &&
    preflightScope.maxCouponAmountCents > approvalScope.maxCouponAmountCents
  ) {
    failures.push("expansionScope.maxCouponAmountCents must not exceed approval limit");
  }
}

function readJsonFile(filePath, label, artifactDir, argName, artifactDirName) {
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
  if (stats.size > MAX_EVIDENCE_BYTES) {
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
    preflight: undefined,
    approval: undefined,
    approvalAssembly: undefined,
    approvalAssemblyDraft: undefined,
    approvalAssemblyReview: undefined,
    approvalAssemblyLedger: undefined,
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
    if (arg.startsWith("--preflight=")) {
      args.preflight = arg.slice("--preflight=".length);
      continue;
    }
    if (arg.startsWith("--approval=")) {
      args.approval = arg.slice("--approval=".length);
      continue;
    }
    if (arg.startsWith("--approval-assembly=")) {
      args.approvalAssembly = arg.slice("--approval-assembly=".length);
      continue;
    }
    if (arg.startsWith("--approval-assembly-draft=")) {
      args.approvalAssemblyDraft = arg.slice("--approval-assembly-draft=".length);
      continue;
    }
    if (arg.startsWith("--approval-assembly-review=")) {
      args.approvalAssemblyReview = arg.slice("--approval-assembly-review=".length);
      continue;
    }
    if (arg.startsWith("--approval-assembly-ledger=")) {
      args.approvalAssemblyLedger = arg.slice("--approval-assembly-ledger=".length);
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
    preflight:
      args.preflight ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_FILE,
    approval:
      args.approval ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_FILE,
    approvalAssembly:
      args.approvalAssembly ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_FILE,
    approvalAssemblyDraft:
      args.approvalAssemblyDraft ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE,
    approvalAssemblyReview:
      args.approvalAssemblyReview ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_REVIEW_FILE,
    approvalAssemblyLedger:
      args.approvalAssemblyLedger ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_LEDGER_FILE,
    requirePass:
      args.requirePass ||
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_REQUIRE_PASS === "true",
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

function validateArtifactBindings(value, allowedKeys, label) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, allowedKeys, `${label} contains unsupported field`);
  const hashes = [];
  for (const key of allowedKeys) {
    validateSha256(`${label}.${key}`, value[key]);
    if (typeof value[key] === "string") hashes.push(value[key]);
  }
  if (hashes.length === allowedKeys.size && new Set(hashes).size !== hashes.length) {
    failures.push(`${label} values must be distinct`);
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

function validateNoSensitiveFields(value, fieldMessage, valueMessage) {
  visit(value, (key, item) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_FIELD_NAMES.has(normalizedKey)) {
      failures.push(fieldMessage);
    }
    if (typeof item === "string" && isForbiddenValue(item)) {
      failures.push(valueMessage);
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

function isSubset(subset, superset) {
  if (!Array.isArray(subset) || !Array.isArray(superset)) return false;
  const allowed = new Set(superset);
  return subset.every((item) => allowed.has(item));
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

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

main();
