import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const COMMAND_NAME = "verify:provider-write-graduated-rollout-run-ledger";
const MAX_EVIDENCE_BYTES = 512 * 1024;
const RUN_LEDGER_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-graduated-rollout-run-ledger-artifacts",
);
const PREFLIGHT_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-graduated-rollout-preflight-artifacts",
);
const APPROVAL_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-graduated-rollout-approval-artifacts",
);
const CLOSEOUT_REVIEW_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-controlled-expansion-closeout-review-artifacts",
);
const CONTROLLED_RUN_LEDGER_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-controlled-expansion-run-ledger-artifacts",
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
  "compensationRejectionsStoppedRollout",
  "merchantNotificationCompleted",
  "billingImpactReviewed",
  "supportSlaMaintained",
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
  "billingOwnerFingerprint",
  "supportOwnerFingerprint",
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
  "providerWriteGraduatedRolloutPreflightVerifierPassed",
  "providerWriteGraduatedRolloutPreflightSha256",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "productionAlertingVerifierPassed",
  "productionCanaryVerifierPassed",
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "providerWriteLiveExecutorControlPlaneVerifierPassed",
  "providerWriteExecutionAttemptVisibilityVerifierPassed",
  "auditExportVerified",
  "postGraduatedRolloutReviewCompleted",
]);
const EVIDENCE_BOOLEAN_KEYS = [
  "providerWriteGraduatedRolloutPreflightVerifierPassed",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "productionAlertingVerifierPassed",
  "productionCanaryVerifierPassed",
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "providerWriteLiveExecutorControlPlaneVerifierPassed",
  "providerWriteExecutionAttemptVisibilityVerifierPassed",
  "auditExportVerified",
  "postGraduatedRolloutReviewCompleted",
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
const PREFLIGHT_SAFETY_KEYS = new Set([
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
const CLOSEOUT_REVIEW_SAFETY_KEYS = new Set([
  "secretsInReview",
  "rawTenantIdsInReview",
  "rawMerchantIdsInReview",
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
const GRADUATED_ROLLOUT_ACTIONS = new Set([
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
  let closeoutReview = null;
  let controlledRunLedger = null;

  if (hasValue(args.runLedger)) {
    const evidence = readJsonFile(
      args.runLedger,
      "provider write graduated rollout run ledger",
      RUN_LEDGER_ARTIFACT_DIR,
      "--run-ledger",
      "provider-write-graduated-rollout-run-ledger-artifacts",
    );
    if (evidence) {
      runLedger = evidence;
      validateRunLedger(runLedger.value, args);
    }
  } else if (args.requirePass) {
    failures.push("provider write graduated rollout run ledger evidence is required when pass evidence is required");
  }

  if (hasValue(args.preflight)) {
    preflight = readJsonFile(
      args.preflight,
      "provider write graduated rollout preflight",
      PREFLIGHT_ARTIFACT_DIR,
      "--preflight",
      "provider-write-graduated-rollout-preflight-artifacts",
    );
    if (preflight) validatePreflightSource(preflight.value, args);
  } else if (args.requirePass) {
    failures.push("provider write graduated rollout preflight evidence is required when pass evidence is required");
  }

  if (hasValue(args.preflightApproval)) {
    approval = readJsonFile(
      args.preflightApproval,
      "provider write graduated rollout preflight approval",
      APPROVAL_ARTIFACT_DIR,
      "--preflight-approval",
      "provider-write-graduated-rollout-approval-artifacts",
    );
    if (approval) validateApprovalSource(approval.value, args);
  } else if (args.requirePass) {
    failures.push("provider write graduated rollout preflight approval evidence is required when pass evidence is required");
  }

  if (hasValue(args.preflightCloseoutReview)) {
    closeoutReview = readJsonFile(
      args.preflightCloseoutReview,
      "provider write graduated rollout preflight closeout review",
      CLOSEOUT_REVIEW_ARTIFACT_DIR,
      "--preflight-closeout-review",
      "provider-write-controlled-expansion-closeout-review-artifacts",
    );
    if (closeoutReview) validateCloseoutReviewSource(closeoutReview.value);
  } else if (args.requirePass) {
    failures.push("provider write graduated rollout preflight closeout review evidence is required when pass evidence is required");
  }

  if (hasValue(args.preflightRunLedger)) {
    controlledRunLedger = readJsonFile(
      args.preflightRunLedger,
      "provider write graduated rollout preflight controlled run ledger",
      CONTROLLED_RUN_LEDGER_ARTIFACT_DIR,
      "--preflight-run-ledger",
      "provider-write-controlled-expansion-run-ledger-artifacts",
    );
    if (controlledRunLedger) validateControlledRunLedgerSource(controlledRunLedger.value);
  } else if (args.requirePass) {
    failures.push("provider write graduated rollout preflight controlled run ledger evidence is required when pass evidence is required");
  }

  if (runLedger && preflight) {
    validateRunLedgerPreflightBinding(runLedger.value, preflight.sha256);
    validateRunLedgerWithinPreflight(runLedger.value, preflight.value);
  }
  if (preflight && approval) {
    validatePreflightApprovalBinding(preflight.value, approval.sha256);
    validatePreflightWithinApproval(preflight.value, approval.value);
  }
  if (approval && closeoutReview) {
    validateApprovalCloseoutBinding(approval.value, closeoutReview);
  }
  if (closeoutReview && controlledRunLedger) {
    validateCloseoutControlledRunLedgerBinding(closeoutReview.value, controlledRunLedger);
  }

  if (failures.length > 0) {
    console.error("Provider write graduated rollout run ledger verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write graduated rollout run ledger verification passed.");
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
    runLedgerDocs: "docs/deploy/provider-write-graduated-rollout-run-ledger.md",
    preflightDocs: "docs/deploy/provider-write-graduated-rollout-preflight.md",
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
    "verify:provider-write-graduated-rollout-run-ledger:safe",
    "\"verify:provider-write-graduated-rollout-run-ledger:safe\": \"node scripts/verify-provider-write-graduated-rollout-run-ledger.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-graduated-rollout-run-ledger.mjs",
  ]);

  mustContainAll("provider write graduated rollout run ledger docs", content.runLedgerDocs, [
    "PR79 Provider Write Graduated Rollout Run Ledger Gate",
    "npm run verify:provider-write-graduated-rollout-run-ledger",
    "npm run verify:provider-write-graduated-rollout-run-ledger:safe",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_REQUIRE_PASS=true",
    "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1",
    "smart-cs-agent.provider-write-graduated-rollout-preflight.v1",
    "smart-cs-agent.provider-write-graduated-rollout-approval.v1",
    "smart-cs-agent.provider-write-controlled-expansion-closeout-review.v1",
    "smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1",
    "provider-write-graduated-rollout-run-ledger-artifacts/",
    "provider-write-graduated-rollout-preflight-artifacts/",
    "provider-write-graduated-rollout-approval-artifacts/",
    "provider-write-controlled-expansion-closeout-review-artifacts/",
    "provider-write-controlled-expansion-run-ledger-artifacts/",
    "graduated_multi_merchant",
    "providerWriteGraduatedRolloutPreflightVerifierPassed=true",
    "providerWriteGraduatedRolloutPreflightSha256",
    "providerWriteGraduatedRolloutApprovalSha256",
    "providerWriteControlledExpansionCloseoutReviewSha256",
    "providerWriteControlledExpansionRunLedgerSha256",
    "customerComplaintsStoppedRollout=true",
    "compensationRejectionsStoppedRollout=true",
    "merchantNotificationCompleted=true",
    "billingImpactReviewed=true",
    "supportSlaMaintained=true",
    "noAutoCustomerReplies=true",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not read production databases",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("preflight docs reference PR79 follow-on", content.preflightDocs, [
    "PR79 Provider Write Graduated Rollout Run Ledger Gate",
    "verify:provider-write-graduated-rollout-run-ledger",
    "providerWriteGraduatedRolloutPreflightSha256",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR79 Provider Write Graduated Rollout Run Ledger Gate",
    "verify:provider-write-graduated-rollout-run-ledger",
    "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1",
    "providerWriteGraduatedRolloutPreflightSha256",
    "graduated_multi_merchant",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_FILE",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR79 Provider Write Graduated Rollout Run Ledger Gate",
    "verify:provider-write-graduated-rollout-run-ledger",
    "providerWriteGraduatedRolloutPreflightVerifierPassed=true",
    "providerWriteGraduatedRolloutPreflightSha256",
    "graduated_multi_merchant",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "verify:provider-write-graduated-rollout-run-ledger",
    "verify:provider-write-graduated-rollout-run-ledger:safe",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-graduated-rollout-run-ledger.test.mjs",
    "npm run verify:provider-write-graduated-rollout-run-ledger",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-graduated-rollout-run-ledger.test.mjs",
    "npm run verify:provider-write-graduated-rollout-run-ledger",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "providerWriteGraduatedRolloutRunLedger",
    "verify-provider-write-graduated-rollout-run-ledger.mjs",
    "verify:provider-write-graduated-rollout-run-ledger",
    "provider write graduated rollout run ledger",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_FILE",
    "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1",
  ]);

  mustContainAll("task plan references PR79", content.taskPlan, [
    "PR79 - Provider Write Graduated Rollout Run Ledger Gate",
    "verify:provider-write-graduated-rollout-run-ledger",
  ]);

  mustContainAll("progress references PR79", content.progress, [
    "Started PR79 provider write graduated rollout run ledger gate",
  ]);

  mustContainAll("gitignore graduated rollout run ledger artifacts", content.gitignore, [
    "provider-write-graduated-rollout-run-ledger-artifacts/",
  ]);
}

function validateRunLedger(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write graduated rollout run ledger root must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    RUN_LEDGER_ROOT_KEYS,
    "provider write graduated rollout run ledger contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("generatedAt must be an ISO timestamp");
  validateTarget(value.target, "target", "graduated_multi_merchant");
  validateExpansionScope(value.expansionScope, "expansionScope");
  validateLaunchWindow(value.launchWindow);
  validateSummary(value.summary, value.runRecords, options);
  validateRunRecords(value.runRecords, value);
  validateEvidence(value.evidence, options);
  validateAllFalseObject(value.safety, SAFETY_KEYS, "safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write graduated rollout run ledger field",
    "forbidden sensitive provider write graduated rollout run ledger value",
  );
}

function validateTarget(target, label, rolloutTrack) {
  if (!isRecord(target)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(target, TARGET_KEYS, `${label} contains unsupported field`);
  validateFingerprint(`${label}.rolloutIdFingerprint`, target.rolloutIdFingerprint);
  if (target.rolloutTrack !== rolloutTrack) {
    failures.push(`${label}.rolloutTrack must be ${rolloutTrack}`);
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
    GRADUATED_ROLLOUT_ACTIONS,
    1,
    3,
  );
  validateIntegerInRange(`${label}.maxMerchants`, scope.maxMerchants, 1, 10);
  if (
    Array.isArray(scope.merchantFingerprints) &&
    Number.isInteger(scope.maxMerchants) &&
    scope.maxMerchants < scope.merchantFingerprints.length
  ) {
    failures.push(`${label}.maxMerchants must cover merchantFingerprints`);
  }
  validateIntegerInRange(`${label}.maxDailyProviderWrites`, scope.maxDailyProviderWrites, 1, 200);
  validateIntegerInRange(
    `${label}.maxDailyProviderWritesPerMerchant`,
    scope.maxDailyProviderWritesPerMerchant,
    1,
    25,
  );
  validateIntegerInRange(`${label}.maxCouponAmountCents`, scope.maxCouponAmountCents, 0, 5000);
  if (scope.businessHoursOnly !== true) failures.push(`${label}.businessHoursOnly must be true`);
}

function validateLaunchWindow(value) {
  if (!isRecord(value)) {
    failures.push("launchWindow must be an object");
    return;
  }
  validateAllowedKeys(value, LAUNCH_WINDOW_KEYS, "launchWindow contains unsupported field");
  if (!isIsoTimestamp(value.startsAt)) failures.push("launchWindow.startsAt must be an ISO timestamp");
  if (!isIsoTimestamp(value.endsAt)) failures.push("launchWindow.endsAt must be an ISO timestamp");
  if (!isIsoTimestamp(value.closedAt)) failures.push("launchWindow.closedAt must be an ISO timestamp");
  validateIntegerInRange("launchWindow.durationMinutes", value.durationMinutes, 30, 240);
  if (isIsoTimestamp(value.startsAt) && isIsoTimestamp(value.endsAt)) {
    const durationMinutes = (Date.parse(value.endsAt) - Date.parse(value.startsAt)) / 60000;
    if (durationMinutes !== value.durationMinutes) {
      failures.push("launchWindow.durationMinutes must match startsAt and endsAt");
    }
    if (durationMinutes <= 0) failures.push("launchWindow.endsAt must be after startsAt");
  }
  if (value.freezeWindowActive !== true) failures.push("launchWindow.freezeWindowActive must be true");
  if (value.businessHoursOnly !== true) failures.push("launchWindow.businessHoursOnly must be true");
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
    validateIntegerInRange(`summary.${key}`, summary[key], 0, 10000);
  }
  for (const key of [
    "allRunsReviewed",
    "failedRunsHaveIncidentNotes",
    "rollbackActionsVerified",
    "customerComplaintsStoppedRollout",
    "compensationRejectionsStoppedRollout",
    "merchantNotificationCompleted",
    "billingImpactReviewed",
    "supportSlaMaintained",
    "noAutoCustomerReplies",
  ]) {
    validateBoolean(`summary.${key}`, summary[key]);
    if ((options.requirePass || hasValue(options.runLedger)) && summary[key] !== true) {
      failures.push(`summary.${key} must be true`);
    }
  }

  if (!Array.isArray(runRecords)) return;
  const counts = countRunRecords(runRecords);
  if (summary.totalRuns !== runRecords.length) failures.push("summary.totalRuns must match runRecords length");
  if (summary.succeededRuns !== counts.succeeded) failures.push("summary.succeededRuns must match runRecords");
  if (summary.failedRuns !== counts.failed) failures.push("summary.failedRuns must match runRecords");
  if (summary.rolledBackRuns !== counts.rolled_back) failures.push("summary.rolledBackRuns must match runRecords");
  if (summary.blockedRuns !== counts.blocked) failures.push("summary.blockedRuns must match runRecords");
  if (summary.complaintCount !== counts.complaints) failures.push("summary.complaintCount must match runRecords");
  if (summary.customerRejectedCompensationCount !== counts.rejections) {
    failures.push("summary.customerRejectedCompensationCount must match runRecords");
  }
  if (summary.complaintCount > 0 && summary.customerComplaintsStoppedRollout !== true) {
    failures.push("summary.customerComplaintsStoppedRollout must be true when complaintCount is greater than 0");
  }
  if (
    summary.customerRejectedCompensationCount > 0 &&
    summary.compensationRejectionsStoppedRollout !== true
  ) {
    failures.push("summary.compensationRejectionsStoppedRollout must be true when customerRejectedCompensationCount is greater than 0");
  }
  const failedMutations = runRecords.some(
    (record) =>
      isRecord(record) &&
      record.status === "failed" &&
      record.providerMutationExecuted === true,
  );
  if (failedMutations && summary.rollbackActionsVerified !== true) {
    failures.push("summary.rollbackActionsVerified must be true when failed provider mutations exist");
  }
}

function validateRunRecords(records, ledger) {
  if (!Array.isArray(records)) {
    failures.push("runRecords must be an array");
    return;
  }
  if (records.length < 1 || records.length > 10000) {
    failures.push("runRecords must contain between 1 and 10000 records");
  }
  const fingerprints = [];
  const window = getLaunchWindowBounds(ledger.launchWindow);
  for (const [index, record] of records.entries()) {
    validateRunRecord(record, index, ledger, window);
    if (typeof record?.runFingerprint === "string") fingerprints.push(record.runFingerprint);
  }
  if (new Set(fingerprints).size !== fingerprints.length) {
    failures.push("runRecords.runFingerprint values must be unique");
  }
}

function validateRunRecord(record, index, ledger, window) {
  const label = `runRecords[${index}]`;
  if (!isRecord(record)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(record, RUN_RECORD_KEYS, `${label} contains unsupported field`);
  validateFingerprint(`${label}.merchantFingerprint`, record.merchantFingerprint);
  validateFingerprint(`${label}.requestFingerprint`, record.requestFingerprint);
  validateFingerprint(`${label}.executionAttemptFingerprint`, record.executionAttemptFingerprint);
  validateFingerprint(`${label}.operatorFingerprint`, record.operatorFingerprint);
  validateFingerprint(`${label}.reviewerFingerprint`, record.reviewerFingerprint);
  validateFingerprint(`${label}.rollbackOwnerFingerprint`, record.rollbackOwnerFingerprint);
  validateFingerprint(`${label}.billingOwnerFingerprint`, record.billingOwnerFingerprint);
  validateFingerprint(`${label}.supportOwnerFingerprint`, record.supportOwnerFingerprint);
  validateSha256(`${label}.runFingerprint`, record.runFingerprint);
  validateSha256(`${label}.auditLogSha256`, record.auditLogSha256);
  if (!CHANNELS.has(record.channel)) failures.push(`${label}.channel must be taobao or douyin`);
  if (!GRADUATED_ROLLOUT_ACTIONS.has(record.action)) failures.push(`${label}.action contains unsupported value`);
  if (!RISK_LEVELS.has(record.riskLevel)) failures.push(`${label}.riskLevel must be low, medium, or high`);
  if (!RUN_STATUSES.has(record.status)) failures.push(`${label}.status contains unsupported value`);
  if (!NETWORK_EXECUTION.has(record.networkExecution)) {
    failures.push(`${label}.networkExecution contains unsupported value`);
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
  if (record.networkExecution === "blocked_before_network" && record.providerMutationExecuted !== false) {
    failures.push(`${label}.providerMutationExecuted must be false when networkExecution is blocked_before_network`);
  }
  if (record.status === "failed" && record.providerMutationExecuted === true) {
    failures.push(`${label}.status cannot remain failed after providerMutationExecuted=true`);
  }
  if (!isIsoTimestamp(record.createdAt)) failures.push(`${label}.createdAt must be an ISO timestamp`);
  if (!isIsoTimestamp(record.completedAt)) failures.push(`${label}.completedAt must be an ISO timestamp`);
  if (
    isIsoTimestamp(record.createdAt) &&
    isIsoTimestamp(record.completedAt) &&
    Date.parse(record.completedAt) < Date.parse(record.createdAt)
  ) {
    failures.push(`${label}.completedAt must be after createdAt`);
  }
  if (window && isIsoTimestamp(record.createdAt) && !isTimestampInsideWindow(record.createdAt, window)) {
    failures.push(`${label}.createdAt must be inside launchWindow`);
  }
  const scope = ledger.expansionScope;
  if (isRecord(scope)) {
    if (!Array.isArray(scope.merchantFingerprints) || !scope.merchantFingerprints.includes(record.merchantFingerprint)) {
      failures.push(`${label}.merchantFingerprint must stay inside expansionScope.merchantFingerprints`);
    }
    if (!Array.isArray(scope.channels) || !scope.channels.includes(record.channel)) {
      failures.push(`${label}.channel must stay inside expansionScope.channels`);
    }
    if (!Array.isArray(scope.allowedActions) || !scope.allowedActions.includes(record.action)) {
      failures.push(`${label}.action must stay inside expansionScope.allowedActions`);
    }
  }
}

function validateEvidence(value, options) {
  if (!isRecord(value)) {
    failures.push("evidence must be an object");
    return;
  }
  validateAllowedKeys(value, EVIDENCE_KEYS, "evidence contains unsupported field");
  validateSha256(
    "evidence.providerWriteGraduatedRolloutPreflightSha256",
    value.providerWriteGraduatedRolloutPreflightSha256,
  );
  for (const key of EVIDENCE_BOOLEAN_KEYS) {
    validateBoolean(`evidence.${key}`, value[key]);
    if ((options.requirePass || hasValue(options.runLedger)) && value[key] !== true) {
      failures.push(`evidence.${key} must be true`);
    }
  }
}

function validatePreflightSource(value, options) {
  if (!isRecord(value)) {
    failures.push("preflight root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-graduated-rollout-preflight.v1") {
    failures.push("preflight.schemaVersion must be smart-cs-agent.provider-write-graduated-rollout-preflight.v1");
  }
  validateTarget(value.target, "preflight.target", "graduated_multi_merchant");
  validateExpansionScope(value.expansionScope, "preflight.expansionScope");
  if (value.prerequisiteEvidence?.providerWriteGraduatedRolloutApprovalVerifierPassed !== true) {
    failures.push("preflight.prerequisiteEvidence.providerWriteGraduatedRolloutApprovalVerifierPassed must be true");
  }
  validateSha256(
    "preflight.prerequisiteEvidence.providerWriteGraduatedRolloutApprovalSha256",
    value.prerequisiteEvidence?.providerWriteGraduatedRolloutApprovalSha256,
  );
  if (value.rolloutPlan?.automaticNextWaveEnabled !== false) {
    failures.push("preflight.rolloutPlan.automaticNextWaveEnabled must be false");
  }
  if (value.rolloutPlan?.manualApprovalBeforeNextWave !== true) {
    failures.push("preflight.rolloutPlan.manualApprovalBeforeNextWave must be true");
  }
  if (value.rolloutPlan?.rollbackOnAnyFailedMutation !== true) {
    failures.push("preflight.rolloutPlan.rollbackOnAnyFailedMutation must be true");
  }
  if (value.rolloutPlan?.stopOnRejectedCompensation !== true) {
    failures.push("preflight.rolloutPlan.stopOnRejectedCompensation must be true");
  }
  validateAllFalseObject(value.safety, PREFLIGHT_SAFETY_KEYS, "preflight.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write graduated rollout run ledger field",
    "forbidden sensitive provider write graduated rollout run ledger value",
  );
  if ((options.requirePass || hasValue(options.preflight)) && value.operationalControls?.noAutomaticCustomerVisibleReplies !== true) {
    failures.push("preflight.operationalControls.noAutomaticCustomerVisibleReplies must be true");
  }
}

function validateApprovalSource(value, options) {
  if (!isRecord(value)) {
    failures.push("approval root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-graduated-rollout-approval.v1") {
    failures.push("approval.schemaVersion must be smart-cs-agent.provider-write-graduated-rollout-approval.v1");
  }
  if (value.target?.fromRolloutTrack !== "controlled_multi_merchant") {
    failures.push("approval.target.fromRolloutTrack must be controlled_multi_merchant");
  }
  if (value.target?.toRolloutTrack !== "graduated_multi_merchant") {
    failures.push("approval.target.toRolloutTrack must be graduated_multi_merchant");
  }
  validateTarget(
    {
      rolloutIdFingerprint: value.target?.rolloutIdFingerprint,
      rolloutTrack: value.target?.toRolloutTrack,
      changeTicket: value.target?.changeTicket,
    },
    "approval.target",
    "graduated_multi_merchant",
  );
  if (value.approval?.approvalStatus !== "approved") {
    failures.push("approval.approvalStatus must be approved");
  }
  validateSha256(
    "approval.prerequisiteEvidence.providerWriteControlledExpansionCloseoutReviewSha256",
    value.prerequisiteEvidence?.providerWriteControlledExpansionCloseoutReviewSha256,
  );
  validateAllFalseObject(value.safety, PREFLIGHT_SAFETY_KEYS, "approval.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write graduated rollout run ledger field",
    "forbidden sensitive provider write graduated rollout run ledger value",
  );
  if ((options.requirePass || hasValue(options.preflightApproval)) && value.operationalControls?.noAutomaticCustomerVisibleReplies !== true) {
    failures.push("approval.operationalControls.noAutomaticCustomerVisibleReplies must be true");
  }
}

function validateCloseoutReviewSource(value) {
  if (!isRecord(value)) {
    failures.push("closeout review root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-controlled-expansion-closeout-review.v1") {
    failures.push("closeout review.schemaVersion must be smart-cs-agent.provider-write-controlled-expansion-closeout-review.v1");
  }
  validateTarget(value.target, "closeout review.target", "controlled_multi_merchant");
  if (value.runSummary?.allRunsReviewed !== true) {
    failures.push("closeout review.runSummary.allRunsReviewed must be true");
  }
  if (value.runSummary?.customerComplaintsStoppedRollout !== true) {
    failures.push("closeout review.runSummary.customerComplaintsStoppedRollout must be true");
  }
  if (value.runSummary?.rejectedCompensationReviewed !== true) {
    failures.push("closeout review.runSummary.rejectedCompensationReviewed must be true");
  }
  if (value.runSummary?.noAutoCustomerReplies !== true) {
    failures.push("closeout review.runSummary.noAutoCustomerReplies must be true");
  }
  if (value.closeout?.decision !== "approved_for_next_expansion_review") {
    failures.push("closeout review.closeout.decision must be approved_for_next_expansion_review");
  }
  if (!Array.isArray(value.closeout?.outstandingActions)) {
    failures.push("closeout review.closeout.outstandingActions must be an array");
  } else if (value.closeout.outstandingActions.length > 0) {
    failures.push("closeout review.closeout.outstandingActions must be empty");
  }
  validateSha256(
    "closeout review artifactBindings.providerWriteControlledExpansionRunLedgerSha256",
    value.artifactBindings?.providerWriteControlledExpansionRunLedgerSha256,
  );
  validateAllFalseObject(value.safety, CLOSEOUT_REVIEW_SAFETY_KEYS, "closeout review.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write graduated rollout run ledger field",
    "forbidden sensitive provider write graduated rollout run ledger value",
  );
}

function validateControlledRunLedgerSource(value) {
  if (!isRecord(value)) {
    failures.push("controlled run ledger root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1") {
    failures.push("controlled run ledger.schemaVersion must be smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1");
  }
  validateTarget(value.target, "controlled run ledger.target", "controlled_multi_merchant");
  if (value.summary?.allRunsReviewed !== true) {
    failures.push("controlled run ledger.summary.allRunsReviewed must be true");
  }
  if (value.summary?.customerComplaintsStoppedRollout !== true) {
    failures.push("controlled run ledger.summary.customerComplaintsStoppedRollout must be true");
  }
  if (value.summary?.noAutoCustomerReplies !== true) {
    failures.push("controlled run ledger.summary.noAutoCustomerReplies must be true");
  }
  validateAllFalseObject(value.safety, SAFETY_KEYS, "controlled run ledger.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write graduated rollout run ledger field",
    "forbidden sensitive provider write graduated rollout run ledger value",
  );
}

function validateRunLedgerPreflightBinding(runLedger, preflightSha256) {
  if (runLedger?.evidence?.providerWriteGraduatedRolloutPreflightSha256 !== preflightSha256) {
    failures.push("evidence.providerWriteGraduatedRolloutPreflightSha256 must match the preflight file sha256");
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
    for (const key of [
      "maxMerchants",
      "maxDailyProviderWrites",
      "maxDailyProviderWritesPerMerchant",
      "maxCouponAmountCents",
    ]) {
      if (
        Number.isInteger(runScope[key]) &&
        Number.isInteger(preflightScope[key]) &&
        runScope[key] > preflightScope[key]
      ) {
        failures.push(`expansionScope.${key} must not exceed preflight limit`);
      }
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
    preflight?.prerequisiteEvidence?.providerWriteGraduatedRolloutApprovalSha256 !==
    approvalSha256
  ) {
    failures.push("preflight.prerequisiteEvidence.providerWriteGraduatedRolloutApprovalSha256 must match the approval file sha256");
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

function validateApprovalCloseoutBinding(approval, closeoutReview) {
  if (
    approval?.prerequisiteEvidence?.providerWriteControlledExpansionCloseoutReviewSha256 !==
    closeoutReview.sha256
  ) {
    failures.push("approval prerequisiteEvidence.providerWriteControlledExpansionCloseoutReviewSha256 must match the closeout review file sha256");
  }
  if (!isRecord(approval) || !isRecord(closeoutReview.value)) return;
  if (approval.target?.rolloutIdFingerprint !== closeoutReview.value.target?.rolloutIdFingerprint) {
    failures.push("approval target.rolloutIdFingerprint must match closeout review target.rolloutIdFingerprint");
  }
  if (approval.target?.fromRolloutTrack !== closeoutReview.value.target?.rolloutTrack) {
    failures.push("approval target.fromRolloutTrack must match closeout review target.rolloutTrack");
  }
  if (approval.target?.changeTicket !== closeoutReview.value.target?.changeTicket) {
    failures.push("approval target.changeTicket must match closeout review target.changeTicket");
  }
}

function validateCloseoutControlledRunLedgerBinding(closeoutReview, controlledRunLedger) {
  if (
    closeoutReview?.artifactBindings?.providerWriteControlledExpansionRunLedgerSha256 !==
    controlledRunLedger.sha256
  ) {
    failures.push("closeout review artifactBindings.providerWriteControlledExpansionRunLedgerSha256 must match the controlled run ledger file sha256");
  }
  if (!isRecord(closeoutReview) || !isRecord(controlledRunLedger.value)) return;
  if (closeoutReview.target?.rolloutIdFingerprint !== controlledRunLedger.value.target?.rolloutIdFingerprint) {
    failures.push("closeout review target.rolloutIdFingerprint must match controlled run ledger target.rolloutIdFingerprint");
  }
  if (closeoutReview.target?.rolloutTrack !== controlledRunLedger.value.target?.rolloutTrack) {
    failures.push("closeout review target.rolloutTrack must match controlled run ledger target.rolloutTrack");
  }
  if (closeoutReview.target?.changeTicket !== controlledRunLedger.value.target?.changeTicket) {
    failures.push("closeout review target.changeTicket must match controlled run ledger target.changeTicket");
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
    preflightCloseoutReview: undefined,
    preflightRunLedger: undefined,
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
    if (arg.startsWith("--preflight-closeout-review=")) {
      args.preflightCloseoutReview = arg.slice("--preflight-closeout-review=".length);
      continue;
    }
    if (arg.startsWith("--preflight-run-ledger=")) {
      args.preflightRunLedger = arg.slice("--preflight-run-ledger=".length);
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
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_FILE,
    preflight:
      args.preflight ??
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_FILE,
    preflightApproval:
      args.preflightApproval ??
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE,
    preflightCloseoutReview:
      args.preflightCloseoutReview ??
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_CLOSEOUT_REVIEW_FILE,
    preflightRunLedger:
      args.preflightRunLedger ??
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_RUN_LEDGER_FILE,
    requirePass:
      args.requirePass ||
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_REQUIRE_PASS === "true",
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
