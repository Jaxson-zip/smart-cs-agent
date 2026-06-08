import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const COMMAND_NAME = "verify:provider-write-general-availability-approval";
const MAX_EVIDENCE_BYTES = 512 * 1024;
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

const APPROVAL_ROOT_KEYS = new Set([
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
const TARGET_KEYS = new Set([
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
const EXPANSION_SCOPE_KEYS = new Set([
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
const APPROVAL_KEYS = new Set([
  "approvalStatus",
  "requestedByFingerprint",
  "approvedByFingerprint",
  "securityReviewerFingerprint",
  "operationsReviewerFingerprint",
  "commercialReviewerFingerprint",
  "approvedAt",
  "secondReviewCompleted",
]);
const APPROVAL_STATUSES = new Set(["approved", "rejected_needs_investigation"]);
const PREREQUISITE_EVIDENCE_KEYS = new Set([
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
const OPERATIONAL_CONTROL_KEYS = new Set([
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
const COMMERCIAL_READINESS_KEYS = new Set([
  "customerContractReviewed",
  "billingPlanConfigured",
  "supportSlaReviewed",
  "merchantNotificationPlanReviewed",
  "pricingReviewed",
  "legalReviewCompleted",
  "dataRetentionReviewed",
]);
const ROLLOUT_CONTROL_KEYS = new Set([
  "automaticActivationEnabled",
  "automaticNextWaveEnabled",
  "manualApprovalBeforeMerchantActivation",
  "rollbackOnAnyFailedMutation",
  "stopOnCustomerComplaint",
  "stopOnRejectedCompensation",
  "generalAvailabilityBroadcastReady",
]);
const ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteGraduatedRolloutCloseoutReviewSha256",
  "auditExportSha256",
  "productionLaunchSha256",
  "productionStaticCiSha256",
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
const RUN_LEDGER_SAFETY_KEYS = new Set([
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
const GENERAL_AVAILABILITY_ACTIONS = new Set([
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

  let approval = null;
  let closeoutReview = null;
  let runLedger = null;

  if (hasValue(args.approval)) {
    approval = readJsonFile(
      args.approval,
      "provider write general availability approval",
      APPROVAL_ARTIFACT_DIR,
      "--approval",
      "provider-write-general-availability-approval-artifacts",
    );
    if (approval) validateApproval(approval.value, args);
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

  if (approval && closeoutReview) {
    validateApprovalCloseoutBinding(approval.value, closeoutReview);
  }
  if (closeoutReview && runLedger) {
    validateCloseoutRunLedgerBinding(closeoutReview.value, runLedger);
  }

  if (failures.length > 0) {
    console.error("Provider write general availability approval verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write general availability approval verification passed.");
  if (approval) {
    console.log(`- rollout=${approval.value.target.toRolloutTrack}`);
    console.log("- approval=verified");
  } else {
    console.log("- approval=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    gitignore: ".gitignore",
    approvalDocs: "docs/deploy/provider-write-general-availability-approval.md",
    closeoutDocs: "docs/deploy/provider-write-graduated-rollout-closeout-review.md",
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
    "verify:provider-write-general-availability-approval:safe",
    "\"verify:provider-write-general-availability-approval:safe\": \"node scripts/verify-provider-write-general-availability-approval.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-general-availability-approval.mjs",
  ]);

  mustContainAll("provider write general availability approval docs", content.approvalDocs, [
    "PR81 Provider Write General Availability Approval Gate",
    "npm run verify:provider-write-general-availability-approval",
    "npm run verify:provider-write-general-availability-approval:safe",
    "SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_REQUIRE_PASS=true",
    "smart-cs-agent.provider-write-general-availability-approval.v1",
    "smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1",
    "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1",
    "provider-write-general-availability-approval-artifacts/",
    "provider-write-graduated-rollout-closeout-review-artifacts/",
    "provider-write-graduated-rollout-run-ledger-artifacts/",
    "graduated_multi_merchant",
    "general_availability",
    "providerWriteGraduatedRolloutCloseoutReviewSha256",
    "providerWriteGraduatedRolloutRunLedgerSha256",
    "automaticActivationEnabled=false",
    "manualMerchantActivationRequired=true",
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

  mustContainAll("closeout docs reference general availability approval", content.closeoutDocs, [
    "PR81 Provider Write General Availability Approval Gate",
    "verify:provider-write-general-availability-approval",
    "providerWriteGraduatedRolloutCloseoutReviewSha256",
    "general_availability",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR81 Provider Write General Availability Approval Gate",
    "verify:provider-write-general-availability-approval",
    "smart-cs-agent.provider-write-general-availability-approval.v1",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR81 Provider Write General Availability Approval Gate",
    "verify:provider-write-general-availability-approval",
    "providerWriteGraduatedRolloutCloseoutReviewSha256",
    "general_availability",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "verify:provider-write-general-availability-approval",
    "verify:provider-write-general-availability-approval:safe",
    "SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-general-availability-approval.test.mjs",
    "npm run verify:provider-write-general-availability-approval",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-general-availability-approval.test.mjs",
    "npm run verify:provider-write-general-availability-approval",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "providerWriteGeneralAvailabilityApproval",
    "verify-provider-write-general-availability-approval.mjs",
    "verify:provider-write-general-availability-approval",
    "provider write general availability approval",
    "SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_FILE",
    "smart-cs-agent.provider-write-general-availability-approval.v1",
  ]);

  mustContainAll("task plan general availability approval", content.taskPlan, [
    "PR81 - Provider Write General Availability Approval Gate",
    "verify:provider-write-general-availability-approval",
  ]);

  mustContainAll("progress general availability approval", content.progress, [
    "Started PR81 provider write general availability approval gate",
  ]);

  mustContainAll("gitignore general availability approval artifacts", content.gitignore, [
    "provider-write-general-availability-approval-artifacts/",
  ]);
}

function validateApproval(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write general availability approval root must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_ROOT_KEYS,
    "provider write general availability approval contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-general-availability-approval.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-general-availability-approval.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("generatedAt must be an ISO timestamp");

  validateTarget(value.target);
  validateExpansionScope(value.expansionScope);
  validateApprovalSection(value.approval, options);
  validateAllTrueObject(value.prerequisiteEvidence, PREREQUISITE_EVIDENCE_KEYS, "prerequisiteEvidence", options);
  validateOperationalControls(value.operationalControls, options);
  validateCommercialReadiness(value.commercialReadiness, options);
  validateRolloutControls(value.rolloutControls, options);
  validateArtifactBindings(value.artifactBindings);
  validateAllFalseObject(value.safety, SAFETY_KEYS, "safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write general availability approval field",
    "forbidden sensitive provider write general availability approval value",
  );
}

function validateTarget(target) {
  if (!isRecord(target)) {
    failures.push("target must be an object");
    return;
  }
  validateAllowedKeys(target, TARGET_KEYS, "target contains unsupported field");
  validateFingerprint("target.rolloutIdFingerprint", target.rolloutIdFingerprint);
  if (target.fromRolloutTrack !== "graduated_multi_merchant") {
    failures.push("target.fromRolloutTrack must be graduated_multi_merchant");
  }
  if (target.toRolloutTrack !== "general_availability") {
    failures.push("target.toRolloutTrack must be general_availability");
  }
  validateChangeTicket("target.changeTicket", target.changeTicket);
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

function validateExpansionScope(scope) {
  if (!isRecord(scope)) {
    failures.push("expansionScope must be an object");
    return;
  }
  validateAllowedKeys(scope, EXPANSION_SCOPE_KEYS, "expansionScope contains unsupported field");
  validateFingerprintArray("expansionScope.merchantFingerprints", scope.merchantFingerprints, 3, 50);
  validateEnumArray("expansionScope.channels", scope.channels, CHANNELS, 1, 2);
  validateEnumArray(
    "expansionScope.allowedActions",
    scope.allowedActions,
    GENERAL_AVAILABILITY_ACTIONS,
    1,
    3,
  );
  validateIntegerInRange("expansionScope.maxMerchants", scope.maxMerchants, 3, 50);
  if (
    Array.isArray(scope.merchantFingerprints) &&
    Number.isInteger(scope.maxMerchants) &&
    scope.maxMerchants < scope.merchantFingerprints.length
  ) {
    failures.push("expansionScope.maxMerchants must cover merchantFingerprints");
  }
  validateIntegerInRange("expansionScope.maxDailyProviderWrites", scope.maxDailyProviderWrites, 1, 500);
  validateIntegerInRange(
    "expansionScope.maxDailyProviderWritesPerMerchant",
    scope.maxDailyProviderWritesPerMerchant,
    1,
    50,
  );
  validateIntegerInRange("expansionScope.maxCouponAmountCents", scope.maxCouponAmountCents, 0, 5000);
  if (scope.businessHoursOnly !== true) failures.push("expansionScope.businessHoursOnly must be true");
  if (scope.automaticActivationEnabled !== false) {
    failures.push("expansionScope.automaticActivationEnabled must be false");
  }
  if (scope.manualMerchantActivationRequired !== true) {
    failures.push("expansionScope.manualMerchantActivationRequired must be true");
  }
}

function validateApprovalSection(approval, options) {
  if (!isRecord(approval)) {
    failures.push("approval must be an object");
    return;
  }
  validateAllowedKeys(approval, APPROVAL_KEYS, "approval contains unsupported field");
  if (!APPROVAL_STATUSES.has(approval.approvalStatus)) {
    failures.push("approval.approvalStatus must be approved or rejected_needs_investigation");
  }
  if (options.requirePass && approval.approvalStatus !== "approved") {
    failures.push("approval.approvalStatus must be approved");
  }
  for (const key of [
    "requestedByFingerprint",
    "approvedByFingerprint",
    "securityReviewerFingerprint",
    "operationsReviewerFingerprint",
    "commercialReviewerFingerprint",
  ]) {
    validateFingerprint(`approval.${key}`, approval[key]);
  }
  const reviewers = [
    approval.requestedByFingerprint,
    approval.approvedByFingerprint,
    approval.securityReviewerFingerprint,
    approval.operationsReviewerFingerprint,
    approval.commercialReviewerFingerprint,
  ].filter((item) => typeof item === "string");
  if (new Set(reviewers).size !== reviewers.length) {
    failures.push("approval reviewers must be distinct");
  }
  if (!isIsoTimestamp(approval.approvedAt)) failures.push("approval.approvedAt must be an ISO timestamp");
  validateBoolean("approval.secondReviewCompleted", approval.secondReviewCompleted);
  if ((options.requirePass || hasValue(options.approval)) && approval.secondReviewCompleted !== true) {
    failures.push("approval.secondReviewCompleted must be true");
  }
}

function validateOperationalControls(value, options) {
  if (!isRecord(value)) {
    failures.push("operationalControls must be an object");
    return;
  }
  validateAllowedKeys(value, OPERATIONAL_CONTROL_KEYS, "operationalControls contains unsupported field");
  validateIntegerInRange(
    "operationalControls.operatorCoverageMinutes",
    value.operatorCoverageMinutes,
    10080,
    43200,
  );
  for (const key of [
    "namedOpsLeadFingerprint",
    "incidentOwnerFingerprint",
    "rollbackOwnerFingerprint",
    "killSwitchOwnerFingerprint",
    "billingOwnerFingerprint",
    "supportOwnerFingerprint",
    "merchantSuccessOwnerFingerprint",
  ]) {
    validateFingerprint(`operationalControls.${key}`, value[key]);
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
    validateBoolean(`operationalControls.${key}`, value[key]);
    if ((options.requirePass || hasValue(options.approval)) && value[key] !== true) {
      failures.push(`operationalControls.${key} must be true`);
    }
  }
}

function validateCommercialReadiness(value, options) {
  if (!isRecord(value)) {
    failures.push("commercialReadiness must be an object");
    return;
  }
  validateAllowedKeys(value, COMMERCIAL_READINESS_KEYS, "commercialReadiness contains unsupported field");
  for (const key of COMMERCIAL_READINESS_KEYS) {
    validateBoolean(`commercialReadiness.${key}`, value[key]);
    if ((options.requirePass || hasValue(options.approval)) && value[key] !== true) {
      failures.push(`commercialReadiness.${key} must be true`);
    }
  }
}

function validateRolloutControls(value, options) {
  if (!isRecord(value)) {
    failures.push("rolloutControls must be an object");
    return;
  }
  validateAllowedKeys(value, ROLLOUT_CONTROL_KEYS, "rolloutControls contains unsupported field");
  for (const key of ROLLOUT_CONTROL_KEYS) {
    validateBoolean(`rolloutControls.${key}`, value[key]);
  }
  if (value.automaticActivationEnabled !== false) {
    failures.push("rolloutControls.automaticActivationEnabled must be false");
  }
  if (value.automaticNextWaveEnabled !== false) {
    failures.push("rolloutControls.automaticNextWaveEnabled must be false");
  }
  for (const key of [
    "manualApprovalBeforeMerchantActivation",
    "rollbackOnAnyFailedMutation",
    "stopOnCustomerComplaint",
    "stopOnRejectedCompensation",
    "generalAvailabilityBroadcastReady",
  ]) {
    if ((options.requirePass || hasValue(options.approval)) && value[key] !== true) {
      failures.push(`rolloutControls.${key} must be true`);
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

function validateCloseoutReviewSource(value) {
  if (!isRecord(value)) {
    failures.push("closeout review root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1") {
    failures.push("closeout review.schemaVersion must be smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1");
  }
  validateSourceTarget(value.target, "closeout review.target");
  if (value.runSummary?.allRunsReviewed !== true) {
    failures.push("closeout review.runSummary.allRunsReviewed must be true");
  }
  if (value.runSummary?.failedRunsHaveIncidentNotes !== true) {
    failures.push("closeout review.runSummary.failedRunsHaveIncidentNotes must be true");
  }
  if (value.runSummary?.rollbackActionsVerified !== true) {
    failures.push("closeout review.runSummary.rollbackActionsVerified must be true");
  }
  if (value.runSummary?.customerComplaintsStoppedRollout !== true) {
    failures.push("closeout review.runSummary.customerComplaintsStoppedRollout must be true");
  }
  if (value.runSummary?.compensationRejectionsStoppedRollout !== true) {
    failures.push("closeout review.runSummary.compensationRejectionsStoppedRollout must be true");
  }
  if (value.runSummary?.merchantNotificationCompleted !== true) {
    failures.push("closeout review.runSummary.merchantNotificationCompleted must be true");
  }
  if (value.runSummary?.billingImpactReviewed !== true) {
    failures.push("closeout review.runSummary.billingImpactReviewed must be true");
  }
  if (value.runSummary?.supportSlaMaintained !== true) {
    failures.push("closeout review.runSummary.supportSlaMaintained must be true");
  }
  if (value.runSummary?.noAutoCustomerReplies !== true) {
    failures.push("closeout review.runSummary.noAutoCustomerReplies must be true");
  }
  if (value.closeout?.decision !== "approved_for_general_availability_review") {
    failures.push("closeout review.closeout.decision must be approved_for_general_availability_review");
  }
  if (!Array.isArray(value.closeout?.outstandingActions)) {
    failures.push("closeout review.closeout.outstandingActions must be an array");
  } else if (value.closeout.outstandingActions.length > 0) {
    failures.push("closeout review.closeout.outstandingActions must be empty");
  }
  if (value.evidence?.graduatedRolloutRunLedgerVerifierPassed !== true) {
    failures.push("closeout review.evidence.graduatedRolloutRunLedgerVerifierPassed must be true");
  }
  validateSha256(
    "closeout review artifactBindings.providerWriteGraduatedRolloutRunLedgerSha256",
    value.artifactBindings?.providerWriteGraduatedRolloutRunLedgerSha256,
  );
  validateAllFalseObject(value.safety, CLOSEOUT_REVIEW_SAFETY_KEYS, "closeout review.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write general availability approval field",
    "forbidden sensitive provider write general availability approval value",
  );
}

function validateRunLedgerSource(value) {
  if (!isRecord(value)) {
    failures.push("run ledger root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1") {
    failures.push("run ledger.schemaVersion must be smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1");
  }
  validateSourceTarget(value.target, "run ledger.target");
  if (value.summary?.allRunsReviewed !== true) failures.push("run ledger.summary.allRunsReviewed must be true");
  if (value.summary?.customerComplaintsStoppedRollout !== true) {
    failures.push("run ledger.summary.customerComplaintsStoppedRollout must be true");
  }
  if (value.summary?.compensationRejectionsStoppedRollout !== true) {
    failures.push("run ledger.summary.compensationRejectionsStoppedRollout must be true");
  }
  if (value.summary?.merchantNotificationCompleted !== true) {
    failures.push("run ledger.summary.merchantNotificationCompleted must be true");
  }
  if (value.summary?.billingImpactReviewed !== true) {
    failures.push("run ledger.summary.billingImpactReviewed must be true");
  }
  if (value.summary?.supportSlaMaintained !== true) {
    failures.push("run ledger.summary.supportSlaMaintained must be true");
  }
  if (value.summary?.noAutoCustomerReplies !== true) {
    failures.push("run ledger.summary.noAutoCustomerReplies must be true");
  }
  validateAllFalseObject(value.safety, RUN_LEDGER_SAFETY_KEYS, "run ledger.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write general availability approval field",
    "forbidden sensitive provider write general availability approval value",
  );
}

function validateApprovalCloseoutBinding(approval, closeoutReview) {
  if (
    approval?.artifactBindings?.providerWriteGraduatedRolloutCloseoutReviewSha256 !==
    closeoutReview.sha256
  ) {
    failures.push("artifactBindings.providerWriteGraduatedRolloutCloseoutReviewSha256 must match the closeout review file sha256");
  }
  if (!isRecord(approval) || !isRecord(closeoutReview.value)) return;
  if (approval.target?.rolloutIdFingerprint !== closeoutReview.value.target?.rolloutIdFingerprint) {
    failures.push("target.rolloutIdFingerprint must match closeout review target.rolloutIdFingerprint");
  }
  if (approval.target?.fromRolloutTrack !== closeoutReview.value.target?.rolloutTrack) {
    failures.push("target.fromRolloutTrack must match closeout review target.rolloutTrack");
  }
  if (approval.target?.changeTicket !== closeoutReview.value.target?.changeTicket) {
    failures.push("target.changeTicket must match closeout review target.changeTicket");
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
    approval:
      args.approval ??
      env.SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_FILE,
    closeoutReview:
      args.closeoutReview ??
      env.SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_CLOSEOUT_REVIEW_FILE,
    runLedger:
      args.runLedger ??
      env.SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_RUN_LEDGER_FILE,
    requirePass:
      args.requirePass ||
      env.SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_REQUIRE_PASS === "true",
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
    if ((options.requirePass || hasValue(options.approval)) && value[key] !== true) {
      failures.push(`${label}.${key} must be true`);
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
