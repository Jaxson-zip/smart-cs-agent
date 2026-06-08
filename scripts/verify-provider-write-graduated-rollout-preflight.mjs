import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const COMMAND_NAME = "verify:provider-write-graduated-rollout-preflight";
const MAX_EVIDENCE_BYTES = 512 * 1024;
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
const RUN_LEDGER_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-controlled-expansion-run-ledger-artifacts",
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
  "commercialReadiness",
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
const PREFLIGHT_PREREQUISITE_KEYS = new Set([
  "providerWriteGraduatedRolloutApprovalVerifierPassed",
  "providerWriteGraduatedRolloutApprovalSha256",
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
  "manualApprovalBeforeNextWave",
  "rollbackOnAnyFailedMutation",
  "stopOnCustomerComplaint",
  "stopOnRejectedCompensation",
]);
const OPERATIONAL_CONTROL_KEYS = new Set([
  "operatorCoverageMinutes",
  "namedOpsLeadFingerprint",
  "incidentOwnerFingerprint",
  "rollbackOwnerFingerprint",
  "killSwitchOwnerFingerprint",
  "billingOwnerFingerprint",
  "supportOwnerFingerprint",
  "merchantNotificationPlanReady",
  "supportEscalationReady",
  "rollbackPlaybookReviewed",
  "alertRoutesReviewed",
  "rateLimitReviewed",
  "noAutomaticCustomerVisibleReplies",
]);
const COMMERCIAL_READINESS_KEYS = new Set([
  "billingPlanConfigured",
  "merchantNotificationPlanReviewed",
  "supportSlaReviewed",
  "pricingReviewed",
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
  "artifactBindings",
  "safety",
]);
const APPROVAL_TARGET_KEYS = new Set([
  "rolloutIdFingerprint",
  "fromRolloutTrack",
  "toRolloutTrack",
  "changeTicket",
]);
const APPROVAL_SCOPE_KEYS = new Set([
  "merchantFingerprints",
  "channels",
  "allowedActions",
  "maxMerchants",
  "maxDailyProviderWrites",
  "maxDailyProviderWritesPerMerchant",
  "maxCouponAmountCents",
  "businessHoursOnly",
  "automaticNextWaveEnabled",
]);
const APPROVAL_KEYS = new Set([
  "approvalStatus",
  "requestedByFingerprint",
  "approvedByFingerprint",
  "secondReviewerFingerprint",
  "approvedAt",
]);
const APPROVAL_PREREQUISITE_KEYS = new Set([
  "providerWriteControlledExpansionCloseoutReviewVerifierPassed",
  "providerWriteControlledExpansionCloseoutReviewSha256",
  "productionLaunchVerifierPassed",
  "productionStaticCiVerifierPassed",
  "productionBranchProtectionVerifierPassed",
  "productionAlertingVerifierPassed",
  "productionCanaryVerifierPassed",
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "providerWriteLiveExecutorControlPlaneVerifierPassed",
]);
const APPROVAL_OPERATIONAL_CONTROL_KEYS = new Set([
  "operatorCoverageMinutes",
  "namedOpsLeadFingerprint",
  "incidentOwnerFingerprint",
  "rollbackOwnerFingerprint",
  "killSwitchOwnerFingerprint",
  "billingOwnerFingerprint",
  "supportOwnerFingerprint",
  "rollbackPlaybookReviewed",
  "alertRoutesReviewed",
  "rateLimitReviewed",
  "supportEscalationReady",
  "merchantNotificationPlanReady",
  "noAutomaticCustomerVisibleReplies",
]);
const APPROVAL_COMMERCIAL_READINESS_KEYS = new Set([
  "customerContractReviewed",
  "billingPlanConfigured",
  "supportSlaReviewed",
  "merchantNotificationPlanReviewed",
  "pricingReviewed",
]);
const APPROVAL_ARTIFACT_BINDING_KEYS = new Set([
  "auditExportSha256",
  "productionLaunchSha256",
  "productionStaticCiSha256",
]);
const CLOSEOUT_TARGET_KEYS = new Set([
  "rolloutIdFingerprint",
  "rolloutTrack",
  "changeTicket",
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
const GRADUATED_ROLLOUT_ACTIONS = new Set([
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

  let preflight = null;
  let approval = null;
  let closeoutReview = null;
  let runLedger = null;

  if (hasValue(args.preflight)) {
    const evidence = readJsonFile(
      args.preflight,
      "provider write graduated rollout preflight",
      PREFLIGHT_ARTIFACT_DIR,
      "--preflight",
      "provider-write-graduated-rollout-preflight-artifacts",
    );
    if (evidence) {
      preflight = evidence.value;
      validatePreflight(preflight, args);
    }
  } else if (args.requirePass) {
    failures.push("provider write graduated rollout preflight evidence is required when pass evidence is required");
  }

  if (hasValue(args.approval)) {
    approval = readJsonFile(
      args.approval,
      "provider write graduated rollout approval",
      APPROVAL_ARTIFACT_DIR,
      "--approval",
      "provider-write-graduated-rollout-approval-artifacts",
    );
    if (approval) validateApproval(approval.value, args);
  } else if (args.requirePass) {
    failures.push("provider write graduated rollout approval evidence is required when pass evidence is required");
  }

  if (hasValue(args.closeoutReview)) {
    closeoutReview = readJsonFile(
      args.closeoutReview,
      "provider write controlled expansion closeout review",
      CLOSEOUT_REVIEW_ARTIFACT_DIR,
      "--closeout-review",
      "provider-write-controlled-expansion-closeout-review-artifacts",
    );
    if (closeoutReview) validateCloseoutReviewSource(closeoutReview.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion closeout review evidence is required when pass evidence is required");
  }

  if (hasValue(args.runLedger)) {
    runLedger = readJsonFile(
      args.runLedger,
      "provider write controlled expansion run ledger",
      RUN_LEDGER_ARTIFACT_DIR,
      "--run-ledger",
      "provider-write-controlled-expansion-run-ledger-artifacts",
    );
    if (runLedger) validateRunLedgerSource(runLedger.value);
  } else if (args.requirePass) {
    failures.push("provider write controlled expansion run ledger evidence is required when pass evidence is required");
  }

  if (preflight && approval) {
    validatePreflightApprovalBinding(preflight, approval);
    validatePreflightWithinApproval(preflight, approval.value);
  }
  if (approval && closeoutReview) {
    validateApprovalCloseoutBinding(approval.value, closeoutReview);
  }
  if (closeoutReview && runLedger) {
    validateCloseoutRunLedgerBinding(closeoutReview.value, runLedger);
  }

  if (failures.length > 0) {
    console.error("Provider write graduated rollout preflight verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write graduated rollout preflight verification passed.");
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
    preflightDocs: "docs/deploy/provider-write-graduated-rollout-preflight.md",
    approvalDocs: "docs/deploy/provider-write-graduated-rollout-approval.md",
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
    "verify:provider-write-graduated-rollout-preflight:safe",
    "\"verify:provider-write-graduated-rollout-preflight:safe\": \"node scripts/verify-provider-write-graduated-rollout-preflight.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-graduated-rollout-preflight.mjs",
  ]);

  mustContainAll("provider write graduated rollout preflight docs", content.preflightDocs, [
    "PR78 Provider Write Graduated Rollout Preflight Gate",
    "npm run verify:provider-write-graduated-rollout-preflight",
    "npm run verify:provider-write-graduated-rollout-preflight:safe",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_REQUIRE_PASS=true",
    "smart-cs-agent.provider-write-graduated-rollout-preflight.v1",
    "smart-cs-agent.provider-write-graduated-rollout-approval.v1",
    "smart-cs-agent.provider-write-controlled-expansion-closeout-review.v1",
    "smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1",
    "provider-write-graduated-rollout-preflight-artifacts/",
    "provider-write-graduated-rollout-approval-artifacts/",
    "provider-write-controlled-expansion-closeout-review-artifacts/",
    "provider-write-controlled-expansion-run-ledger-artifacts/",
    "graduated_multi_merchant",
    "providerWriteGraduatedRolloutApprovalVerifierPassed=true",
    "providerWriteGraduatedRolloutApprovalSha256",
    "providerWriteControlledExpansionCloseoutReviewSha256",
    "providerWriteControlledExpansionRunLedgerSha256",
    "freezeWindowActive=true",
    "automaticNextWaveEnabled=false",
    "manualApprovalBeforeNextWave=true",
    "rollbackOnAnyFailedMutation=true",
    "stopOnRejectedCompensation=true",
    "noAutomaticCustomerVisibleReplies=true",
    "does not enable provider writes",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not read production databases",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("approval docs reference PR78 follow-on", content.approvalDocs, [
    "PR78 Provider Write Graduated Rollout Preflight Gate",
    "verify:provider-write-graduated-rollout-preflight",
    "providerWriteGraduatedRolloutApprovalSha256",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR78 Provider Write Graduated Rollout Preflight Gate",
    "verify:provider-write-graduated-rollout-preflight",
    "smart-cs-agent.provider-write-graduated-rollout-preflight.v1",
    "providerWriteGraduatedRolloutApprovalSha256",
    "graduated_multi_merchant",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_APPROVAL_FILE",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR78 Provider Write Graduated Rollout Preflight Gate",
    "verify:provider-write-graduated-rollout-preflight",
    "providerWriteGraduatedRolloutApprovalVerifierPassed=true",
    "providerWriteGraduatedRolloutApprovalSha256",
    "graduated_multi_merchant",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "verify:provider-write-graduated-rollout-preflight",
    "verify:provider-write-graduated-rollout-preflight:safe",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_APPROVAL_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_CLOSEOUT_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_RUN_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-graduated-rollout-preflight.test.mjs",
    "npm run verify:provider-write-graduated-rollout-preflight",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-graduated-rollout-preflight.test.mjs",
    "npm run verify:provider-write-graduated-rollout-preflight",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "providerWriteGraduatedRolloutPreflight",
    "verify-provider-write-graduated-rollout-preflight.mjs",
    "verify:provider-write-graduated-rollout-preflight",
    "provider write graduated rollout preflight",
    "SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_FILE",
    "smart-cs-agent.provider-write-graduated-rollout-preflight.v1",
  ]);

  mustContainAll("task plan references PR78", content.taskPlan, [
    "PR78 - Provider Write Graduated Rollout Preflight Gate",
    "verify:provider-write-graduated-rollout-preflight",
  ]);

  mustContainAll("progress references PR78", content.progress, [
    "Started PR78 provider write graduated rollout preflight gate",
  ]);

  mustContainAll("gitignore graduated rollout preflight artifacts", content.gitignore, [
    "provider-write-graduated-rollout-preflight-artifacts/",
  ]);
}

function validatePreflight(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write graduated rollout preflight root must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    PREFLIGHT_ROOT_KEYS,
    "provider write graduated rollout preflight contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-graduated-rollout-preflight.v1") {
    failures.push("schemaVersion must be smart-cs-agent.provider-write-graduated-rollout-preflight.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("generatedAt must be an ISO timestamp");
  validatePreflightTarget(value.target);
  validatePreflightExpansionScope(value.expansionScope);
  validateLaunchWindow(value.launchWindow);
  validatePreflightPrerequisites(value.prerequisiteEvidence, options);
  validateRolloutPlan(value.rolloutPlan, value.expansionScope);
  validateOperationalControls(value.operationalControls, options);
  validateCommercialReadiness(value.commercialReadiness, options);
  validateAllFalseObject(value.safety, SAFETY_KEYS, "safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write graduated rollout preflight field",
    "forbidden sensitive provider write graduated rollout preflight value",
  );
}

function validatePreflightTarget(target) {
  if (!isRecord(target)) {
    failures.push("target must be an object");
    return;
  }
  validateAllowedKeys(target, PREFLIGHT_TARGET_KEYS, "target contains unsupported field");
  validateFingerprint("target.rolloutIdFingerprint", target.rolloutIdFingerprint);
  if (target.rolloutTrack !== "graduated_multi_merchant") {
    failures.push("target.rolloutTrack must be graduated_multi_merchant");
  }
  if (
    typeof target.changeTicket !== "string" ||
    !SAFE_CHANGE_TICKET_PATTERN.test(target.changeTicket)
  ) {
    failures.push("target.changeTicket must be a safe change ticket id");
  }
}

function validatePreflightExpansionScope(scope) {
  if (!isRecord(scope)) {
    failures.push("expansionScope must be an object");
    return;
  }
  validateAllowedKeys(scope, EXPANSION_SCOPE_KEYS, "expansionScope contains unsupported field");
  validateFingerprintArray("expansionScope.merchantFingerprints", scope.merchantFingerprints, 1, 10);
  validateEnumArray("expansionScope.channels", scope.channels, CHANNELS, 1, 2);
  validateEnumArray(
    "expansionScope.allowedActions",
    scope.allowedActions,
    GRADUATED_ROLLOUT_ACTIONS,
    1,
    3,
  );
  validateIntegerInRange("expansionScope.maxMerchants", scope.maxMerchants, 1, 10);
  if (
    Array.isArray(scope.merchantFingerprints) &&
    Number.isInteger(scope.maxMerchants) &&
    scope.maxMerchants < scope.merchantFingerprints.length
  ) {
    failures.push("expansionScope.maxMerchants must cover merchantFingerprints");
  }
  validateIntegerInRange("expansionScope.maxDailyProviderWrites", scope.maxDailyProviderWrites, 1, 200);
  validateIntegerInRange(
    "expansionScope.maxDailyProviderWritesPerMerchant",
    scope.maxDailyProviderWritesPerMerchant,
    1,
    25,
  );
  validateIntegerInRange("expansionScope.maxCouponAmountCents", scope.maxCouponAmountCents, 0, 5000);
  if (scope.businessHoursOnly !== true) failures.push("expansionScope.businessHoursOnly must be true");
}

function validateLaunchWindow(value) {
  if (!isRecord(value)) {
    failures.push("launchWindow must be an object");
    return;
  }
  validateAllowedKeys(value, LAUNCH_WINDOW_KEYS, "launchWindow contains unsupported field");
  if (!isIsoTimestamp(value.startsAt)) failures.push("launchWindow.startsAt must be an ISO timestamp");
  if (!isIsoTimestamp(value.endsAt)) failures.push("launchWindow.endsAt must be an ISO timestamp");
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

function validatePreflightPrerequisites(value, options) {
  if (!isRecord(value)) {
    failures.push("prerequisiteEvidence must be an object");
    return;
  }
  validateAllowedKeys(value, PREFLIGHT_PREREQUISITE_KEYS, "prerequisiteEvidence contains unsupported field");
  validateSha256(
    "prerequisiteEvidence.providerWriteGraduatedRolloutApprovalSha256",
    value.providerWriteGraduatedRolloutApprovalSha256,
  );
  for (const key of PREFLIGHT_PREREQUISITE_KEYS) {
    if (key.endsWith("Sha256")) continue;
    validateBoolean(`prerequisiteEvidence.${key}`, value[key]);
    if ((options.requirePass || hasValue(options.preflight)) && value[key] !== true) {
      failures.push(`prerequisiteEvidence.${key} must be true`);
    }
  }
}

function validateRolloutPlan(value, scope) {
  if (!isRecord(value)) {
    failures.push("rolloutPlan must be an object");
    return;
  }
  validateAllowedKeys(value, ROLLOUT_PLAN_KEYS, "rolloutPlan contains unsupported field");
  validateIntegerInRange("rolloutPlan.waveCount", value.waveCount, 1, 1);
  validateIntegerInRange("rolloutPlan.maxMerchantsPerWave", value.maxMerchantsPerWave, 1, 10);
  if (
    Number.isInteger(value.maxMerchantsPerWave) &&
    Number.isInteger(scope?.maxMerchants) &&
    value.maxMerchantsPerWave > scope.maxMerchants
  ) {
    failures.push("rolloutPlan.maxMerchantsPerWave must not exceed expansionScope.maxMerchants");
  }
  validateIntegerInRange("rolloutPlan.holdMinutesBetweenWaves", value.holdMinutesBetweenWaves, 240, 10080);
  if (value.automaticNextWaveEnabled !== false) {
    failures.push("rolloutPlan.automaticNextWaveEnabled must be false");
  }
  if (value.manualApprovalBeforeNextWave !== true) {
    failures.push("rolloutPlan.manualApprovalBeforeNextWave must be true");
  }
  if (value.rollbackOnAnyFailedMutation !== true) {
    failures.push("rolloutPlan.rollbackOnAnyFailedMutation must be true");
  }
  if (value.stopOnCustomerComplaint !== true) {
    failures.push("rolloutPlan.stopOnCustomerComplaint must be true");
  }
  if (value.stopOnRejectedCompensation !== true) {
    failures.push("rolloutPlan.stopOnRejectedCompensation must be true");
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
    480,
    10080,
  );
  const owners = [
    "namedOpsLeadFingerprint",
    "incidentOwnerFingerprint",
    "rollbackOwnerFingerprint",
    "killSwitchOwnerFingerprint",
    "billingOwnerFingerprint",
    "supportOwnerFingerprint",
  ];
  const ownerValues = [];
  for (const key of owners) {
    validateFingerprint(`operationalControls.${key}`, value[key]);
    if (typeof value[key] === "string") ownerValues.push(value[key]);
  }
  if (ownerValues.length === owners.length && new Set(ownerValues).size !== ownerValues.length) {
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
    validateBoolean(`operationalControls.${key}`, value[key]);
    if ((options.requirePass || hasValue(options.preflight)) && value[key] !== true) {
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
    if ((options.requirePass || hasValue(options.preflight)) && value[key] !== true) {
      failures.push(`commercialReadiness.${key} must be true`);
    }
  }
}

function validateApproval(value, options) {
  if (!isRecord(value)) {
    failures.push("provider write graduated rollout approval root must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_ROOT_KEYS,
    "provider write graduated rollout approval contains unsupported field",
  );
  if (value.schemaVersion !== "smart-cs-agent.provider-write-graduated-rollout-approval.v1") {
    failures.push("approval.schemaVersion must be smart-cs-agent.provider-write-graduated-rollout-approval.v1");
  }
  if (!isIsoTimestamp(value.generatedAt)) failures.push("approval.generatedAt must be an ISO timestamp");
  validateApprovalTarget(value.target);
  validateApprovalExpansionScope(value.expansionScope);
  validateApprovalSection(value.approval, options);
  validateApprovalPrerequisites(value.prerequisiteEvidence, options);
  validateApprovalOperationalControls(value.operationalControls, options);
  validateApprovalCommercialReadiness(value.commercialReadiness, options);
  validateApprovalArtifactBindings(value.artifactBindings);
  validateAllFalseObject(value.safety, SAFETY_KEYS, "approval.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write graduated rollout preflight field",
    "forbidden sensitive provider write graduated rollout preflight value",
  );
}

function validateApprovalTarget(target) {
  if (!isRecord(target)) {
    failures.push("approval.target must be an object");
    return;
  }
  validateAllowedKeys(target, APPROVAL_TARGET_KEYS, "approval.target contains unsupported field");
  validateFingerprint("approval.target.rolloutIdFingerprint", target.rolloutIdFingerprint);
  if (target.fromRolloutTrack !== "controlled_multi_merchant") {
    failures.push("approval.target.fromRolloutTrack must be controlled_multi_merchant");
  }
  if (target.toRolloutTrack !== "graduated_multi_merchant") {
    failures.push("approval.target.toRolloutTrack must be graduated_multi_merchant");
  }
  if (
    typeof target.changeTicket !== "string" ||
    !SAFE_CHANGE_TICKET_PATTERN.test(target.changeTicket)
  ) {
    failures.push("approval.target.changeTicket must be a safe change ticket id");
  }
}

function validateApprovalExpansionScope(scope) {
  if (!isRecord(scope)) {
    failures.push("approval.expansionScope must be an object");
    return;
  }
  validateAllowedKeys(scope, APPROVAL_SCOPE_KEYS, "approval.expansionScope contains unsupported field");
  validateFingerprintArray("approval.expansionScope.merchantFingerprints", scope.merchantFingerprints, 3, 25);
  validateEnumArray("approval.expansionScope.channels", scope.channels, CHANNELS, 1, 2);
  validateEnumArray(
    "approval.expansionScope.allowedActions",
    scope.allowedActions,
    GRADUATED_ROLLOUT_ACTIONS,
    1,
    3,
  );
  validateIntegerInRange("approval.expansionScope.maxMerchants", scope.maxMerchants, 3, 25);
  validateIntegerInRange("approval.expansionScope.maxDailyProviderWrites", scope.maxDailyProviderWrites, 1, 250);
  validateIntegerInRange(
    "approval.expansionScope.maxDailyProviderWritesPerMerchant",
    scope.maxDailyProviderWritesPerMerchant,
    1,
    50,
  );
  validateIntegerInRange("approval.expansionScope.maxCouponAmountCents", scope.maxCouponAmountCents, 0, 5000);
  if (scope.businessHoursOnly !== true) failures.push("approval.expansionScope.businessHoursOnly must be true");
  if (scope.automaticNextWaveEnabled !== false) {
    failures.push("approval.expansionScope.automaticNextWaveEnabled must be false");
  }
}

function validateApprovalSection(approval, options) {
  if (!isRecord(approval)) {
    failures.push("approval.approval must be an object");
    return;
  }
  validateAllowedKeys(approval, APPROVAL_KEYS, "approval.approval contains unsupported field");
  if (approval.approvalStatus !== "approved") {
    failures.push("approval.approvalStatus must be approved");
  }
  validateFingerprint("approval.requestedByFingerprint", approval.requestedByFingerprint);
  validateFingerprint("approval.approvedByFingerprint", approval.approvedByFingerprint);
  validateFingerprint("approval.secondReviewerFingerprint", approval.secondReviewerFingerprint);
  const reviewers = [
    approval.requestedByFingerprint,
    approval.approvedByFingerprint,
    approval.secondReviewerFingerprint,
  ].filter((item) => typeof item === "string");
  if (new Set(reviewers).size !== reviewers.length) failures.push("approval reviewers must be distinct");
  if (!isIsoTimestamp(approval.approvedAt)) failures.push("approval.approvedAt must be an ISO timestamp");
  if ((options.requirePass || hasValue(options.approval)) && approval.approvalStatus !== "approved") {
    failures.push("approval.approvalStatus must be approved");
  }
}

function validateApprovalPrerequisites(value, options) {
  if (!isRecord(value)) {
    failures.push("approval.prerequisiteEvidence must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_PREREQUISITE_KEYS,
    "approval.prerequisiteEvidence contains unsupported field",
  );
  validateSha256(
    "approval.prerequisiteEvidence.providerWriteControlledExpansionCloseoutReviewSha256",
    value.providerWriteControlledExpansionCloseoutReviewSha256,
  );
  for (const key of APPROVAL_PREREQUISITE_KEYS) {
    if (key.endsWith("Sha256")) continue;
    validateBoolean(`approval.prerequisiteEvidence.${key}`, value[key]);
    if ((options.requirePass || hasValue(options.approval)) && value[key] !== true) {
      failures.push(`approval.prerequisiteEvidence.${key} must be true`);
    }
  }
}

function validateApprovalOperationalControls(value, options) {
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
    480,
    10080,
  );
  for (const key of [
    "namedOpsLeadFingerprint",
    "incidentOwnerFingerprint",
    "rollbackOwnerFingerprint",
    "killSwitchOwnerFingerprint",
    "billingOwnerFingerprint",
    "supportOwnerFingerprint",
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
  ]) {
    validateBoolean(`approval.operationalControls.${key}`, value[key]);
    if ((options.requirePass || hasValue(options.approval)) && value[key] !== true) {
      failures.push(`approval.operationalControls.${key} must be true`);
    }
  }
}

function validateApprovalCommercialReadiness(value, options) {
  if (!isRecord(value)) {
    failures.push("approval.commercialReadiness must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_COMMERCIAL_READINESS_KEYS,
    "approval.commercialReadiness contains unsupported field",
  );
  for (const key of APPROVAL_COMMERCIAL_READINESS_KEYS) {
    validateBoolean(`approval.commercialReadiness.${key}`, value[key]);
    if ((options.requirePass || hasValue(options.approval)) && value[key] !== true) {
      failures.push(`approval.commercialReadiness.${key} must be true`);
    }
  }
}

function validateApprovalArtifactBindings(value) {
  if (!isRecord(value)) {
    failures.push("approval.artifactBindings must be an object");
    return;
  }
  validateAllowedKeys(
    value,
    APPROVAL_ARTIFACT_BINDING_KEYS,
    "approval.artifactBindings contains unsupported field",
  );
  const hashes = [];
  for (const key of APPROVAL_ARTIFACT_BINDING_KEYS) {
    validateSha256(`approval.artifactBindings.${key}`, value[key]);
    if (typeof value[key] === "string") hashes.push(value[key]);
  }
  if (
    hashes.length === APPROVAL_ARTIFACT_BINDING_KEYS.size &&
    new Set(hashes).size !== hashes.length
  ) {
    failures.push("approval.artifactBindings hashes must be distinct");
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
  validateCloseoutTarget(value.target, "closeout review.target");
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
    "forbidden sensitive provider write graduated rollout preflight field",
    "forbidden sensitive provider write graduated rollout preflight value",
  );
}

function validateRunLedgerSource(value) {
  if (!isRecord(value)) {
    failures.push("run ledger root must be an object");
    return;
  }
  if (value.schemaVersion !== "smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1") {
    failures.push("run ledger.schemaVersion must be smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1");
  }
  validateCloseoutTarget(value.target, "run ledger.target");
  if (value.summary?.allRunsReviewed !== true) failures.push("run ledger.summary.allRunsReviewed must be true");
  if (value.summary?.customerComplaintsStoppedRollout !== true) {
    failures.push("run ledger.summary.customerComplaintsStoppedRollout must be true");
  }
  if (value.summary?.noAutoCustomerReplies !== true) {
    failures.push("run ledger.summary.noAutoCustomerReplies must be true");
  }
  validateAllFalseObject(value.safety, RUN_LEDGER_SAFETY_KEYS, "run ledger.safety");
  validateNoSensitiveFields(
    value,
    "forbidden sensitive provider write graduated rollout preflight field",
    "forbidden sensitive provider write graduated rollout preflight value",
  );
}

function validateCloseoutTarget(target, label) {
  if (!isRecord(target)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(target, CLOSEOUT_TARGET_KEYS, `${label} contains unsupported field`);
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

function validatePreflightApprovalBinding(preflight, approvalEvidence) {
  if (
    preflight?.prerequisiteEvidence?.providerWriteGraduatedRolloutApprovalSha256 !==
    approvalEvidence.sha256
  ) {
    failures.push("prerequisiteEvidence.providerWriteGraduatedRolloutApprovalSha256 must match the approval file sha256");
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

function validateCloseoutRunLedgerBinding(closeoutReview, runLedger) {
  if (
    closeoutReview?.artifactBindings?.providerWriteControlledExpansionRunLedgerSha256 !==
    runLedger.sha256
  ) {
    failures.push("closeout review artifactBindings.providerWriteControlledExpansionRunLedgerSha256 must match the run ledger file sha256");
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
    preflight: undefined,
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
    if (arg.startsWith("--preflight=")) {
      args.preflight = arg.slice("--preflight=".length);
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
    preflight:
      args.preflight ??
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_FILE,
    approval:
      args.approval ??
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_APPROVAL_FILE,
    closeoutReview:
      args.closeoutReview ??
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_CLOSEOUT_REVIEW_FILE,
    runLedger:
      args.runLedger ??
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_RUN_LEDGER_FILE,
    requirePass:
      args.requirePass ||
      env.SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_REQUIRE_PASS === "true",
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
