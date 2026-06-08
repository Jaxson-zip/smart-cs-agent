import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const COMMAND_NAME = "verify:provider-write-controlled-expansion-run-ledger";
const MAX_EVIDENCE_BYTES = 512 * 1024;
const RUN_LEDGER_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-controlled-expansion-run-ledger-artifacts",
);
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

const RUN_LEDGER_ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "expansionScope",
  "launchWindow",
  "summary",
  "runRecords",
  "evidence",
  "safety",
]);
const TARGET_KEYS = new Set([
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
  "closedAt",
  "durationMinutes",
  "freezeWindowActive",
  "businessHoursOnly",
]);
const SUMMARY_KEYS = new Set([
  "totalRuns",
  "succeededRuns",
  "failedRuns",
  "rolledBackRuns",
  "blockedRuns",
  "complaintCount",
  "customerRejectedCompensationCount",
  "allRunsReviewed",
  "failedRunsHaveIncidentNotes",
  "rollbackActionsVerified",
  "customerComplaintsStoppedRollout",
  "noAutoCustomerReplies",
]);
const RUN_RECORD_KEYS = new Set([
  "merchantFingerprint",
  "channel",
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
  "complaintRaised",
  "compensationRejected",
  "createdAt",
  "completedAt",
]);
const EVIDENCE_KEYS = new Set([
  "providerWriteControlledExpansionPreflightVerifierPassed",
  "providerWriteControlledExpansionPreflightSha256",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "productionAlertingVerifierPassed",
  "productionCanaryVerifierPassed",
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "providerWriteLiveExecutorControlPlaneVerifierPassed",
  "providerWriteExecutionAttemptVisibilityVerifierPassed",
  "auditExportVerified",
  "postExpansionReviewCompleted",
]);
const EVIDENCE_BOOLEAN_KEYS = [
  "providerWriteControlledExpansionPreflightVerifierPassed",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "productionAlertingVerifierPassed",
  "productionCanaryVerifierPassed",
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "providerWriteLiveExecutorControlPlaneVerifierPassed",
  "providerWriteExecutionAttemptVisibilityVerifierPassed",
  "auditExportVerified",
  "postExpansionReviewCompleted",
];
const SAFETY_KEYS = new Set([
  "secretsInLedger",
  "rawTenantIdsInLedger",
  "rawMerchantIdsInLedger",
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
const APPROVAL_ASSEMBLY_ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "verificationPassed",
  "target",
  "artifactBindings",
  "safety",
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
const APPROVAL_SOURCE_SAFETY_KEYS = new Set([
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
const RISK_LEVELS = new Set(["low", "medium", "high"]);
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
const SAFE_CHANGE_TICKET_PATTERN = /^[A-Za-z0-9._-]{3,100}$/;
const PLACEHOLDER_SHA256_VALUES = new Set([
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "deadbeef".repeat(8),
  "0123456789abcdef".repeat(4),
  "abcdef0123456789".repeat(4),
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

function main() {
  const args = applySafeEnvDefaults(parseArgs(process.argv.slice(2)), process.env);
  const content = readStaticContent();
  verifyStaticArtifacts(content);
  verifyStaticSafety();

  let runLedger = null;
  let preflight = null;
  let approval = null;
  let approvalAssembly = null;
  let approvalAssemblyDraft = null;
  let approvalAssemblyReview = null;
  let approvalAssemblyLedger = null;

  if (hasValue(args.runLedger)) {
    const runLedgerEvidence = readJsonFile(
      args.runLedger,
      "provider write controlled expansion run ledger",
      RUN_LEDGER_ARTIFACT_DIR,
      "--run-ledger",
      "provider-write-controlled-expansion-run-ledger-artifacts",
    );
    if (runLedgerEvidence) {
      runLedger = runLedgerEvidence;
      validateRunLedger(runLedger.value, args);
    }
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion run ledger evidence is required when pass evidence is required");
  }

  if (hasValue(args.preflight)) {
    preflight = readJsonFile(
      args.preflight,
      "provider write controlled expansion preflight",
      PREFLIGHT_ARTIFACT_DIR,
      "--preflight",
      "provider-write-controlled-expansion-preflight-artifacts",
    );
    if (preflight) validatePreflightSource(preflight.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion preflight evidence is required when pass evidence is required");
  }

  if (hasValue(args.preflightApproval)) {
    approval = readJsonFile(
      args.preflightApproval,
      "provider write controlled expansion preflight approval",
      APPROVAL_ARTIFACT_DIR,
      "--preflight-approval",
      "provider-write-controlled-expansion-approval-artifacts",
    );
    if (approval) validateApprovalSource(approval.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion preflight approval evidence is required when pass evidence is required");
  }

  if (hasValue(args.preflightApprovalAssembly)) {
    approvalAssembly = readJsonFile(
      args.preflightApprovalAssembly,
      "provider write controlled expansion preflight approval safe ledger assembly",
      APPROVAL_ASSEMBLY_ARTIFACT_DIR,
      "--preflight-approval-assembly",
      "provider-write-safe-ledger-assembly-artifacts",
    );
    if (approvalAssembly) validateApprovalAssemblyReceipt(approvalAssembly.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion preflight approval safe ledger assembly evidence is required when pass evidence is required");
  }

  if (hasValue(args.preflightApprovalAssemblyDraft)) {
    approvalAssemblyDraft = readJsonFile(
      args.preflightApprovalAssemblyDraft,
      "provider write controlled expansion preflight approval draft source",
      APPROVAL_ASSEMBLY_DRAFT_ARTIFACT_DIR,
      "--preflight-approval-assembly-draft",
      "provider-write-live-pilot-run-ledger-draft-artifacts",
    );
    if (approvalAssemblyDraft) validateApprovalAssemblyDraftSource(approvalAssemblyDraft.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion preflight approval draft source evidence is required when pass evidence is required");
  }

  if (hasValue(args.preflightApprovalAssemblyReview)) {
    approvalAssemblyReview = readJsonFile(
      args.preflightApprovalAssemblyReview,
      "provider write controlled expansion preflight approval manual closeout review source",
      APPROVAL_ASSEMBLY_REVIEW_ARTIFACT_DIR,
      "--preflight-approval-assembly-review",
      "provider-write-manual-closeout-review-artifacts",
    );
    if (approvalAssemblyReview) validateApprovalAssemblyReviewSource(approvalAssemblyReview.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion preflight approval manual closeout review source evidence is required when pass evidence is required");
  }

  if (hasValue(args.preflightApprovalAssemblyLedger)) {
    approvalAssemblyLedger = readJsonFile(
      args.preflightApprovalAssemblyLedger,
      "provider write controlled expansion preflight approval final ledger source",
      APPROVAL_ASSEMBLY_LEDGER_ARTIFACT_DIR,
      "--preflight-approval-assembly-ledger",
      "provider-write-live-pilot-run-ledger-artifacts",
    );
    if (approvalAssemblyLedger) validateApprovalAssemblyLedgerSource(approvalAssemblyLedger.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion preflight approval final ledger source evidence is required when pass evidence is required");
  }

  if (runLedger && preflight) {
    validateRunLedgerPreflightBinding(runLedger.value, preflight.sha256);
    validateRunLedgerWithinPreflight(runLedger.value, preflight.value);
  }
  if (preflight && approval) {
    validatePreflightApprovalBinding(preflight.value, approval.sha256);
    validatePreflightWithinApproval(preflight.value, approval.value);
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
    console.error("Provider write controlled expansion run ledger verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write controlled expansion run ledger verification passed.");
  if (runLedger) {
    console.log(`- rollout=${runLedger.value.target.rolloutTrack}`);
    console.log(`- merchants=${runLedger.value.expansionScope.merchantFingerprints.length}`);
    console.log("- run-ledger=verified");
  } else {
    console.log("- run-ledger=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    gitignore: ".gitignore",
    runLedgerDocs: "docs/deploy/provider-write-controlled-expansion-run-ledger.md",
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
    "verify:provider-write-controlled-expansion-run-ledger:safe",
    "\"verify:provider-write-controlled-expansion-run-ledger:safe\": \"node scripts/verify-provider-write-controlled-expansion-run-ledger.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-controlled-expansion-run-ledger.mjs",
  ]);

  mustContainAll("provider write controlled expansion run ledger docs", content.runLedgerDocs, [
    "PR75 Provider Write Controlled Expansion Run Ledger Gate",
    "npm run verify:provider-write-controlled-expansion-run-ledger",
    "npm run verify:provider-write-controlled-expansion-run-ledger:safe",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_REQUIRE_PASS=true",
    "smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1",
    "smart-cs-agent.provider-write-controlled-expansion-preflight.v1",
    "smart-cs-agent.provider-write-controlled-expansion-approval.v1",
    "smart-cs-agent.provider-write-safe-ledger-assembly.v1",
    "provider-write-controlled-expansion-run-ledger-artifacts/",
    "provider-write-controlled-expansion-preflight-artifacts/",
    "provider-write-controlled-expansion-approval-artifacts/",
    "provider-write-safe-ledger-assembly-artifacts/",
    "provider-write-live-pilot-run-ledger-draft-artifacts/",
    "provider-write-manual-closeout-review-artifacts/",
    "provider-write-live-pilot-run-ledger-artifacts/",
    "controlled_multi_merchant",
    "providerWriteControlledExpansionPreflightVerifierPassed=true",
    "providerWriteControlledExpansionPreflightSha256",
    "customerComplaintsStoppedRollout=true",
    "noAutoCustomerReplies=true",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not read production databases",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR75 Provider Write Controlled Expansion Run Ledger Gate",
    "verify:provider-write-controlled-expansion-run-ledger",
    "smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1",
    "providerWriteControlledExpansionPreflightSha256",
    "customerComplaintsStoppedRollout",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR75 Provider Write Controlled Expansion Run Ledger Gate",
    "verify:provider-write-controlled-expansion-run-ledger",
    "providerWriteControlledExpansionPreflightVerifierPassed=true",
    "providerWriteControlledExpansionPreflightSha256",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "PR75 Provider Write Controlled Expansion Run Ledger Gate",
    "npm run verify:provider-write-controlled-expansion-run-ledger",
    "npm run verify:provider-write-controlled-expansion-run-ledger:safe",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-controlled-expansion-run-ledger.test.mjs",
    "npm run verify:provider-write-controlled-expansion-run-ledger",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-controlled-expansion-run-ledger.test.mjs",
    "npm run verify:provider-write-controlled-expansion-run-ledger",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "providerWriteControlledExpansionRunLedger",
    "verify-provider-write-controlled-expansion-run-ledger.mjs",
    "verify:provider-write-controlled-expansion-run-ledger",
    "provider write controlled expansion run ledger",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE",
  ]);

  mustContainAll("task plan references PR75", content.taskPlan, [
    "PR75 - Provider Write Controlled Expansion Run Ledger Gate",
    "verify:provider-write-controlled-expansion-run-ledger",
  ]);

  mustContainAll("progress references PR75", content.progress, [
    "Started PR75 provider write controlled expansion run ledger gate",
  ]);

  mustContainAll("gitignore controlled expansion run ledger artifacts", content.gitignore, [
    "provider-write-controlled-expansion-run-ledger-artifacts/",
  ]);
}

function validateRunLedger(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write controlled expansion run ledger root must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    RUN_LEDGER_ROOT_KEYS,
    "provider write controlled expansion run ledger contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("generatedAt must be an ISO timestamp");

  validateTarget(value.target, "target");
  validateExpansionScope(value.expansionScope, "expansionScope");
  validateLaunchWindow(value.launchWindow, "launchWindow", true);
  validateRunRecords(value.runRecords, value.launchWindow, value.expansionScope, options);
  validateSummary(value.summary, value.runRecords, options);
  validateEvidence(value.evidence, options);
  validateAllFalseObject(value.safety, SAFETY_KEYS, "safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write controlled expansion run ledger field",
    "forbidden sensitive provider write controlled expansion run ledger value",
  );
}

function validateTarget(target, label) {
  if (!isRecord(target)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(target, TARGET_KEYS, `${label} contains unsupported field`);
  validateFingerprint(`${label}.rolloutIdFingerprint`, target.rolloutIdFingerprint);
  if (target.rolloutTrack !== "controlled_multi_merchant") {
    failures.push(`${label}.rolloutTrack must be controlled_multi_merchant`);
  }
  if (
    typeof target.changeTicket !== "string" ||
    !SAFE_CHANGE_TICKET_PATTERN.test(target.changeTicket)
  ) {
    failures.push(`${label}.changeTicket must be a safe change ticket id`);
  }
}

function validateExpansionScope(scope, label) {
  if (!isRecord(scope)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(scope, EXPANSION_SCOPE_KEYS, `${label} contains unsupported field`);
  validateFingerprintArray(`${label}.merchantFingerprints`, scope.merchantFingerprints, 1, 10);
  validateEnumArray(`${label}.channels`, scope.channels, CHANNELS, 1, 2);
  validateEnumArray(
    `${label}.allowedActions`,
    scope.allowedActions,
    CONTROLLED_EXPANSION_ACTIONS,
    1,
    3,
  );
  validateIntegerInRange(`${label}.maxMerchants`, scope.maxMerchants, 1, 10);
  validateIntegerInRange(`${label}.maxDailyProviderWrites`, scope.maxDailyProviderWrites, 1, 100);
  validateIntegerInRange(
    `${label}.maxDailyProviderWritesPerMerchant`,
    scope.maxDailyProviderWritesPerMerchant,
    1,
    20,
  );
  validateIntegerInRange(`${label}.maxCouponAmountCents`, scope.maxCouponAmountCents, 0, 100000);
  if (scope.businessHoursOnly !== true) failures.push(`${label}.businessHoursOnly must be true`);
}

function validateLaunchWindow(window, label, requireClosedAt) {
  if (!isRecord(window)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(window, LAUNCH_WINDOW_KEYS, `${label} contains unsupported field`);
  if (!isIsoTimestamp(window.startsAt)) failures.push(`${label}.startsAt must be an ISO timestamp`);
  if (!isIsoTimestamp(window.endsAt)) failures.push(`${label}.endsAt must be an ISO timestamp`);
  if (requireClosedAt && !isIsoTimestamp(window.closedAt)) {
    failures.push(`${label}.closedAt must be an ISO timestamp`);
  }
  if (
    isIsoTimestamp(window.startsAt) &&
    isIsoTimestamp(window.endsAt) &&
    Date.parse(window.startsAt) >= Date.parse(window.endsAt)
  ) {
    failures.push(`${label}.startsAt must be before ${label}.endsAt`);
  }
  if (
    requireClosedAt &&
    isIsoTimestamp(window.endsAt) &&
    isIsoTimestamp(window.closedAt) &&
    Date.parse(window.closedAt) < Date.parse(window.endsAt)
  ) {
    failures.push(`${label}.closedAt must be at or after ${label}.endsAt`);
  }
  validateIntegerInRange(`${label}.durationMinutes`, window.durationMinutes, 30, 240);
  if (window.freezeWindowActive !== true) failures.push(`${label}.freezeWindowActive must be true`);
  if (window.businessHoursOnly !== true) failures.push(`${label}.businessHoursOnly must be true`);
}

function validateRunRecords(records, launchWindow, scope, options) {
  if (!Array.isArray(records)) {
    failures.push("runRecords must be an array");
    return;
  }
  if ((options.requirePass || hasValue(options.runLedger)) && records.length === 0) {
    failures.push("runRecords must contain at least one record when run ledger evidence is required");
  }
  if (records.length > 200) failures.push("runRecords must contain at most 200 records");

  const fingerprints = new Set();
  const bounds = getLaunchWindowBounds(launchWindow);
  records.forEach((record, index) =>
    validateRunRecord(record, index, fingerprints, bounds, scope),
  );
}

function validateRunRecord(record, index, fingerprints, bounds, scope) {
  const label = `runRecords[${index}]`;
  if (!isRecord(record)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(record, RUN_RECORD_KEYS, `${label} contains unsupported field`);
  validateFingerprint(`${label}.merchantFingerprint`, record.merchantFingerprint);
  if (!CHANNELS.has(record.channel)) failures.push(`${label}.channel must be taobao or douyin`);
  validateSha256(`${label}.runFingerprint`, record.runFingerprint);
  if (typeof record.runFingerprint === "string") {
    if (fingerprints.has(record.runFingerprint)) failures.push("runRecords runFingerprint values must be distinct");
    fingerprints.add(record.runFingerprint);
  }
  validateFingerprint(`${label}.requestFingerprint`, record.requestFingerprint);
  validateFingerprint(`${label}.executionAttemptFingerprint`, record.executionAttemptFingerprint);
  validateSha256(`${label}.auditLogSha256`, record.auditLogSha256);
  validateFingerprint(`${label}.operatorFingerprint`, record.operatorFingerprint);
  validateFingerprint(`${label}.reviewerFingerprint`, record.reviewerFingerprint);
  validateFingerprint(`${label}.rollbackOwnerFingerprint`, record.rollbackOwnerFingerprint);
  if (!CONTROLLED_EXPANSION_ACTIONS.has(record.action)) {
    failures.push(`${label}.action must be a controlled expansion provider write action`);
  }
  if (!RISK_LEVELS.has(record.riskLevel)) {
    failures.push(`${label}.riskLevel must be low, medium, or high`);
  }
  if (!RUN_STATUSES.has(record.status)) {
    failures.push(`${label}.status must be succeeded, failed, rolled_back, or blocked`);
  }
  if (!NETWORK_EXECUTION.has(record.networkExecution)) {
    failures.push(`${label}.networkExecution must be provider_api_called or blocked_before_network`);
  }
  for (const key of [
    "providerMutationExecuted",
    "customerVisibleMessageSent",
    "providerResponseStored",
    "providerPayloadStored",
    "complaintRaised",
    "compensationRejected",
  ]) {
    validateBoolean(`${label}.${key}`, record[key]);
  }
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
  if (record.status === "blocked" && record.networkExecution !== "blocked_before_network") {
    failures.push(`${label}.networkExecution must be blocked_before_network for blocked runs`);
  }
  if (record.providerMutationExecuted === true && record.riskLevel !== "low") {
    failures.push(`${label}.riskLevel must be low when providerMutationExecuted is true`);
  }
  if (record.status === "failed" && record.providerMutationExecuted === true) {
    failures.push(`${label}.status cannot remain failed after providerMutationExecuted=true`);
  }
  if (!isIsoTimestamp(record.createdAt)) failures.push(`${label}.createdAt must be an ISO timestamp`);
  if (!isIsoTimestamp(record.completedAt)) failures.push(`${label}.completedAt must be an ISO timestamp`);
  if (
    isIsoTimestamp(record.createdAt) &&
    isIsoTimestamp(record.completedAt) &&
    Date.parse(record.createdAt) > Date.parse(record.completedAt)
  ) {
    failures.push(`${label}.createdAt must be before or equal to completedAt`);
  }
  if (bounds && isIsoTimestamp(record.createdAt) && !isTimestampInsideWindow(record.createdAt, bounds)) {
    failures.push(`${label}.createdAt must be inside launchWindow`);
  }
  if (bounds && isIsoTimestamp(record.completedAt) && !isTimestampInsideWindow(record.completedAt, bounds)) {
    failures.push(`${label}.completedAt must be inside launchWindow`);
  }
  if (isRecord(scope)) {
    if (Array.isArray(scope.merchantFingerprints) && !scope.merchantFingerprints.includes(record.merchantFingerprint)) {
      failures.push(`${label}.merchantFingerprint must stay inside expansionScope.merchantFingerprints`);
    }
    if (Array.isArray(scope.channels) && !scope.channels.includes(record.channel)) {
      failures.push(`${label}.channel must stay inside expansionScope.channels`);
    }
    if (Array.isArray(scope.allowedActions) && !scope.allowedActions.includes(record.action)) {
      failures.push(`${label}.action must stay inside expansionScope.allowedActions`);
    }
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
    "complaintCount",
    "customerRejectedCompensationCount",
  ]) {
    validateIntegerInRange(`summary.${key}`, summary[key], 0, 200);
  }
  const records = Array.isArray(runRecords) ? runRecords : [];
  const counts = countRunRecords(records);
  if (summary.totalRuns !== records.length) failures.push("summary.totalRuns must match runRecords length");
  if (summary.succeededRuns !== counts.succeeded) failures.push("summary.succeededRuns must match run record statuses");
  if (summary.failedRuns !== counts.failed) failures.push("summary.failedRuns must match run record statuses");
  if (summary.rolledBackRuns !== counts.rolled_back) failures.push("summary.rolledBackRuns must match run record statuses");
  if (summary.blockedRuns !== counts.blocked) failures.push("summary.blockedRuns must match run record statuses");
  if (summary.complaintCount !== counts.complaints) failures.push("summary.complaintCount must match run record complaint flags");
  if (summary.customerRejectedCompensationCount !== counts.rejections) {
    failures.push("summary.customerRejectedCompensationCount must match run record compensation rejection flags");
  }
  for (const key of [
    "allRunsReviewed",
    "failedRunsHaveIncidentNotes",
    "rollbackActionsVerified",
    "customerComplaintsStoppedRollout",
    "noAutoCustomerReplies",
  ]) {
    validateBoolean(`summary.${key}`, summary[key]);
  }
  if ((options.requirePass || hasValue(options.runLedger)) && summary.allRunsReviewed !== true) {
    failures.push("summary.allRunsReviewed must be true");
  }
  if ((options.requirePass || hasValue(options.runLedger)) && summary.noAutoCustomerReplies !== true) {
    failures.push("summary.noAutoCustomerReplies must be true");
  }
  if (summary.failedRuns > 0 && summary.failedRunsHaveIncidentNotes !== true) {
    failures.push("summary.failedRunsHaveIncidentNotes must be true when failedRuns is greater than 0");
  }
  if (summary.rolledBackRuns > 0 && summary.rollbackActionsVerified !== true) {
    failures.push("summary.rollbackActionsVerified must be true when rolledBackRuns is greater than 0");
  }
  if (summary.complaintCount > 0 && summary.customerComplaintsStoppedRollout !== true) {
    failures.push("summary.customerComplaintsStoppedRollout must be true when complaintCount is greater than 0");
  }
  if (summary.customerRejectedCompensationCount > 0 && summary.noAutoCustomerReplies !== true) {
    failures.push("summary.noAutoCustomerReplies must be true when customerRejectedCompensationCount is greater than 0");
  }
  const failedProviderMutationIndexes = records.flatMap((record, index) =>
    isRecord(record) &&
    record.status === "failed" &&
    record.providerMutationExecuted === true
      ? [index]
      : [],
  );
  if (failedProviderMutationIndexes.length > 0 && summary.rollbackActionsVerified !== true) {
    failures.push("summary.rollbackActionsVerified must be true when failed provider mutations exist");
  }
}

function validateEvidence(evidence, options) {
  if (!isRecord(evidence)) {
    failures.push("evidence must be an object");
    return;
  }
  validateAllowedKeys(evidence, EVIDENCE_KEYS, "evidence contains unsupported field");
  for (const key of EVIDENCE_BOOLEAN_KEYS) {
    validateBoolean(`evidence.${key}`, evidence[key]);
    if ((options.requirePass || hasValue(options.runLedger)) && evidence[key] !== true) {
      failures.push(`evidence.${key} must be true`);
    }
  }
  validateSha256(
    "evidence.providerWriteControlledExpansionPreflightSha256",
    evidence.providerWriteControlledExpansionPreflightSha256,
  );
}

function validatePreflightSource(value) {
  if (!isRecord(value)) {
    failures.push("preflight root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-controlled-expansion-preflight.v1") {
    failures.push("preflight.schemaVersion must be smart-cs-agent.provider-write-controlled-expansion-preflight.v1");
  }
  validateTarget(value.target, "preflight.target");
  validateExpansionScope(value.expansionScope, "preflight.expansionScope");
  validatePreflightLaunchWindow(value.launchWindow);
  if (value.prerequisiteEvidence?.providerWriteControlledExpansionApprovalVerifierPassed !== true) {
    failures.push("preflight.prerequisiteEvidence.providerWriteControlledExpansionApprovalVerifierPassed must be true");
  }
  validateSha256(
    "preflight.prerequisiteEvidence.providerWriteControlledExpansionApprovalSha256",
    value.prerequisiteEvidence?.providerWriteControlledExpansionApprovalSha256,
  );
  if (value.rolloutPlan?.automaticNextWaveEnabled !== false) {
    failures.push("preflight.rolloutPlan.automaticNextWaveEnabled must be false");
  }
  if (value.rolloutPlan?.rollbackOnAnyFailedMutation !== true) {
    failures.push("preflight.rolloutPlan.rollbackOnAnyFailedMutation must be true");
  }
  if (value.rolloutPlan?.stopOnCustomerComplaint !== true) {
    failures.push("preflight.rolloutPlan.stopOnCustomerComplaint must be true");
  }
  validateAllFalseObject(value.safety, APPROVAL_SOURCE_SAFETY_KEYS, "preflight.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write controlled expansion run ledger field",
    "forbidden sensitive provider write controlled expansion run ledger value",
  );
}

function validatePreflightLaunchWindow(window) {
  if (!isRecord(window)) {
    failures.push("preflight.launchWindow must be an object");
    return;
  }
  if (!isIsoTimestamp(window.startsAt)) failures.push("preflight.launchWindow.startsAt must be an ISO timestamp");
  if (!isIsoTimestamp(window.endsAt)) failures.push("preflight.launchWindow.endsAt must be an ISO timestamp");
  validateIntegerInRange("preflight.launchWindow.durationMinutes", window.durationMinutes, 30, 240);
  if (window.freezeWindowActive !== true) failures.push("preflight.launchWindow.freezeWindowActive must be true");
  if (window.businessHoursOnly !== true) failures.push("preflight.launchWindow.businessHoursOnly must be true");
}

function validateApprovalSource(value) {
  if (!isRecord(value)) {
    failures.push("approval root must be an object");
    return;
  }
  validateAllowedKeys(value, APPROVAL_ROOT_KEYS, "approval contains unsupported field");
  if (value.schemaVersion !== "smart-cs-agent.provider-write-controlled-expansion-approval.v1") {
    failures.push("approval.schemaVersion must be smart-cs-agent.provider-write-controlled-expansion-approval.v1");
  }
  if (value.target?.toRolloutTrack !== "controlled_multi_merchant") {
    failures.push("approval.target.toRolloutTrack must be controlled_multi_merchant");
  }
  if (value.prerequisiteEvidence?.providerWriteSafeLedgerAssemblyVerifierPassed !== true) {
    failures.push("approval.prerequisiteEvidence.providerWriteSafeLedgerAssemblyVerifierPassed must be true");
  }
  validateSha256(
    "approval.prerequisiteEvidence.providerWriteSafeLedgerAssemblySha256",
    value.prerequisiteEvidence?.providerWriteSafeLedgerAssemblySha256,
  );
  if (value.operationalControls?.noAutomaticCustomerVisibleReplies !== true) {
    failures.push("approval.operationalControls.noAutomaticCustomerVisibleReplies must be true");
  }
  if (value.commercialReadiness?.billingPlanConfigured !== true) {
    failures.push("approval.commercialReadiness.billingPlanConfigured must be true");
  }
  validateAllFalseObject(value.safety, APPROVAL_SOURCE_SAFETY_KEYS, "approval.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write controlled expansion run ledger field",
    "forbidden sensitive provider write controlled expansion run ledger value",
  );
}

function validateApprovalAssemblyReceipt(value) {
  if (!isRecord(value)) {
    failures.push("approval assembly root must be an object");
    return;
  }
  validateAllowedKeys(value, APPROVAL_ASSEMBLY_ROOT_KEYS, "approval assembly contains unsupported field");
  if (value.schemaVersion !== "smart-cs-agent.provider-write-safe-ledger-assembly.v1") {
    failures.push("approval assembly.schemaVersion must be smart-cs-agent.provider-write-safe-ledger-assembly.v1");
  }
  if (value.verificationPassed !== true) failures.push("approval assembly.verificationPassed must be true");
  validateArtifactBindings(
    value.artifactBindings,
    APPROVAL_ASSEMBLY_ARTIFACT_BINDING_KEYS,
    "approval assembly.artifactBindings",
  );
  validateAllFalseObject(value.safety, APPROVAL_ASSEMBLY_SAFETY_KEYS, "approval assembly.safety");
}

function validateApprovalAssemblyDraftSource(value) {
  if (!isRecord(value)) {
    failures.push("approval draft source root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1") {
    failures.push("approval draft source.schemaVersion must be smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1");
  }
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
}

function validateApprovalAssemblyReviewSource(value) {
  if (!isRecord(value)) {
    failures.push("approval review source root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-manual-closeout-review.v1") {
    failures.push("approval review source.schemaVersion must be smart-cs-agent.provider-write-manual-closeout-review.v1");
  }
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
}

function validateApprovalAssemblyLedgerSource(value) {
  if (!isRecord(value)) {
    failures.push("approval ledger source root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-live-pilot-run-ledger.v1") {
    failures.push("approval ledger source.schemaVersion must be smart-cs-agent.provider-write-live-pilot-run-ledger.v1");
  }
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
}

function validateRunLedgerPreflightBinding(runLedger, preflightSha256) {
  if (runLedger?.evidence?.providerWriteControlledExpansionPreflightSha256 !== preflightSha256) {
    failures.push("evidence.providerWriteControlledExpansionPreflightSha256 must match the preflight file sha256");
  }
}

function validateRunLedgerWithinPreflight(runLedger, preflight) {
  if (!isRecord(runLedger) || !isRecord(preflight)) return;
  if (runLedger.target?.rolloutIdFingerprint !== preflight.target?.rolloutIdFingerprint) {
    failures.push("target.rolloutIdFingerprint must match preflight target.rolloutIdFingerprint");
  }
  if (runLedger.target?.rolloutTrack !== preflight.target?.rolloutTrack) {
    failures.push("target.rolloutTrack must match preflight target.rolloutTrack");
  }
  if (runLedger.target?.changeTicket !== preflight.target?.changeTicket) {
    failures.push("target.changeTicket must match preflight target.changeTicket");
  }

  const runScope = runLedger.expansionScope;
  const preflightScope = preflight.expansionScope;
  if (isRecord(runScope) && isRecord(preflightScope)) {
    if (!isSubset(runScope.merchantFingerprints, preflightScope.merchantFingerprints)) {
      failures.push("expansionScope.merchantFingerprints must stay inside preflight scope");
    }
    if (!isSubset(runScope.channels, preflightScope.channels)) {
      failures.push("expansionScope.channels must stay inside preflight scope");
    }
    if (!isSubset(runScope.allowedActions, preflightScope.allowedActions)) {
      failures.push("expansionScope.allowedActions must stay inside preflight scope");
    }
    if (
      Number.isInteger(runScope.maxMerchants) &&
      Number.isInteger(preflightScope.maxMerchants) &&
      runScope.maxMerchants > preflightScope.maxMerchants
    ) {
      failures.push("expansionScope.maxMerchants must not exceed preflight limit");
    }
    if (
      Number.isInteger(runScope.maxDailyProviderWrites) &&
      Number.isInteger(preflightScope.maxDailyProviderWrites) &&
      runScope.maxDailyProviderWrites > preflightScope.maxDailyProviderWrites
    ) {
      failures.push("expansionScope.maxDailyProviderWrites must not exceed preflight limit");
    }
    if (
      Number.isInteger(runScope.maxDailyProviderWritesPerMerchant) &&
      Number.isInteger(preflightScope.maxDailyProviderWritesPerMerchant) &&
      runScope.maxDailyProviderWritesPerMerchant >
        preflightScope.maxDailyProviderWritesPerMerchant
    ) {
      failures.push("expansionScope.maxDailyProviderWritesPerMerchant must not exceed preflight limit");
    }
    if (
      Number.isInteger(runScope.maxCouponAmountCents) &&
      Number.isInteger(preflightScope.maxCouponAmountCents) &&
      runScope.maxCouponAmountCents > preflightScope.maxCouponAmountCents
    ) {
      failures.push("expansionScope.maxCouponAmountCents must not exceed preflight limit");
    }
  }

  if (
    runLedger.launchWindow?.startsAt !== preflight.launchWindow?.startsAt ||
    runLedger.launchWindow?.endsAt !== preflight.launchWindow?.endsAt ||
    runLedger.launchWindow?.durationMinutes !== preflight.launchWindow?.durationMinutes
  ) {
    failures.push("launchWindow must match preflight launchWindow");
  }
}

function validatePreflightApprovalBinding(preflight, approvalSha256) {
  if (
    preflight?.prerequisiteEvidence?.providerWriteControlledExpansionApprovalSha256 !==
    approvalSha256
  ) {
    failures.push("preflight.prerequisiteEvidence.providerWriteControlledExpansionApprovalSha256 must match the approval file sha256");
  }
}

function validatePreflightWithinApproval(preflight, approval) {
  if (!isRecord(preflight) || !isRecord(approval)) return;
  if (preflight.target?.rolloutIdFingerprint !== approval.target?.rolloutIdFingerprint) {
    failures.push("preflight.target.rolloutIdFingerprint must match approval target.rolloutIdFingerprint");
  }
  if (preflight.target?.rolloutTrack !== approval.target?.toRolloutTrack) {
    failures.push("preflight.target.rolloutTrack must match approval target.toRolloutTrack");
  }
  if (preflight.target?.changeTicket !== approval.target?.changeTicket) {
    failures.push("preflight.target.changeTicket must match approval target.changeTicket");
  }
}

function validateApprovalSafeLedgerAssemblyBinding(approval, assemblySha256) {
  if (
    approval?.prerequisiteEvidence?.providerWriteSafeLedgerAssemblySha256 !==
    assemblySha256
  ) {
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
}

function countRunRecords(records) {
  const counts = {
    succeeded: 0,
    failed: 0,
    rolled_back: 0,
    blocked: 0,
    complaints: 0,
    rejections: 0,
  };
  for (const record of records) {
    if (!isRecord(record)) continue;
    if (RUN_STATUSES.has(record.status)) counts[record.status] += 1;
    if (record.complaintRaised === true) counts.complaints += 1;
    if (record.compensationRejected === true) counts.rejections += 1;
  }
  return counts;
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
    runLedger: undefined,
    preflight: undefined,
    preflightApproval: undefined,
    preflightApprovalAssembly: undefined,
    preflightApprovalAssemblyDraft: undefined,
    preflightApprovalAssemblyReview: undefined,
    preflightApprovalAssemblyLedger: undefined,
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
    if (arg.startsWith("--run-ledger=")) {
      args.runLedger = arg.slice("--run-ledger=".length);
      continue;
    }
    if (arg.startsWith("--preflight=")) {
      args.preflight = arg.slice("--preflight=".length);
      continue;
    }
    if (arg.startsWith("--preflight-approval=")) {
      args.preflightApproval = arg.slice("--preflight-approval=".length);
      continue;
    }
    if (arg.startsWith("--preflight-approval-assembly=")) {
      args.preflightApprovalAssembly = arg.slice("--preflight-approval-assembly=".length);
      continue;
    }
    if (arg.startsWith("--preflight-approval-assembly-draft=")) {
      args.preflightApprovalAssemblyDraft = arg.slice("--preflight-approval-assembly-draft=".length);
      continue;
    }
    if (arg.startsWith("--preflight-approval-assembly-review=")) {
      args.preflightApprovalAssemblyReview = arg.slice("--preflight-approval-assembly-review=".length);
      continue;
    }
    if (arg.startsWith("--preflight-approval-assembly-ledger=")) {
      args.preflightApprovalAssemblyLedger = arg.slice("--preflight-approval-assembly-ledger=".length);
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
    runLedger:
      args.runLedger ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_FILE,
    preflight:
      args.preflight ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_FILE,
    preflightApproval:
      args.preflightApproval ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE,
    preflightApprovalAssembly:
      args.preflightApprovalAssembly ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_FILE,
    preflightApprovalAssemblyDraft:
      args.preflightApprovalAssemblyDraft ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE,
    preflightApprovalAssemblyReview:
      args.preflightApprovalAssemblyReview ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_REVIEW_FILE,
    preflightApprovalAssemblyLedger:
      args.preflightApprovalAssemblyLedger ??
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_LEDGER_FILE,
    requirePass:
      args.requirePass ||
      env.SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_REQUIRE_PASS === "true",
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

function validateBoolean(label, value) {
  if (typeof value !== "boolean") failures.push(`${label} must be a boolean`);
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
