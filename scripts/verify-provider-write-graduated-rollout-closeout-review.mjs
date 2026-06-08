import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const COMMAND_NAME = "verify:provider-write-graduated-rollout-closeout-review";
const MAX_EVIDENCE_BYTES = 512 * 1024;
const REVIEW_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-graduated-rollout-closeout-review-artifacts",
);
const RUN_LEDGER_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-graduated-rollout-run-ledger-artifacts",
);

const REVIEW_ROOT_KEYS = new Set([
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
const RUN_SUMMARY_KEYS = new Set([
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
const REVIEWER_KEYS = new Set([
  "releaseOwnerFingerprint",
  "operationsReviewerFingerprint",
  "supportReviewerFingerprint",
  "rollbackOwnerFingerprint",
  "reviewedAt",
  "secondReviewCompleted",
]);
const CLOSEOUT_KEYS = new Set([
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
const EVIDENCE_KEYS = new Set([
  "graduatedRolloutRunLedgerVerifierPassed",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "productionAlertingVerifierPassed",
  "productionCanaryVerifierPassed",
  "auditExportReviewed",
  "supportEscalationReviewCompleted",
  "merchantNotificationReviewCompleted",
]);
const ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteGraduatedRolloutRunLedgerSha256",
  "auditExportSha256",
  "productionLaunchSha256",
  "productionStaticCiSha256",
]);
const SAFETY_KEYS = new Set([
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
const RUN_LEDGER_SOURCE_SAFETY_KEYS = new Set([
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
const GRADUATED_ROLLOUT_ACTIONS = new Set([
  "modify_address",
  "issue_coupon",
  "urge_logistics",
]);
const DECISIONS = new Set([
  "approved_for_general_availability_review",
  "rejected_needs_investigation",
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

  let review = null;
  let runLedger = null;

  if (hasValue(args.review)) {
    review = readJsonFile(
      args.review,
      "provider write graduated rollout closeout review",
      REVIEW_ARTIFACT_DIR,
      "--review",
      "provider-write-graduated-rollout-closeout-review-artifacts",
    );
    if (review) validateReview(review.value, args);
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

  if (review && runLedger) {
    validateReviewRunLedgerBinding(review.value, runLedger);
  }

  if (failures.length > 0) {
    console.error("Provider write graduated rollout closeout review verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write graduated rollout closeout review verification passed.");
  if (review) {
    console.log(`- rollout=${review.value.target.rolloutTrack}`);
    console.log("- review=verified");
  } else {
    console.log("- review=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    gitignore: ".gitignore",
    closeoutDocs: "docs/deploy/provider-write-graduated-rollout-closeout-review.md",
    runLedgerDocs: "docs/deploy/provider-write-graduated-rollout-run-ledger.md",
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
    "verify:provider-write-graduated-rollout-closeout-review:safe",
    "\"verify:provider-write-graduated-rollout-closeout-review:safe\": \"node scripts/verify-provider-write-graduated-rollout-closeout-review.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-graduated-rollout-closeout-review.mjs",
  ]);

  mustContainAll("provider write graduated rollout closeout review docs", content.closeoutDocs, [
    "PR80 Provider Write Graduated Rollout Closeout Review Gate",
    "npm run verify:provider-write-graduated-rollout-closeout-review",
    "npm run verify:provider-write-graduated-rollout-closeout-review:safe",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_REQUIRE_PASS=true",
    "smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1",
    "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1",
    "provider-write-graduated-rollout-closeout-review-artifacts/",
    "provider-write-graduated-rollout-run-ledger-artifacts/",
    "graduated_multi_merchant",
    "providerWriteGraduatedRolloutRunLedgerSha256",
    "approved_for_general_availability_review",
    "rejected_needs_investigation",
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

  mustContainAll("run ledger docs reference closeout review", content.runLedgerDocs, [
    "PR80 Provider Write Graduated Rollout Closeout Review Gate",
    "verify:provider-write-graduated-rollout-closeout-review",
    "providerWriteGraduatedRolloutRunLedgerSha256",
    "approved_for_general_availability_review",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR80 Provider Write Graduated Rollout Closeout Review Gate",
    "verify:provider-write-graduated-rollout-closeout-review",
    "smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR80 Provider Write Graduated Rollout Closeout Review Gate",
    "verify:provider-write-graduated-rollout-closeout-review",
    "providerWriteGraduatedRolloutRunLedgerSha256",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "verify:provider-write-graduated-rollout-closeout-review",
    "verify:provider-write-graduated-rollout-closeout-review:safe",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-graduated-rollout-closeout-review.test.mjs",
    "npm run verify:provider-write-graduated-rollout-closeout-review",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-graduated-rollout-closeout-review.test.mjs",
    "npm run verify:provider-write-graduated-rollout-closeout-review",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "providerWriteGraduatedRolloutCloseoutReview",
    "verify-provider-write-graduated-rollout-closeout-review.mjs",
    "verify:provider-write-graduated-rollout-closeout-review",
    "provider write graduated rollout closeout review",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_FILE",
    "smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1",
  ]);

  mustContainAll("task plan closeout review", content.taskPlan, [
    "PR80 - Provider Write Graduated Rollout Closeout Review Gate",
    "verify:provider-write-graduated-rollout-closeout-review",
  ]);

  mustContainAll("progress closeout review", content.progress, [
    "Started PR80 provider write graduated rollout closeout review gate",
  ]);

  mustContainAll("gitignore closeout artifacts", content.gitignore, [
    "provider-write-graduated-rollout-closeout-review-artifacts/",
  ]);
}

function validateReview(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write graduated rollout closeout review root must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    REVIEW_ROOT_KEYS,
    "provider write graduated rollout closeout review contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("generatedAt must be an ISO timestamp");

  validateTarget(value.target, "target");
  validateExpansionScope(value.expansionScope, "expansionScope");
  validateLaunchWindow(value.launchWindow, "launchWindow", options);
  validateRunSummary(value.runSummary, options);
  validateReviewers(value.reviewers, options);
  validateCloseout(value.closeout, options);
  validateAllTrueObject(value.evidence, EVIDENCE_KEYS, "evidence", options);
  validateArtifactBindings(value.artifactBindings);
  validateAllFalseObject(value.safety, SAFETY_KEYS, "safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write graduated rollout closeout review field",
    "forbidden sensitive provider write graduated rollout closeout review value",
  );
}

function validateTarget(target, label) {
  if (!isRecord(target)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(target, TARGET_KEYS, `${label} contains unsupported field`);
  validateFingerprint(`${label}.rolloutIdFingerprint`, target.rolloutIdFingerprint);
  if (target.rolloutTrack !== "graduated_multi_merchant") {
    failures.push(`${label}.rolloutTrack must be graduated_multi_merchant`);
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

function validateLaunchWindow(window, label, options) {
  if (!isRecord(window)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(window, LAUNCH_WINDOW_KEYS, `${label} contains unsupported field`);
  if (!isIsoTimestamp(window.startsAt)) failures.push(`${label}.startsAt must be an ISO timestamp`);
  if (!isIsoTimestamp(window.endsAt)) failures.push(`${label}.endsAt must be an ISO timestamp`);
  if (!isIsoTimestamp(window.closedAt)) failures.push(`${label}.closedAt must be an ISO timestamp`);
  if (
    isIsoTimestamp(window.startsAt) &&
    isIsoTimestamp(window.endsAt) &&
    Date.parse(window.startsAt) >= Date.parse(window.endsAt)
  ) {
    failures.push(`${label}.startsAt must be before ${label}.endsAt`);
  }
  if (
    isIsoTimestamp(window.endsAt) &&
    isIsoTimestamp(window.closedAt) &&
    Date.parse(window.closedAt) < Date.parse(window.endsAt)
  ) {
    failures.push(`${label}.closedAt must be at or after ${label}.endsAt`);
  }
  validateIntegerInRange(`${label}.durationMinutes`, window.durationMinutes, 30, 240);
  validateBoolean(`${label}.freezeWindowActive`, window.freezeWindowActive);
  validateBoolean(`${label}.businessHoursOnly`, window.businessHoursOnly);
  if ((options.requirePass || hasValue(options.review)) && window.freezeWindowActive !== true) {
    failures.push(`${label}.freezeWindowActive must be true`);
  }
  if ((options.requirePass || hasValue(options.review)) && window.businessHoursOnly !== true) {
    failures.push(`${label}.businessHoursOnly must be true`);
  }
}

function validateRunSummary(summary, options) {
  if (!isRecord(summary)) {
    failures.push("runSummary must be an object");
    return;
  }
  validateAllowedKeys(summary, RUN_SUMMARY_KEYS, "runSummary contains unsupported field");
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
    validateIntegerInRange(`runSummary.${key}`, summary[key], 0, 200);
  }
  if (
    Number.isInteger(summary.totalRuns) &&
    Number.isInteger(summary.succeededRuns) &&
    Number.isInteger(summary.failedRuns) &&
    Number.isInteger(summary.rolledBackRuns) &&
    Number.isInteger(summary.blockedRuns) &&
    summary.totalRuns !==
      summary.succeededRuns + summary.failedRuns + summary.rolledBackRuns + summary.blockedRuns
  ) {
    failures.push("runSummary.totalRuns must equal status counts");
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
    validateBoolean(`runSummary.${key}`, summary[key]);
    if ((options.requirePass || hasValue(options.review)) && summary[key] !== true) {
      failures.push(`runSummary.${key} must be true`);
    }
  }
  if (summary.failedRuns > 0 && summary.failedRunsHaveIncidentNotes !== true) {
    failures.push("runSummary.failedRunsHaveIncidentNotes must be true when failedRuns is greater than 0");
  }
  if (
    (summary.rolledBackRuns > 0 || summary.failedProviderMutationRuns > 0) &&
    summary.rollbackActionsVerified !== true
  ) {
    failures.push("runSummary.rollbackActionsVerified must be true when rolledBackRuns or failedProviderMutationRuns is greater than 0");
  }
  if (summary.complaintCount > 0 && summary.customerComplaintsStoppedRollout !== true) {
    failures.push("runSummary.customerComplaintsStoppedRollout must be true");
  }
  if (summary.customerRejectedCompensationCount > 0 && summary.compensationRejectionsStoppedRollout !== true) {
    failures.push("runSummary.compensationRejectionsStoppedRollout must be true");
  }
}

function validateReviewers(reviewers, options) {
  if (!isRecord(reviewers)) {
    failures.push("reviewers must be an object");
    return;
  }
  validateAllowedKeys(reviewers, REVIEWER_KEYS, "reviewers contains unsupported field");
  for (const key of [
    "releaseOwnerFingerprint",
    "operationsReviewerFingerprint",
    "supportReviewerFingerprint",
    "rollbackOwnerFingerprint",
  ]) {
    validateFingerprint(`reviewers.${key}`, reviewers[key]);
  }
  if (!isIsoTimestamp(reviewers.reviewedAt)) failures.push("reviewers.reviewedAt must be an ISO timestamp");
  validateBoolean("reviewers.secondReviewCompleted", reviewers.secondReviewCompleted);
  if ((options.requirePass || hasValue(options.review)) && reviewers.secondReviewCompleted !== true) {
    failures.push("reviewers.secondReviewCompleted must be true");
  }
  const fingerprints = [
    reviewers.releaseOwnerFingerprint,
    reviewers.operationsReviewerFingerprint,
    reviewers.supportReviewerFingerprint,
    reviewers.rollbackOwnerFingerprint,
  ].filter((item) => typeof item === "string");
  if (new Set(fingerprints).size !== fingerprints.length) {
    failures.push("reviewers must be distinct");
  }
}

function validateCloseout(closeout, options) {
  if (!isRecord(closeout)) {
    failures.push("closeout must be an object");
    return;
  }
  validateAllowedKeys(closeout, CLOSEOUT_KEYS, "closeout contains unsupported field");
  if (!DECISIONS.has(closeout.decision)) {
    failures.push("closeout.decision must be approved_for_general_availability_review or rejected_needs_investigation");
  }
  if (options.requirePass && closeout.decision !== "approved_for_general_availability_review") {
    failures.push("closeout.decision must be approved_for_general_availability_review");
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
    validateBoolean(`closeout.${key}`, closeout[key]);
    if ((options.requirePass || hasValue(options.review)) && closeout[key] !== true) {
      failures.push(`closeout.${key} must be true`);
    }
  }
  if (!Array.isArray(closeout.outstandingActions)) {
    failures.push("closeout.outstandingActions must be an array");
  } else if (closeout.outstandingActions.length > 0) {
    failures.push("closeout.outstandingActions must be empty");
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
    if ((options.requirePass || hasValue(options.review)) && value[key] !== true) {
      failures.push(`${label}.${key} must be true`);
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

function validateRunLedgerSource(value) {
  if (!isRecord(value)) {
    failures.push("run ledger root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1") {
    failures.push("run ledger.schemaVersion must be smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1");
  }
  validateTarget(value.target, "run ledger.target");
  validateExpansionScope(value.expansionScope, "run ledger.expansionScope");
  validateRunLedgerLaunchWindow(value.launchWindow);
  if (value.summary?.allRunsReviewed !== true) failures.push("run ledger.summary.allRunsReviewed must be true");
  if (value.summary?.noAutoCustomerReplies !== true) failures.push("run ledger.summary.noAutoCustomerReplies must be true");
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
  if (value.evidence?.providerWriteGraduatedRolloutPreflightVerifierPassed !== true) {
    failures.push("run ledger.evidence.providerWriteGraduatedRolloutPreflightVerifierPassed must be true");
  }
  if (value.evidence?.postGraduatedRolloutReviewCompleted !== true) {
    failures.push("run ledger.evidence.postGraduatedRolloutReviewCompleted must be true");
  }
  validateAllFalseObject(value.safety, RUN_LEDGER_SOURCE_SAFETY_KEYS, "run ledger.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write graduated rollout closeout review field",
    "forbidden sensitive provider write graduated rollout closeout review value",
  );
}

function validateRunLedgerLaunchWindow(window) {
  if (!isRecord(window)) {
    failures.push("run ledger.launchWindow must be an object");
    return;
  }
  if (!isIsoTimestamp(window.startsAt)) failures.push("run ledger.launchWindow.startsAt must be an ISO timestamp");
  if (!isIsoTimestamp(window.endsAt)) failures.push("run ledger.launchWindow.endsAt must be an ISO timestamp");
  if (!isIsoTimestamp(window.closedAt)) failures.push("run ledger.launchWindow.closedAt must be an ISO timestamp");
}

function validateReviewRunLedgerBinding(review, runLedger) {
  if (review?.artifactBindings?.providerWriteGraduatedRolloutRunLedgerSha256 !== runLedger.sha256) {
    failures.push("artifactBindings.providerWriteGraduatedRolloutRunLedgerSha256 must match the run ledger file sha256");
  }
  if (!isRecord(review) || !isRecord(runLedger.value)) return;
  if (review.target?.rolloutIdFingerprint !== runLedger.value.target?.rolloutIdFingerprint) {
    failures.push("target.rolloutIdFingerprint must match run ledger target.rolloutIdFingerprint");
  }
  if (review.target?.rolloutTrack !== runLedger.value.target?.rolloutTrack) {
    failures.push("target.rolloutTrack must match run ledger target.rolloutTrack");
  }
  if (review.target?.changeTicket !== runLedger.value.target?.changeTicket) {
    failures.push("target.changeTicket must match run ledger target.changeTicket");
  }
  validateScopeMatchesRunLedger(review.expansionScope, runLedger.value.expansionScope);
  validateLaunchWindowMatchesRunLedger(review.launchWindow, runLedger.value.launchWindow);
  validateSummaryMatchesRunLedger(review.runSummary, runLedger.value.summary);
}

function validateScopeMatchesRunLedger(reviewScope, ledgerScope) {
  if (!isRecord(reviewScope) || !isRecord(ledgerScope)) return;
  if (!sameArray(reviewScope.merchantFingerprints, ledgerScope.merchantFingerprints)) {
    failures.push("expansionScope.merchantFingerprints must match run ledger expansionScope.merchantFingerprints");
  }
  if (!sameArray(reviewScope.channels, ledgerScope.channels)) {
    failures.push("expansionScope.channels must match run ledger expansionScope.channels");
  }
  if (!sameArray(reviewScope.allowedActions, ledgerScope.allowedActions)) {
    failures.push("expansionScope.allowedActions must match run ledger expansionScope.allowedActions");
  }
  for (const key of [
    "maxMerchants",
    "maxDailyProviderWrites",
    "maxDailyProviderWritesPerMerchant",
    "maxCouponAmountCents",
    "businessHoursOnly",
  ]) {
    if (reviewScope[key] !== ledgerScope[key]) {
      failures.push(`expansionScope.${key} must match run ledger expansionScope.${key}`);
    }
  }
}

function validateLaunchWindowMatchesRunLedger(reviewWindow, ledgerWindow) {
  if (!isRecord(reviewWindow) || !isRecord(ledgerWindow)) return;
  for (const key of [
    "startsAt",
    "endsAt",
    "closedAt",
    "durationMinutes",
    "freezeWindowActive",
    "businessHoursOnly",
  ]) {
    if (reviewWindow[key] !== ledgerWindow[key]) {
      failures.push(`launchWindow.${key} must match run ledger launchWindow.${key}`);
    }
  }
}

function validateSummaryMatchesRunLedger(reviewSummary, ledgerSummary) {
  if (!isRecord(reviewSummary) || !isRecord(ledgerSummary)) return;
  const mappings = [
    ["totalRuns", "totalRuns"],
    ["succeededRuns", "succeededRuns"],
    ["failedRuns", "failedRuns"],
    ["rolledBackRuns", "rolledBackRuns"],
    ["blockedRuns", "blockedRuns"],
    ["complaintCount", "complaintCount"],
    ["customerRejectedCompensationCount", "customerRejectedCompensationCount"],
    ["allRunsReviewed", "allRunsReviewed"],
    ["failedRunsHaveIncidentNotes", "failedRunsHaveIncidentNotes"],
    ["rollbackActionsVerified", "rollbackActionsVerified"],
    ["customerComplaintsStoppedRollout", "customerComplaintsStoppedRollout"],
    ["compensationRejectionsStoppedRollout", "compensationRejectionsStoppedRollout"],
    ["merchantNotificationCompleted", "merchantNotificationCompleted"],
    ["billingImpactReviewed", "billingImpactReviewed"],
    ["supportSlaMaintained", "supportSlaMaintained"],
    ["noAutoCustomerReplies", "noAutoCustomerReplies"],
  ];
  for (const [reviewKey, ledgerKey] of mappings) {
    if (reviewSummary[reviewKey] !== ledgerSummary[ledgerKey]) {
      failures.push(`runSummary.${reviewKey} must match run ledger summary.${ledgerKey}`);
    }
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
    review: undefined,
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
    if (arg.startsWith("--review=")) {
      args.review = arg.slice("--review=".length);
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
    review:
      args.review ??
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_FILE,
    runLedger:
      args.runLedger ??
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_RUN_LEDGER_FILE,
    requirePass:
      args.requirePass ||
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_REQUIRE_PASS === "true",
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

function sameArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
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
