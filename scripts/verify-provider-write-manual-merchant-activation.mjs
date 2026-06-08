import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const COMMAND_NAME = "verify:provider-write-manual-merchant-activation";
const MAX_EVIDENCE_BYTES = 512 * 1024;
const ACTIVATION_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-manual-merchant-activation-artifacts",
);
const APPROVAL_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-general-availability-approval-artifacts",
);
const CLOSEOUT_REVIEW_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-graduated-rollout-closeout-review-artifacts",
);
const RUN_LEDGER_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-graduated-rollout-run-ledger-artifacts",
);

const ACTIVATION_ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "merchantScope",
  "activation",
  "prerequisiteEvidence",
  "launchControls",
  "artifactBindings",
  "safety",
]);
const TARGET_KEYS = new Set([
  "rolloutIdFingerprint",
  "rolloutTrack",
  "merchantFingerprint",
  "channel",
  "changeTicket",
]);
const APPROVAL_TARGET_KEYS = new Set([
  "rolloutIdFingerprint",
  "fromRolloutTrack",
  "toRolloutTrack",
  "changeTicket",
]);
const SOURCE_TARGET_KEYS = new Set([
  "rolloutIdFingerprint",
  "rolloutTrack",
  "changeTicket",
]);
const MERCHANT_SCOPE_KEYS = new Set([
  "merchantFingerprint",
  "channel",
  "allowedActions",
  "maxDailyProviderWrites",
  "maxCouponAmountCents",
  "businessHoursOnly",
]);
const ACTIVATION_KEYS = new Set([
  "activationStatus",
  "requestedByFingerprint",
  "activatedByFingerprint",
  "securityReviewerFingerprint",
  "operationsReviewerFingerprint",
  "merchantSuccessReviewerFingerprint",
  "activatedAt",
  "secondReviewCompleted",
]);
const ACTIVATION_STATUSES = new Set([
  "approved_for_manual_activation",
  "rejected_needs_investigation",
]);
const PREREQUISITE_EVIDENCE_KEYS = new Set([
  "providerWriteGeneralAvailabilityApprovalVerifierPassed",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "providerWriteLiveExecutorControlPlaneVerifierPassed",
  "providerWriteExecutionAttemptVisibilityVerifierPassed",
]);
const LAUNCH_CONTROL_KEYS = new Set([
  "automaticActivationEnabled",
  "automaticNextMerchantEnabled",
  "manualApprovalBeforeProviderWrites",
  "liveExecutorKillSwitchDefaultOn",
  "noAutomaticCustomerVisibleReplies",
  "perMerchantRollbackReady",
  "rollbackOnAnyFailedMutation",
  "stopOnCustomerComplaint",
  "stopOnRejectedCompensation",
]);
const ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteGeneralAvailabilityApprovalSha256",
  "auditExportSha256",
  "productionLaunchSha256",
  "productionStaticCiSha256",
]);
const APPROVAL_SOURCE_ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "expansionScope",
  "approval",
  "prerequisiteEvidence",
  "operationalControls",
  "commercialReadiness",
  "rolloutControls",
  "artifactBindings",
  "safety",
]);
const APPROVAL_SOURCE_EXPANSION_SCOPE_KEYS = new Set([
  "merchantFingerprints",
  "channels",
  "allowedActions",
  "maxMerchants",
  "maxDailyProviderWrites",
  "maxDailyProviderWritesPerMerchant",
  "maxCouponAmountCents",
  "businessHoursOnly",
  "automaticActivationEnabled",
  "manualMerchantActivationRequired",
]);
const APPROVAL_SOURCE_APPROVAL_KEYS = new Set([
  "approvalStatus",
  "requestedByFingerprint",
  "approvedByFingerprint",
  "securityReviewerFingerprint",
  "operationsReviewerFingerprint",
  "commercialReviewerFingerprint",
  "approvedAt",
  "secondReviewCompleted",
]);
const APPROVAL_SOURCE_PREREQUISITE_KEYS = new Set([
  "providerWriteGraduatedRolloutCloseoutReviewVerifierPassed",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "productionBranchProtectionVerifierPassed",
  "productionAlertingVerifierPassed",
  "productionCanaryVerifierPassed",
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "providerWriteLiveExecutorControlPlaneVerifierPassed",
  "providerWriteExecutionAttemptVisibilityVerifierPassed",
]);
const APPROVAL_SOURCE_OPERATIONAL_CONTROL_KEYS = new Set([
  "operatorCoverageMinutes",
  "namedOpsLeadFingerprint",
  "incidentOwnerFingerprint",
  "rollbackOwnerFingerprint",
  "killSwitchOwnerFingerprint",
  "billingOwnerFingerprint",
  "supportOwnerFingerprint",
  "merchantSuccessOwnerFingerprint",
  "rollbackPlaybookReviewed",
  "alertRoutesReviewed",
  "rateLimitReviewed",
  "supportEscalationReady",
  "merchantNotificationPlanReady",
  "noAutomaticCustomerVisibleReplies",
  "liveExecutorKillSwitchDefaultOn",
  "perMerchantActivationRequired",
]);
const APPROVAL_SOURCE_COMMERCIAL_READINESS_KEYS = new Set([
  "customerContractReviewed",
  "billingPlanConfigured",
  "supportSlaReviewed",
  "merchantNotificationPlanReviewed",
  "pricingReviewed",
  "legalReviewCompleted",
  "dataRetentionReviewed",
]);
const APPROVAL_SOURCE_ROLLOUT_CONTROL_KEYS = new Set([
  "automaticActivationEnabled",
  "automaticNextWaveEnabled",
  "manualApprovalBeforeMerchantActivation",
  "rollbackOnAnyFailedMutation",
  "stopOnCustomerComplaint",
  "stopOnRejectedCompensation",
  "generalAvailabilityBroadcastReady",
]);
const APPROVAL_SOURCE_ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteGraduatedRolloutCloseoutReviewSha256",
  "auditExportSha256",
  "productionLaunchSha256",
  "productionStaticCiSha256",
]);
const CLOSEOUT_SOURCE_ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "expansionScope",
  "launchWindow",
  "runSummary",
  "reviewers",
  "closeout",
  "evidence",
  "artifactBindings",
  "safety",
]);
const SOURCE_EXPANSION_SCOPE_KEYS = new Set([
  "merchantFingerprints",
  "channels",
  "allowedActions",
  "maxMerchants",
  "maxDailyProviderWrites",
  "maxDailyProviderWritesPerMerchant",
  "maxCouponAmountCents",
  "businessHoursOnly",
]);
const SOURCE_LAUNCH_WINDOW_KEYS = new Set([
  "startsAt",
  "endsAt",
  "closedAt",
  "durationMinutes",
  "freezeWindowActive",
  "businessHoursOnly",
]);
const CLOSEOUT_SOURCE_RUN_SUMMARY_KEYS = new Set([
  "totalRuns",
  "succeededRuns",
  "failedRuns",
  "rolledBackRuns",
  "blockedRuns",
  "failedProviderMutationRuns",
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
const CLOSEOUT_SOURCE_REVIEWER_KEYS = new Set([
  "releaseOwnerFingerprint",
  "operationsReviewerFingerprint",
  "supportReviewerFingerprint",
  "rollbackOwnerFingerprint",
  "reviewedAt",
  "secondReviewCompleted",
]);
const CLOSEOUT_SOURCE_CLOSEOUT_KEYS = new Set([
  "decision",
  "customerImpactReviewed",
  "providerMutationReviewCompleted",
  "complaintReviewCompleted",
  "compensationRejectionReviewCompleted",
  "incidentReviewCompleted",
  "rollbackReviewCompleted",
  "billingImpactReviewed",
  "merchantNotificationReviewed",
  "supportSlaReviewed",
  "evidencePackageReviewed",
  "outstandingActions",
]);
const CLOSEOUT_SOURCE_EVIDENCE_KEYS = new Set([
  "graduatedRolloutRunLedgerVerifierPassed",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "productionAlertingVerifierPassed",
  "productionCanaryVerifierPassed",
  "auditExportReviewed",
  "supportEscalationReviewCompleted",
  "merchantNotificationReviewCompleted",
]);
const CLOSEOUT_SOURCE_ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteGraduatedRolloutRunLedgerSha256",
  "auditExportSha256",
  "productionLaunchSha256",
  "productionStaticCiSha256",
]);
const RUN_LEDGER_SOURCE_ROOT_KEYS = new Set([
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
const RUN_LEDGER_SOURCE_SUMMARY_KEYS = new Set([
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
const RUN_LEDGER_SOURCE_RUN_RECORD_KEYS = new Set([
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
const RUN_LEDGER_SOURCE_EVIDENCE_KEYS = new Set([
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
const REVIEW_SAFETY_KEYS = new Set([
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
const LEDGER_SAFETY_KEYS = new Set([
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
const CHANNELS = new Set(["taobao", "douyin"]);
const LOW_RISK_ACTIONS = new Set([
  "modify_address",
  "issue_coupon",
  "urge_logistics",
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

  let activation = null;
  let approval = null;
  let closeoutReview = null;
  let runLedger = null;

  if (hasValue(args.activation)) {
    activation = readJsonFile(
      args.activation,
      "provider write manual merchant activation",
      ACTIVATION_ARTIFACT_DIR,
      "--activation",
      "provider-write-manual-merchant-activation-artifacts",
    );
    if (activation) validateActivation(activation.value, args);
  } else if (args.requirePass) {
    failures.push("provider write manual merchant activation evidence is required when pass evidence is required");
  }

  if (hasValue(args.approval)) {
    approval = readJsonFile(
      args.approval,
      "provider write general availability approval",
      APPROVAL_ARTIFACT_DIR,
      "--approval",
      "provider-write-general-availability-approval-artifacts",
    );
    if (approval) validateApprovalSource(approval.value);
  } else if (args.requirePass) {
    failures.push("provider write general availability approval evidence is required when pass evidence is required");
  }

  if (hasValue(args.closeoutReview)) {
    closeoutReview = readJsonFile(
      args.closeoutReview,
      "provider write graduated rollout closeout review",
      CLOSEOUT_REVIEW_ARTIFACT_DIR,
      "--closeout-review",
      "provider-write-graduated-rollout-closeout-review-artifacts",
    );
    if (closeoutReview) validateCloseoutReviewSource(closeoutReview.value);
  } else if (args.requirePass) {
    failures.push("provider write graduated rollout closeout review evidence is required when pass evidence is required");
  }

  if (hasValue(args.runLedger)) {
    runLedger = readJsonFile(
      args.runLedger,
      "provider write graduated rollout run ledger",
      RUN_LEDGER_ARTIFACT_DIR,
      "--run-ledger",
      "provider-write-graduated-rollout-run-ledger-artifacts",
    );
    if (runLedger) validateRunLedgerSource(runLedger.value);
  } else if (args.requirePass) {
    failures.push("provider write graduated rollout run ledger evidence is required when pass evidence is required");
  }

  if (activation && approval) validateActivationApprovalBinding(activation.value, approval);
  if (approval && closeoutReview) validateApprovalCloseoutBinding(approval.value, closeoutReview);
  if (closeoutReview && runLedger) validateCloseoutRunLedgerBinding(closeoutReview.value, runLedger);

  if (failures.length > 0) {
    console.error("Provider write manual merchant activation verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write manual merchant activation verification passed.");
  if (activation) {
    console.log(`- merchant=${activation.value.target.merchantFingerprint}`);
    console.log("- activation=verified");
  } else {
    console.log("- activation=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    gitignore: ".gitignore",
    activationDocs: "docs/deploy/provider-write-manual-merchant-activation.md",
    approvalDocs: "docs/deploy/provider-write-general-availability-approval.md",
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
    "verify:provider-write-manual-merchant-activation:safe",
    "\"verify:provider-write-manual-merchant-activation:safe\": \"node scripts/verify-provider-write-manual-merchant-activation.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-manual-merchant-activation.mjs",
  ]);

  mustContainAll("provider write manual merchant activation docs", content.activationDocs, [
    "PR82 Provider Write Manual Merchant Activation Gate",
    "npm run verify:provider-write-manual-merchant-activation",
    "npm run verify:provider-write-manual-merchant-activation:safe",
    "SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_FILE",
    "SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_REQUIRE_PASS=true",
    "smart-cs-agent.provider-write-manual-merchant-activation.v1",
    "smart-cs-agent.provider-write-general-availability-approval.v1",
    "smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1",
    "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1",
    "provider-write-manual-merchant-activation-artifacts/",
    "provider-write-general-availability-approval-artifacts/",
    "providerWriteGeneralAvailabilityApprovalSha256",
    "providerWriteGraduatedRolloutCloseoutReviewSha256",
    "providerWriteGraduatedRolloutRunLedgerSha256",
    "general_availability",
    "approved_for_manual_activation",
    "automaticActivationEnabled=false",
    "automaticNextMerchantEnabled=false",
    "manualApprovalBeforeProviderWrites=true",
    "noAutomaticCustomerVisibleReplies=true",
    "liveExecutorKillSwitchDefaultOn=true",
    "does not enable provider writes",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not read production databases",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("general availability approval docs reference manual merchant activation", content.approvalDocs, [
    "PR82 Provider Write Manual Merchant Activation Gate",
    "verify:provider-write-manual-merchant-activation",
    "providerWriteGeneralAvailabilityApprovalSha256",
    "manual merchant activation",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR82 Provider Write Manual Merchant Activation Gate",
    "verify:provider-write-manual-merchant-activation",
    "smart-cs-agent.provider-write-manual-merchant-activation.v1",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR82 Provider Write Manual Merchant Activation Gate",
    "verify:provider-write-manual-merchant-activation",
    "providerWriteGeneralAvailabilityApprovalSha256",
    "manualApprovalBeforeProviderWrites=true",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "verify:provider-write-manual-merchant-activation",
    "verify:provider-write-manual-merchant-activation:safe",
    "SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_FILE",
    "SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-manual-merchant-activation.test.mjs",
    "npm run verify:provider-write-manual-merchant-activation",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-manual-merchant-activation.test.mjs",
    "npm run verify:provider-write-manual-merchant-activation",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "providerWriteManualMerchantActivation",
    "verify-provider-write-manual-merchant-activation.mjs",
    "verify:provider-write-manual-merchant-activation",
    "provider write manual merchant activation",
    "SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_FILE",
    "smart-cs-agent.provider-write-manual-merchant-activation.v1",
  ]);

  mustContainAll("task plan manual merchant activation", content.taskPlan, [
    "PR82 - Provider Write Manual Merchant Activation Gate",
    "verify:provider-write-manual-merchant-activation",
  ]);

  mustContainAll("progress manual merchant activation", content.progress, [
    "Started PR82 provider write manual merchant activation gate",
  ]);

  mustContainAll("gitignore manual merchant activation artifacts", content.gitignore, [
    "provider-write-manual-merchant-activation-artifacts/",
  ]);
}

function validateActivation(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write manual merchant activation root must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    ACTIVATION_ROOT_KEYS,
    "provider write manual merchant activation contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-manual-merchant-activation.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-manual-merchant-activation.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("generatedAt must be an ISO timestamp");
  validateTarget(value.target);
  validateMerchantScope(value.merchantScope);
  validateActivationSection(value.activation, options);
  validateAllTrueObject(value.prerequisiteEvidence, PREREQUISITE_EVIDENCE_KEYS, "prerequisiteEvidence", options);
  validateLaunchControls(value.launchControls, options);
  validateArtifactBindings(value.artifactBindings);
  validateAllFalseObject(value.safety, SAFETY_KEYS, "safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write manual merchant activation field",
    "forbidden sensitive provider write manual merchant activation value",
  );
}

function validateTarget(target) {
  if (!isRecord(target)) {
    failures.push("target must be an object");
    return;
  }
  validateAllowedKeys(target, TARGET_KEYS, "target contains unsupported field");
  validateFingerprint("target.rolloutIdFingerprint", target.rolloutIdFingerprint);
  if (target.rolloutTrack !== "general_availability") {
    failures.push("target.rolloutTrack must be general_availability");
  }
  validateFingerprint("target.merchantFingerprint", target.merchantFingerprint);
  if (!CHANNELS.has(target.channel)) failures.push("target.channel contains unsupported value");
  validateChangeTicket("target.changeTicket", target.changeTicket);
}

function validateMerchantScope(scope) {
  if (!isRecord(scope)) {
    failures.push("merchantScope must be an object");
    return;
  }
  validateAllowedKeys(scope, MERCHANT_SCOPE_KEYS, "merchantScope contains unsupported field");
  validateFingerprint("merchantScope.merchantFingerprint", scope.merchantFingerprint);
  if (!CHANNELS.has(scope.channel)) failures.push("merchantScope.channel contains unsupported value");
  validateEnumArray("merchantScope.allowedActions", scope.allowedActions, LOW_RISK_ACTIONS, 1, 3);
  validateIntegerInRange("merchantScope.maxDailyProviderWrites", scope.maxDailyProviderWrites, 1, 500);
  validateIntegerInRange("merchantScope.maxCouponAmountCents", scope.maxCouponAmountCents, 0, 5000);
  if (scope.businessHoursOnly !== true) failures.push("merchantScope.businessHoursOnly must be true");
}

function validateActivationSection(activation, options) {
  if (!isRecord(activation)) {
    failures.push("activation must be an object");
    return;
  }
  validateAllowedKeys(activation, ACTIVATION_KEYS, "activation contains unsupported field");
  if (!ACTIVATION_STATUSES.has(activation.activationStatus)) {
    failures.push("activation.activationStatus must be approved_for_manual_activation or rejected_needs_investigation");
  }
  if (options.requirePass && activation.activationStatus !== "approved_for_manual_activation") {
    failures.push("activation.activationStatus must be approved_for_manual_activation");
  }
  for (const key of [
    "requestedByFingerprint",
    "activatedByFingerprint",
    "securityReviewerFingerprint",
    "operationsReviewerFingerprint",
    "merchantSuccessReviewerFingerprint",
  ]) {
    validateFingerprint(`activation.${key}`, activation[key]);
  }
  const reviewers = [
    activation.requestedByFingerprint,
    activation.activatedByFingerprint,
    activation.securityReviewerFingerprint,
    activation.operationsReviewerFingerprint,
    activation.merchantSuccessReviewerFingerprint,
  ].filter((item) => typeof item === "string");
  if (new Set(reviewers).size !== reviewers.length) {
    failures.push("activation reviewers must be distinct");
  }
  if (!isIsoTimestamp(activation.activatedAt)) failures.push("activation.activatedAt must be an ISO timestamp");
  validateBoolean("activation.secondReviewCompleted", activation.secondReviewCompleted);
  if ((options.requirePass || hasValue(options.activation)) && activation.secondReviewCompleted !== true) {
    failures.push("activation.secondReviewCompleted must be true");
  }
}

function validateLaunchControls(value, options) {
  if (!isRecord(value)) {
    failures.push("launchControls must be an object");
    return;
  }
  validateAllowedKeys(value, LAUNCH_CONTROL_KEYS, "launchControls contains unsupported field");
  for (const key of LAUNCH_CONTROL_KEYS) validateBoolean(`launchControls.${key}`, value[key]);
  if (value.automaticActivationEnabled !== false) {
    failures.push("launchControls.automaticActivationEnabled must be false");
  }
  if (value.automaticNextMerchantEnabled !== false) {
    failures.push("launchControls.automaticNextMerchantEnabled must be false");
  }
  for (const key of [
    "manualApprovalBeforeProviderWrites",
    "liveExecutorKillSwitchDefaultOn",
    "noAutomaticCustomerVisibleReplies",
    "perMerchantRollbackReady",
    "rollbackOnAnyFailedMutation",
    "stopOnCustomerComplaint",
    "stopOnRejectedCompensation",
  ]) {
    if ((options.requirePass || hasValue(options.activation)) && value[key] !== true) {
      failures.push(`launchControls.${key} must be true`);
    }
  }
}

function validateArtifactBindings(value) {
  if (!isRecord(value)) {
    failures.push("artifactBindings must be an object");
    return;
  }
  validateAllowedKeys(value, ARTIFACT_BINDING_KEYS, "artifactBindings contains unsupported field");
  const hashes = [];
  for (const key of ARTIFACT_BINDING_KEYS) {
    validateSha256(`artifactBindings.${key}`, value[key]);
    if (typeof value[key] === "string") hashes.push(value[key]);
  }
  if (hashes.length === ARTIFACT_BINDING_KEYS.size && new Set(hashes).size !== hashes.length) {
    failures.push("artifactBindings hashes must be distinct");
  }
}

function validateApprovalSource(value) {
  if (!isRecord(value)) {
    failures.push("approval root must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_SOURCE_ROOT_KEYS,
    "approval root contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-general-availability-approval.v1") {
    failures.push("approval.schemaVersion must be smart-cs-agent.provider-write-general-availability-approval.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("approval.generatedAt must be an ISO timestamp");
  validateApprovalTarget(value.target);
  validateApprovalSourceExpansionScope(value.expansionScope);
  validateApprovalSourceApproval(value.approval);
  validateRequiredTrueObject(
    value.prerequisiteEvidence,
    APPROVAL_SOURCE_PREREQUISITE_KEYS,
    "approval.prerequisiteEvidence",
  );
  validateApprovalSourceOperationalControls(value.operationalControls);
  validateRequiredTrueObject(
    value.commercialReadiness,
    APPROVAL_SOURCE_COMMERCIAL_READINESS_KEYS,
    "approval.commercialReadiness",
  );
  validateApprovalSourceRolloutControls(value.rolloutControls);
  validateSourceArtifactBindings(
    value.artifactBindings,
    APPROVAL_SOURCE_ARTIFACT_BINDING_KEYS,
    "approval.artifactBindings",
  );
  validateAllFalseObject(value.safety, SAFETY_KEYS, "approval.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write manual merchant activation field",
    "forbidden sensitive provider write manual merchant activation value",
  );
}

function validateApprovalSourceExpansionScope(scope) {
  if (!isRecord(scope)) {
    failures.push("approval.expansionScope must be an object");
    return;
  }
  validateAllowedKeys(
    scope,
    APPROVAL_SOURCE_EXPANSION_SCOPE_KEYS,
    "approval.expansionScope contains unsupported field",
  );
  validateFingerprintArray("approval.expansionScope.merchantFingerprints", scope.merchantFingerprints, 3, 50);
  validateEnumArray("approval.expansionScope.channels", scope.channels, CHANNELS, 1, 2);
  validateEnumArray("approval.expansionScope.allowedActions", scope.allowedActions, LOW_RISK_ACTIONS, 1, 3);
  validateIntegerInRange("approval.expansionScope.maxMerchants", scope.maxMerchants, 3, 50);
  if (
    Array.isArray(scope.merchantFingerprints) &&
    Number.isInteger(scope.maxMerchants) &&
    scope.maxMerchants < scope.merchantFingerprints.length
  ) {
    failures.push("approval.expansionScope.maxMerchants must cover merchantFingerprints");
  }
  validateIntegerInRange("approval.expansionScope.maxDailyProviderWrites", scope.maxDailyProviderWrites, 1, 500);
  validateIntegerInRange(
    "approval.expansionScope.maxDailyProviderWritesPerMerchant",
    scope.maxDailyProviderWritesPerMerchant,
    1,
    50,
  );
  validateIntegerInRange("approval.expansionScope.maxCouponAmountCents", scope.maxCouponAmountCents, 0, 5000);
  if (scope.businessHoursOnly !== true) failures.push("approval.expansionScope.businessHoursOnly must be true");
  if (scope.automaticActivationEnabled !== false) {
    failures.push("approval.expansionScope.automaticActivationEnabled must be false");
  }
  if (scope.manualMerchantActivationRequired !== true) {
    failures.push("approval.expansionScope.manualMerchantActivationRequired must be true");
  }
}

function validateApprovalSourceApproval(approval) {
  if (!isRecord(approval)) {
    failures.push("approval.approval must be an object");
    return;
  }
  validateAllowedKeys(approval, APPROVAL_SOURCE_APPROVAL_KEYS, "approval.approval contains unsupported field");
  if (approval.approvalStatus !== "approved") {
    failures.push("approval.approval.approvalStatus must be approved");
  }
  for (const key of [
    "requestedByFingerprint",
    "approvedByFingerprint",
    "securityReviewerFingerprint",
    "operationsReviewerFingerprint",
    "commercialReviewerFingerprint",
  ]) {
    validateFingerprint(`approval.approval.${key}`, approval[key]);
  }
  const reviewers = [
    approval.requestedByFingerprint,
    approval.approvedByFingerprint,
    approval.securityReviewerFingerprint,
    approval.operationsReviewerFingerprint,
    approval.commercialReviewerFingerprint,
  ].filter((item) => typeof item === "string");
  if (new Set(reviewers).size !== reviewers.length) {
    failures.push("approval.approval reviewers must be distinct");
  }
  if (!isIsoTimestamp(approval.approvedAt)) failures.push("approval.approval.approvedAt must be an ISO timestamp");
  if (approval.secondReviewCompleted !== true) {
    failures.push("approval.approval.secondReviewCompleted must be true");
  }
}

function validateApprovalSourceOperationalControls(value) {
  if (!isRecord(value)) {
    failures.push("approval.operationalControls must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_SOURCE_OPERATIONAL_CONTROL_KEYS,
    "approval.operationalControls contains unsupported field",
  );
  validateIntegerInRange("approval.operationalControls.operatorCoverageMinutes", value.operatorCoverageMinutes, 10080, 43200);
  for (const key of [
    "namedOpsLeadFingerprint",
    "incidentOwnerFingerprint",
    "rollbackOwnerFingerprint",
    "killSwitchOwnerFingerprint",
    "billingOwnerFingerprint",
    "supportOwnerFingerprint",
    "merchantSuccessOwnerFingerprint",
  ]) {
    validateFingerprint(`approval.operationalControls.${key}`, value[key]);
  }
  for (const key of [
    "rollbackPlaybookReviewed",
    "alertRoutesReviewed",
    "rateLimitReviewed",
    "supportEscalationReady",
    "merchantNotificationPlanReady",
    "noAutomaticCustomerVisibleReplies",
    "liveExecutorKillSwitchDefaultOn",
    "perMerchantActivationRequired",
  ]) {
    validateBoolean(`approval.operationalControls.${key}`, value[key]);
    if (value[key] !== true) failures.push(`approval.operationalControls.${key} must be true`);
  }
}

function validateApprovalSourceRolloutControls(value) {
  if (!isRecord(value)) {
    failures.push("approval.rolloutControls must be an object");
    return;
  }
  validateAllowedKeys(value, APPROVAL_SOURCE_ROLLOUT_CONTROL_KEYS, "approval.rolloutControls contains unsupported field");
  for (const key of APPROVAL_SOURCE_ROLLOUT_CONTROL_KEYS) validateBoolean(`approval.rolloutControls.${key}`, value[key]);
  if (value.automaticActivationEnabled !== false) {
    failures.push("approval.rolloutControls.automaticActivationEnabled must be false");
  }
  if (value.automaticNextWaveEnabled !== false) {
    failures.push("approval.rolloutControls.automaticNextWaveEnabled must be false");
  }
  for (const key of [
    "manualApprovalBeforeMerchantActivation",
    "rollbackOnAnyFailedMutation",
    "stopOnCustomerComplaint",
    "stopOnRejectedCompensation",
    "generalAvailabilityBroadcastReady",
  ]) {
    if (value[key] !== true) failures.push(`approval.rolloutControls.${key} must be true`);
  }
}

function validateApprovalTarget(target) {
  if (!isRecord(target)) {
    failures.push("approval.target must be an object");
    return;
  }
  validateAllowedKeys(target, APPROVAL_TARGET_KEYS, "approval.target contains unsupported field");
  validateFingerprint("approval.target.rolloutIdFingerprint", target.rolloutIdFingerprint);
  if (target.fromRolloutTrack !== "graduated_multi_merchant") {
    failures.push("approval.target.fromRolloutTrack must be graduated_multi_merchant");
  }
  if (target.toRolloutTrack !== "general_availability") {
    failures.push("approval.target.toRolloutTrack must be general_availability");
  }
  validateChangeTicket("approval.target.changeTicket", target.changeTicket);
}

function validateCloseoutReviewSource(value) {
  if (!isRecord(value)) {
    failures.push("closeout review root must be an object");
    return;
  }
  validateAllowedKeys(value, CLOSEOUT_SOURCE_ROOT_KEYS, "closeout review root contains unsupported field");
  if (value.schemaVersion !== "smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1") {
    failures.push("closeout review.schemaVersion must be smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("closeout review.generatedAt must be an ISO timestamp");
  validateSourceTarget(value.target, "closeout review.target");
  validateSourceExpansionScope(value.expansionScope, "closeout review.expansionScope");
  validateSourceLaunchWindow(value.launchWindow, "closeout review.launchWindow");
  validateCloseoutSourceRunSummary(value.runSummary);
  validateCloseoutSourceReviewers(value.reviewers);
  validateCloseoutSourceCloseout(value.closeout);
  validateRequiredTrueObject(value.evidence, CLOSEOUT_SOURCE_EVIDENCE_KEYS, "closeout review.evidence");
  validateSourceArtifactBindings(
    value.artifactBindings,
    CLOSEOUT_SOURCE_ARTIFACT_BINDING_KEYS,
    "closeout review.artifactBindings",
  );
  validateAllFalseObject(value.safety, REVIEW_SAFETY_KEYS, "closeout review.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write manual merchant activation field",
    "forbidden sensitive provider write manual merchant activation value",
  );
}

function validateRunLedgerSource(value) {
  if (!isRecord(value)) {
    failures.push("run ledger root must be an object");
    return;
  }
  validateAllowedKeys(value, RUN_LEDGER_SOURCE_ROOT_KEYS, "run ledger root contains unsupported field");
  if (value.schemaVersion !== "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1") {
    failures.push("run ledger.schemaVersion must be smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("run ledger.generatedAt must be an ISO timestamp");
  validateSourceTarget(value.target, "run ledger.target");
  validateSourceExpansionScope(value.expansionScope, "run ledger.expansionScope");
  validateSourceLaunchWindow(value.launchWindow, "run ledger.launchWindow");
  validateRunLedgerSourceSummary(value.summary, value.runRecords);
  validateRunLedgerSourceRunRecords(value.runRecords, value);
  validateRunLedgerSourceEvidence(value.evidence);
  validateAllFalseObject(value.safety, LEDGER_SAFETY_KEYS, "run ledger.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write manual merchant activation field",
    "forbidden sensitive provider write manual merchant activation value",
  );
}

function validateSourceExpansionScope(scope, label) {
  if (!isRecord(scope)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(scope, SOURCE_EXPANSION_SCOPE_KEYS, `${label} contains unsupported field`);
  validateFingerprintArray(`${label}.merchantFingerprints`, scope.merchantFingerprints, 1, 50);
  validateEnumArray(`${label}.channels`, scope.channels, CHANNELS, 1, 2);
  validateEnumArray(`${label}.allowedActions`, scope.allowedActions, LOW_RISK_ACTIONS, 1, 3);
  validateIntegerInRange(`${label}.maxMerchants`, scope.maxMerchants, 1, 50);
  if (
    Array.isArray(scope.merchantFingerprints) &&
    Number.isInteger(scope.maxMerchants) &&
    scope.maxMerchants < scope.merchantFingerprints.length
  ) {
    failures.push(`${label}.maxMerchants must cover merchantFingerprints`);
  }
  validateIntegerInRange(`${label}.maxDailyProviderWrites`, scope.maxDailyProviderWrites, 1, 500);
  validateIntegerInRange(`${label}.maxDailyProviderWritesPerMerchant`, scope.maxDailyProviderWritesPerMerchant, 1, 50);
  validateIntegerInRange(`${label}.maxCouponAmountCents`, scope.maxCouponAmountCents, 0, 5000);
  if (scope.businessHoursOnly !== true) failures.push(`${label}.businessHoursOnly must be true`);
}

function validateSourceLaunchWindow(value, label) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, SOURCE_LAUNCH_WINDOW_KEYS, `${label} contains unsupported field`);
  if (!isIsoTimestamp(value.startsAt)) failures.push(`${label}.startsAt must be an ISO timestamp`);
  if (!isIsoTimestamp(value.endsAt)) failures.push(`${label}.endsAt must be an ISO timestamp`);
  if (!isIsoTimestamp(value.closedAt)) failures.push(`${label}.closedAt must be an ISO timestamp`);
  validateIntegerInRange(`${label}.durationMinutes`, value.durationMinutes, 30, 240);
  if (isIsoTimestamp(value.startsAt) && isIsoTimestamp(value.endsAt)) {
    const durationMinutes = (Date.parse(value.endsAt) - Date.parse(value.startsAt)) / 60000;
    if (durationMinutes !== value.durationMinutes) failures.push(`${label}.durationMinutes must match startsAt and endsAt`);
    if (durationMinutes <= 0) failures.push(`${label}.endsAt must be after startsAt`);
  }
  if (isIsoTimestamp(value.endsAt) && isIsoTimestamp(value.closedAt) && Date.parse(value.closedAt) < Date.parse(value.endsAt)) {
    failures.push(`${label}.closedAt must be at or after endsAt`);
  }
  if (value.freezeWindowActive !== true) failures.push(`${label}.freezeWindowActive must be true`);
  if (value.businessHoursOnly !== true) failures.push(`${label}.businessHoursOnly must be true`);
}

function validateCloseoutSourceRunSummary(summary) {
  if (!isRecord(summary)) {
    failures.push("closeout review.runSummary must be an object");
    return;
  }
  validateAllowedKeys(summary, CLOSEOUT_SOURCE_RUN_SUMMARY_KEYS, "closeout review.runSummary contains unsupported field");
  for (const key of [
    "totalRuns",
    "succeededRuns",
    "failedRuns",
    "rolledBackRuns",
    "blockedRuns",
    "failedProviderMutationRuns",
    "complaintCount",
    "customerRejectedCompensationCount",
  ]) {
    validateIntegerInRange(`closeout review.runSummary.${key}`, summary[key], 0, 10000);
  }
  if (
    Number.isInteger(summary.totalRuns) &&
    Number.isInteger(summary.succeededRuns) &&
    Number.isInteger(summary.failedRuns) &&
    Number.isInteger(summary.rolledBackRuns) &&
    Number.isInteger(summary.blockedRuns) &&
    summary.totalRuns !== summary.succeededRuns + summary.failedRuns + summary.rolledBackRuns + summary.blockedRuns
  ) {
    failures.push("closeout review.runSummary.totalRuns must equal status counts");
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
    validateBoolean(`closeout review.runSummary.${key}`, summary[key]);
    if (summary[key] !== true) failures.push(`closeout review.runSummary.${key} must be true`);
  }
}

function validateCloseoutSourceReviewers(reviewers) {
  if (!isRecord(reviewers)) {
    failures.push("closeout review.reviewers must be an object");
    return;
  }
  validateAllowedKeys(reviewers, CLOSEOUT_SOURCE_REVIEWER_KEYS, "closeout review.reviewers contains unsupported field");
  for (const key of [
    "releaseOwnerFingerprint",
    "operationsReviewerFingerprint",
    "supportReviewerFingerprint",
    "rollbackOwnerFingerprint",
  ]) {
    validateFingerprint(`closeout review.reviewers.${key}`, reviewers[key]);
  }
  const fingerprints = [
    reviewers.releaseOwnerFingerprint,
    reviewers.operationsReviewerFingerprint,
    reviewers.supportReviewerFingerprint,
    reviewers.rollbackOwnerFingerprint,
  ].filter((item) => typeof item === "string");
  if (new Set(fingerprints).size !== fingerprints.length) {
    failures.push("closeout review.reviewers must be distinct");
  }
  if (!isIsoTimestamp(reviewers.reviewedAt)) failures.push("closeout review.reviewers.reviewedAt must be an ISO timestamp");
  if (reviewers.secondReviewCompleted !== true) failures.push("closeout review.reviewers.secondReviewCompleted must be true");
}

function validateCloseoutSourceCloseout(closeout) {
  if (!isRecord(closeout)) {
    failures.push("closeout review.closeout must be an object");
    return;
  }
  validateAllowedKeys(closeout, CLOSEOUT_SOURCE_CLOSEOUT_KEYS, "closeout review.closeout contains unsupported field");
  if (closeout.decision !== "approved_for_general_availability_review") {
    failures.push("closeout review.closeout.decision must be approved_for_general_availability_review");
  }
  for (const key of [
    "customerImpactReviewed",
    "providerMutationReviewCompleted",
    "complaintReviewCompleted",
    "compensationRejectionReviewCompleted",
    "incidentReviewCompleted",
    "rollbackReviewCompleted",
    "billingImpactReviewed",
    "merchantNotificationReviewed",
    "supportSlaReviewed",
    "evidencePackageReviewed",
  ]) {
    validateBoolean(`closeout review.closeout.${key}`, closeout[key]);
    if (closeout[key] !== true) failures.push(`closeout review.closeout.${key} must be true`);
  }
  if (!Array.isArray(closeout.outstandingActions)) {
    failures.push("closeout review.closeout.outstandingActions must be an array");
  } else if (closeout.outstandingActions.length > 0) {
    failures.push("closeout review.closeout.outstandingActions must be empty");
  }
}

function validateRunLedgerSourceSummary(summary, runRecords) {
  if (!isRecord(summary)) {
    failures.push("run ledger.summary must be an object");
    return;
  }
  validateAllowedKeys(summary, RUN_LEDGER_SOURCE_SUMMARY_KEYS, "run ledger.summary contains unsupported field");
  for (const key of [
    "totalRuns",
    "succeededRuns",
    "failedRuns",
    "rolledBackRuns",
    "blockedRuns",
    "complaintCount",
    "customerRejectedCompensationCount",
  ]) {
    validateIntegerInRange(`run ledger.summary.${key}`, summary[key], 0, 10000);
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
    validateBoolean(`run ledger.summary.${key}`, summary[key]);
    if (summary[key] !== true) failures.push(`run ledger.summary.${key} must be true`);
  }
  if (Array.isArray(runRecords) && summary.totalRuns !== runRecords.length) {
    failures.push("run ledger.summary.totalRuns must match runRecords length");
  }
}

function validateRunLedgerSourceRunRecords(records, ledger) {
  if (!Array.isArray(records)) {
    failures.push("run ledger.runRecords must be an array");
    return;
  }
  if (records.length < 1 || records.length > 10000) {
    failures.push("run ledger.runRecords must contain between 1 and 10000 records");
  }
  for (const [index, record] of records.entries()) validateRunLedgerSourceRunRecord(record, index, ledger);
}

function validateRunLedgerSourceRunRecord(record, index, ledger) {
  const label = `run ledger.runRecords[${index}]`;
  if (!isRecord(record)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(record, RUN_LEDGER_SOURCE_RUN_RECORD_KEYS, `${label} contains unsupported field`);
  for (const key of [
    "merchantFingerprint",
    "operatorFingerprint",
    "reviewerFingerprint",
    "rollbackOwnerFingerprint",
    "billingOwnerFingerprint",
    "supportOwnerFingerprint",
  ]) {
    validateFingerprint(`${label}.${key}`, record[key]);
  }
  for (const key of ["runFingerprint", "requestFingerprint", "executionAttemptFingerprint", "auditLogSha256"]) {
    validateSha256(`${label}.${key}`, record[key]);
  }
  if (!CHANNELS.has(record.channel)) failures.push(`${label}.channel must be taobao or douyin`);
  if (!LOW_RISK_ACTIONS.has(record.action)) failures.push(`${label}.action contains unsupported value`);
  if (!["low", "medium", "high"].includes(record.riskLevel)) failures.push(`${label}.riskLevel must be low, medium, or high`);
  if (!["succeeded", "failed", "rolled_back", "blocked"].includes(record.status)) failures.push(`${label}.status contains unsupported value`);
  if (!["not_started", "dry_run", "live", "blocked_before_network"].includes(record.networkExecution)) {
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
  if (record.customerVisibleMessageSent !== false) failures.push(`${label}.customerVisibleMessageSent must be false`);
  if (record.providerResponseStored !== false) failures.push(`${label}.providerResponseStored must be false`);
  if (record.providerPayloadStored !== false) failures.push(`${label}.providerPayloadStored must be false`);
  if (!isIsoTimestamp(record.createdAt)) failures.push(`${label}.createdAt must be an ISO timestamp`);
  if (!isIsoTimestamp(record.completedAt)) failures.push(`${label}.completedAt must be an ISO timestamp`);
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

function validateRunLedgerSourceEvidence(value) {
  if (!isRecord(value)) {
    failures.push("run ledger.evidence must be an object");
    return;
  }
  validateAllowedKeys(value, RUN_LEDGER_SOURCE_EVIDENCE_KEYS, "run ledger.evidence contains unsupported field");
  validateSha256(
    "run ledger.evidence.providerWriteGraduatedRolloutPreflightSha256",
    value.providerWriteGraduatedRolloutPreflightSha256,
  );
  for (const key of RUN_LEDGER_SOURCE_EVIDENCE_KEYS) {
    if (key === "providerWriteGraduatedRolloutPreflightSha256") continue;
    validateBoolean(`run ledger.evidence.${key}`, value[key]);
    if (value[key] !== true) failures.push(`run ledger.evidence.${key} must be true`);
  }
}

function validateSourceTarget(target, label) {
  if (!isRecord(target)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(target, SOURCE_TARGET_KEYS, `${label} contains unsupported field`);
  validateFingerprint(`${label}.rolloutIdFingerprint`, target.rolloutIdFingerprint);
  if (target.rolloutTrack !== "graduated_multi_merchant") {
    failures.push(`${label}.rolloutTrack must be graduated_multi_merchant`);
  }
  validateChangeTicket(`${label}.changeTicket`, target.changeTicket);
}

function validateActivationApprovalBinding(activation, approval) {
  if (
    activation?.artifactBindings?.providerWriteGeneralAvailabilityApprovalSha256 !==
    approval.sha256
  ) {
    failures.push("artifactBindings.providerWriteGeneralAvailabilityApprovalSha256 must match the approval file sha256");
  }
  if (!isRecord(activation) || !isRecord(approval.value)) return;
  if (activation.target?.rolloutIdFingerprint !== approval.value.target?.rolloutIdFingerprint) {
    failures.push("target.rolloutIdFingerprint must match approval target.rolloutIdFingerprint");
  }
  if (activation.target?.rolloutTrack !== approval.value.target?.toRolloutTrack) {
    failures.push("target.rolloutTrack must match approval target.toRolloutTrack");
  }
  if (activation.target?.changeTicket !== approval.value.target?.changeTicket) {
    failures.push("target.changeTicket must match approval target.changeTicket");
  }
  validateMerchantInsideApprovalScope(activation, approval.value);
}

function validateMerchantInsideApprovalScope(activation, approval) {
  const target = activation.target ?? {};
  const scope = activation.merchantScope ?? {};
  const approvedScope = approval.expansionScope ?? {};
  if (target.merchantFingerprint !== scope.merchantFingerprint) {
    failures.push("target.merchantFingerprint must match merchantScope.merchantFingerprint");
  }
  if (target.channel !== scope.channel) {
    failures.push("target.channel must match merchantScope.channel");
  }
  if (!Array.isArray(approvedScope.merchantFingerprints) || !approvedScope.merchantFingerprints.includes(scope.merchantFingerprint)) {
    failures.push("merchantScope.merchantFingerprint must be present in approval expansionScope.merchantFingerprints");
  }
  if (!Array.isArray(approvedScope.channels) || !approvedScope.channels.includes(scope.channel)) {
    failures.push("merchantScope.channel must be present in approval expansionScope.channels");
  }
  if (Array.isArray(scope.allowedActions) && Array.isArray(approvedScope.allowedActions)) {
    for (const action of scope.allowedActions) {
      if (!approvedScope.allowedActions.includes(action)) {
        failures.push("merchantScope.allowedActions must be inside approval expansionScope.allowedActions");
      }
    }
  }
  if (
    Number.isInteger(scope.maxDailyProviderWrites) &&
    Number.isInteger(approvedScope.maxDailyProviderWritesPerMerchant) &&
    scope.maxDailyProviderWrites > approvedScope.maxDailyProviderWritesPerMerchant
  ) {
    failures.push("merchantScope.maxDailyProviderWrites must not exceed approval expansionScope.maxDailyProviderWritesPerMerchant");
  }
  if (
    Number.isInteger(scope.maxCouponAmountCents) &&
    Number.isInteger(approvedScope.maxCouponAmountCents) &&
    scope.maxCouponAmountCents > approvedScope.maxCouponAmountCents
  ) {
    failures.push("merchantScope.maxCouponAmountCents must not exceed approval expansionScope.maxCouponAmountCents");
  }
}

function validateApprovalCloseoutBinding(approval, closeoutReview) {
  if (
    approval?.artifactBindings?.providerWriteGraduatedRolloutCloseoutReviewSha256 !==
    closeoutReview.sha256
  ) {
    failures.push("approval artifactBindings.providerWriteGraduatedRolloutCloseoutReviewSha256 must match the closeout review file sha256");
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

function validateCloseoutRunLedgerBinding(closeoutReview, runLedger) {
  if (
    closeoutReview?.artifactBindings?.providerWriteGraduatedRolloutRunLedgerSha256 !==
    runLedger.sha256
  ) {
    failures.push("closeout review artifactBindings.providerWriteGraduatedRolloutRunLedgerSha256 must match the run ledger file sha256");
  }
  if (!isRecord(closeoutReview) || !isRecord(runLedger.value)) return;
  if (closeoutReview.target?.rolloutIdFingerprint !== runLedger.value.target?.rolloutIdFingerprint) {
    failures.push("closeout review target.rolloutIdFingerprint must match run ledger target.rolloutIdFingerprint");
  }
  if (closeoutReview.target?.rolloutTrack !== runLedger.value.target?.rolloutTrack) {
    failures.push("closeout review target.rolloutTrack must match run ledger target.rolloutTrack");
  }
  if (closeoutReview.target?.changeTicket !== runLedger.value.target?.changeTicket) {
    failures.push("closeout review target.changeTicket must match run ledger target.changeTicket");
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
    activation: undefined,
    approval: undefined,
    closeoutReview: undefined,
    runLedger: undefined,
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
    if (arg.startsWith("--activation=")) {
      args.activation = arg.slice("--activation=".length);
      continue;
    }
    if (arg.startsWith("--approval=")) {
      args.approval = arg.slice("--approval=".length);
      continue;
    }
    if (arg.startsWith("--closeout-review=")) {
      args.closeoutReview = arg.slice("--closeout-review=".length);
      continue;
    }
    if (arg.startsWith("--run-ledger=")) {
      args.runLedger = arg.slice("--run-ledger=".length);
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
    activation:
      args.activation ??
      env.SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_FILE,
    approval:
      args.approval ??
      env.SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_APPROVAL_FILE,
    closeoutReview:
      args.closeoutReview ??
      env.SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_CLOSEOUT_REVIEW_FILE,
    runLedger:
      args.runLedger ??
      env.SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_RUN_LEDGER_FILE,
    requirePass:
      args.requirePass ||
      env.SMARTCS_PROVIDER_WRITE_MANUAL_MERCHANT_ACTIVATION_REQUIRE_PASS === "true",
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

function validateAllTrueObject(value, allowedKeys, label, options) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, allowedKeys, `${label} contains unsupported field`);
  for (const key of allowedKeys) {
    validateBoolean(`${label}.${key}`, value[key]);
    if ((options.requirePass || hasValue(options.activation)) && value[key] !== true) {
      failures.push(`${label}.${key} must be true`);
    }
  }
}

function validateRequiredTrueObject(value, allowedKeys, label) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, allowedKeys, `${label} contains unsupported field`);
  for (const key of allowedKeys) {
    validateBoolean(`${label}.${key}`, value[key]);
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

function validateSourceArtifactBindings(value, allowedKeys, label) {
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
    failures.push(`${label} hashes must be distinct`);
  }
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

function validateChangeTicket(label, value) {
  if (typeof value !== "string" || !SAFE_CHANGE_TICKET_PATTERN.test(value)) {
    failures.push(`${label} must be a safe change ticket id`);
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
