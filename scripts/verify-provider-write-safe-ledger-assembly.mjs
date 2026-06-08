import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const COMMAND_NAME = "verify:provider-write-safe-ledger-assembly";
const MAX_ARTIFACT_BYTES = 512 * 1024;
const DRAFT_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-live-pilot-run-ledger-draft-artifacts",
);
const REVIEW_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-manual-closeout-review-artifacts",
);
const LEDGER_ARTIFACT_DIR = resolve(
  repoRoot,
  "provider-write-live-pilot-run-ledger-artifacts",
);

const DRAFT_ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "launchWindow",
  "summary",
  "runRecords",
  "evidenceReadiness",
  "safety",
]);
const REVIEW_ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "launchWindow",
  "runSummary",
  "reviewers",
  "closeout",
  "evidence",
  "artifactBindings",
  "safety",
]);
const LEDGER_ROOT_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "target",
  "launchWindow",
  "summary",
  "runRecords",
  "evidence",
  "artifactBindings",
  "safety",
]);
const DRAFT_TARGET_KEYS = new Set([
  "tenantFingerprint",
  "channel",
  "rolloutTrack",
  "changeTicketFingerprint",
]);
const TARGET_KEYS = new Set([
  "tenantFingerprint",
  "channel",
  "rolloutTrack",
  "changeTicket",
]);
const LAUNCH_WINDOW_KEYS = new Set([
  "startsAt",
  "endsAt",
  "closedAt",
  "durationMinutes",
  "freezeWindowActive",
]);
const DRAFT_SUMMARY_KEYS = new Set([
  "totalRuns",
  "dryRunRecordedRuns",
  "blockedRuns",
  "failedRuns",
  "allRunsReviewed",
  "failedRunsHaveIncidentNotes",
  "rollbackActionsVerified",
  "noAutoCustomerReplies",
  "readyForSafeLedger",
  "missingSafeLedgerInputs",
]);
const LEDGER_SUMMARY_KEYS = new Set([
  "totalRuns",
  "succeededRuns",
  "failedRuns",
  "rolledBackRuns",
  "blockedRuns",
  "allRunsReviewed",
  "failedRunsHaveIncidentNotes",
  "rollbackActionsVerified",
  "noAutoCustomerReplies",
]);
const REVIEW_SUMMARY_KEYS = new Set([
  "totalRuns",
  "succeededRuns",
  "failedRuns",
  "rolledBackRuns",
  "blockedRuns",
  "failedProviderMutationRuns",
  "allRunsReviewed",
  "failedRunsHaveIncidentNotes",
  "rollbackActionsVerified",
  "noAutoCustomerReplies",
]);
const REVIEWER_KEYS = new Set([
  "releaseOwnerFingerprint",
  "operationsReviewerFingerprint",
  "rollbackOwnerFingerprint",
  "reviewedAt",
  "secondReviewCompleted",
]);
const CLOSEOUT_KEYS = new Set([
  "decision",
  "customerImpactReviewed",
  "providerMutationReviewCompleted",
  "incidentReviewCompleted",
  "rollbackReviewCompleted",
  "evidencePackageReviewed",
  "outstandingActions",
]);
const DRAFT_RUN_KEYS = new Set([
  "runFingerprint",
  "requestFingerprint",
  "executionAttemptFingerprint",
  "operatorFingerprint",
  "reviewerFingerprint",
  "rollbackOwnerFingerprint",
  "action",
  "riskLevel",
  "status",
  "networkExecution",
  "providerMutationExecuted",
  "customerVisibleMessageSent",
  "payloadEscrowOpened",
  "providerPayloadStored",
  "providerResponseStored",
  "policyReason",
  "createdAt",
  "completedAt",
]);
const LEDGER_RUN_KEYS = new Set([
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
  "createdAt",
  "completedAt",
]);
const DRAFT_EVIDENCE_KEYS = new Set([
  "draftOnly",
  "requiresArtifactBindings",
  "canPassPr69SafeLedger",
]);
const REVIEW_EVIDENCE_KEYS = new Set([
  "ledgerDraftExportReviewed",
  "auditExportReviewed",
  "providerWriteLivePilotRunLedgerVerifierReady",
  "productionLaunchVerifierPassed",
]);
const LEDGER_EVIDENCE_KEYS = new Set([
  "providerWriteLivePilotPreflightVerifierPassed",
  "productionProviderWriteApprovalVerifierPassed",
  "providerWriteKillSwitchControlPlaneVerifierPassed",
  "providerWriteManualCloseoutReviewVerifierPassed",
  "auditExportVerified",
  "postPilotReviewCompleted",
  "productionLaunchVerifierPassed",
]);
const REVIEW_ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteLivePilotRunLedgerDraftSha256",
  "auditExportSha256",
  "productionLaunchSha256",
]);
const LEDGER_ARTIFACT_BINDING_KEYS = new Set([
  "providerWriteLivePilotPreflightSha256",
  "productionProviderWriteApprovalSha256",
  "providerWriteKillSwitchControlPlaneSha256",
  "providerWriteLiveExecutorStartupGuardSha256",
  "providerWriteLiveExecutorControlPlaneSha256",
  "providerWriteManualCloseoutReviewSha256",
  "productionLaunchSha256",
  "auditExportSha256",
]);
const DRAFT_SAFETY_KEYS = new Set([
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
const REVIEW_SAFETY_KEYS = new Set([
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
const LEDGER_SAFETY_KEYS = new Set([
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
const DRAFT_STATUSES = new Set(["dry_run_recorded", "blocked", "failed"]);
const LEDGER_STATUSES = new Set(["succeeded", "failed", "rolled_back", "blocked"]);
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

  const draftEvidence = hasValue(args.draft)
    ? readJsonArtifact(args.draft, "draft", DRAFT_ARTIFACT_DIR)
    : null;
  const reviewEvidence = hasValue(args.review)
    ? readJsonArtifact(args.review, "manual closeout review", REVIEW_ARTIFACT_DIR)
    : null;
  const ledgerEvidence = hasValue(args.ledger)
    ? readJsonArtifact(args.ledger, "final ledger", LEDGER_ARTIFACT_DIR)
    : null;

  if (!draftEvidence && args.requirePass) {
    failures.push("provider write safe ledger assembly draft evidence is required when pass evidence is required");
  }
  if (!reviewEvidence && args.requirePass) {
    failures.push("provider write safe ledger assembly manual closeout review evidence is required when pass evidence is required");
  }
  if (!ledgerEvidence && args.requirePass) {
    failures.push("provider write safe ledger assembly final ledger evidence is required when pass evidence is required");
  }

  if (draftEvidence) validateDraft(draftEvidence.value);
  if (reviewEvidence) validateReview(reviewEvidence.value);
  if (ledgerEvidence) validateLedger(ledgerEvidence.value);
  if (draftEvidence && reviewEvidence && ledgerEvidence) {
    validateAssembly(draftEvidence, reviewEvidence, ledgerEvidence);
  }

  if (failures.length > 0) {
    console.error("Provider write safe ledger assembly verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Provider write safe ledger assembly verification passed.");
  if (draftEvidence && reviewEvidence && ledgerEvidence) {
    const ledger = ledgerEvidence.value;
    console.log(`- channel=${ledger.target.channel}`);
    console.log(`- runs=${ledger.runRecords.length}`);
    console.log("- assembly=verified");
  } else {
    console.log("- assembly=skipped");
  }
}

function readStaticContent() {
  const files = {
    packageJson: "package.json",
    gitignore: ".gitignore",
    assemblyDocs: "docs/deploy/provider-write-safe-ledger-assembly.md",
    ledgerDocs: "docs/deploy/provider-write-live-pilot-run-ledger.md",
    closeoutDocs: "docs/deploy/provider-write-manual-closeout-review.md",
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
    "verify:provider-write-safe-ledger-assembly:safe",
    "\"verify:provider-write-safe-ledger-assembly:safe\": \"node scripts/verify-provider-write-safe-ledger-assembly.mjs --from-env --require-pass\"",
    "scripts/verify-provider-write-safe-ledger-assembly.mjs",
  ]);

  mustContainAll("provider write safe ledger assembly docs", content.assemblyDocs, [
    "PR72 Provider Write Safe Ledger Assembly Gate",
    "npm run verify:provider-write-safe-ledger-assembly",
    "npm run verify:provider-write-safe-ledger-assembly:safe",
    "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_DRAFT_FILE",
    "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REQUIRE_PASS=true",
    "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1",
    "smart-cs-agent.provider-write-manual-closeout-review.v1",
    "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
    "providerWriteLivePilotRunLedgerDraftSha256",
    "providerWriteManualCloseoutReviewSha256",
    "auditExportSha256",
    "productionLaunchSha256",
    "draftOnly=true",
    "readyForSafeLedger=false",
    "canPassPr69SafeLedger=false",
    "approved_for_safe_ledger",
    "does not call provider APIs",
    "does not execute provider writes",
    "does not read provider credentials",
    "does not open payload escrow",
    "does not send customer-visible replies",
  ]);

  mustContainAll("provider write live pilot run ledger docs", content.ledgerDocs, [
    "PR72 Provider Write Safe Ledger Assembly Gate",
    "verify:provider-write-safe-ledger-assembly",
    "providerWriteLivePilotRunLedgerDraftSha256",
    "providerWriteManualCloseoutReviewSha256",
    "docs/deploy/provider-write-safe-ledger-assembly.md",
  ]);

  mustContainAll("provider write manual closeout review docs", content.closeoutDocs, [
    "PR72",
    "verify:provider-write-safe-ledger-assembly",
    "providerWriteLivePilotRunLedgerDraftSha256",
    "providerWriteManualCloseoutReviewSha256",
  ]);

  mustContainAll("provider write requests docs", content.providerWriteDocs, [
    "PR72 Provider Write Safe Ledger Assembly Gate",
    "verify:provider-write-safe-ledger-assembly",
    "providerWriteLivePilotRunLedgerDraftSha256",
    "providerWriteManualCloseoutReviewSha256",
  ]);

  mustContainAll("production readiness docs", content.productionReadiness, [
    "PR72 Provider Write Safe Ledger Assembly Gate",
    "verify:provider-write-safe-ledger-assembly",
    "draftOnly=true",
    "readyForSafeLedger=false",
    "canPassPr69SafeLedger=false",
  ]);

  mustContainAll("launch runbook docs", content.launchRunbook, [
    "PR70 must remain `draftOnly=true`, `readyForSafeLedger=false`, and `canPassPr69SafeLedger=false`",
    "npm run verify:provider-write-safe-ledger-assembly",
    "npm run verify:provider-write-safe-ledger-assembly:safe",
    "docs/deploy/provider-write-safe-ledger-assembly.md",
    "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_DRAFT_FILE",
    "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REVIEW_FILE",
    "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_LEDGER_FILE",
    "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REQUIRE_PASS=true",
  ]);

  mustContainAll("static CI wiring", content.staticCiWorkflow, [
    "node --test scripts/verify-provider-write-safe-ledger-assembly.test.mjs",
    "npm run verify:provider-write-safe-ledger-assembly",
  ]);

  mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
    "node --test scripts/verify-provider-write-safe-ledger-assembly.test.mjs",
    "npm run verify:provider-write-safe-ledger-assembly",
  ]);

  mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
    "providerWriteSafeLedgerAssembly",
    "verify:provider-write-safe-ledger-assembly",
    "provider write safe ledger assembly",
    "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_DRAFT_FILE",
  ]);

  mustContainAll("task plan references PR72", content.taskPlan, [
    "PR72 - Provider Write Safe Ledger Assembly Gate",
    "verify:provider-write-safe-ledger-assembly",
  ]);

  mustContainAll("progress references PR72", content.progress, [
    "Started PR72 provider write safe ledger assembly gate",
    "Added PR72 verifier tests",
  ]);

  mustContainAll("gitignore draft artifacts", content.gitignore, [
    "provider-write-live-pilot-run-ledger-draft-artifacts/",
  ]);
}

function validateDraft(value) {
  if (!isRecord(value)) {
    failures.push("draft root must be an object");
    return;
  }
  validateAllowedKeys(value, DRAFT_ROOT_KEYS, "draft contains unsupported field");
  if (value.schemaVersion !== "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1") {
    failures.push("draft.schemaVersion must be smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1");
  }
  validateTarget(value.target, DRAFT_TARGET_KEYS, "draft.target", true);
  validateLaunchWindow(value.launchWindow, "draft.launchWindow");
  validateDraftSummary(value.summary, value.runRecords);
  validateDraftRunRecords(value.runRecords);
  validateAllTrueFalseEvidence(value.evidenceReadiness, DRAFT_EVIDENCE_KEYS, "draft.evidenceReadiness", {
    draftOnly: true,
    requiresArtifactBindings: true,
    canPassPr69SafeLedger: false,
  });
  validateAllFalseObject(value.safety, DRAFT_SAFETY_KEYS, "draft.safety");
  validateNoSensitiveFields(value, "draft");
}

function validateReview(value) {
  if (!isRecord(value)) {
    failures.push("manual closeout review root must be an object");
    return;
  }
  validateAllowedKeys(value, REVIEW_ROOT_KEYS, "manual closeout review contains unsupported field");
  if (value.schemaVersion !== "smart-cs-agent.provider-write-manual-closeout-review.v1") {
    failures.push("review.schemaVersion must be smart-cs-agent.provider-write-manual-closeout-review.v1");
  }
  validateTarget(value.target, TARGET_KEYS, "review.target", false);
  validateLaunchWindow(value.launchWindow, "review.launchWindow");
  validateReviewRunSummary(value.runSummary);
  validateReviewers(value.reviewers);
  validateCloseout(value.closeout);
  validateAllTrueObject(value.evidence, REVIEW_EVIDENCE_KEYS, "review.evidence");
  validateArtifactBindings(value.artifactBindings, REVIEW_ARTIFACT_BINDING_KEYS, "review.artifactBindings");
  validateAllFalseObject(value.safety, REVIEW_SAFETY_KEYS, "review.safety");
  validateNoSensitiveFields(value, "manual closeout review");
}

function validateLedger(value) {
  if (!isRecord(value)) {
    failures.push("final ledger root must be an object");
    return;
  }
  validateAllowedKeys(value, LEDGER_ROOT_KEYS, "final ledger contains unsupported field");
  if (value.schemaVersion !== "smart-cs-agent.provider-write-live-pilot-run-ledger.v1") {
    failures.push("ledger.schemaVersion must be smart-cs-agent.provider-write-live-pilot-run-ledger.v1");
  }
  validateTarget(value.target, TARGET_KEYS, "ledger.target", false);
  validateLaunchWindow(value.launchWindow, "ledger.launchWindow");
  validateLedgerRunRecords(value.runRecords);
  validateLedgerSummary(value.summary, value.runRecords);
  validateAllTrueObject(value.evidence, LEDGER_EVIDENCE_KEYS, "ledger.evidence");
  validateArtifactBindings(value.artifactBindings, LEDGER_ARTIFACT_BINDING_KEYS, "ledger.artifactBindings");
  validateAllFalseObject(value.safety, LEDGER_SAFETY_KEYS, "ledger.safety");
  validateNoSensitiveFields(value, "final ledger");
}

function validateAssembly(draftEvidence, reviewEvidence, ledgerEvidence) {
  const draft = draftEvidence.value;
  const review = reviewEvidence.value;
  const ledger = ledgerEvidence.value;

  if (!isRecord(draft) || !isRecord(review) || !isRecord(ledger)) return;

  if (review.artifactBindings?.providerWriteLivePilotRunLedgerDraftSha256 !== draftEvidence.sha256) {
    failures.push("review.artifactBindings.providerWriteLivePilotRunLedgerDraftSha256 must match the draft file sha256");
  }
  if (ledger.artifactBindings?.providerWriteManualCloseoutReviewSha256 !== reviewEvidence.sha256) {
    failures.push("ledger.artifactBindings.providerWriteManualCloseoutReviewSha256 must match the manual closeout review file sha256");
  }

  if (review.artifactBindings?.auditExportSha256 !== ledger.artifactBindings?.auditExportSha256) {
    failures.push("review and ledger auditExportSha256 must match");
  }
  if (review.artifactBindings?.productionLaunchSha256 !== ledger.artifactBindings?.productionLaunchSha256) {
    failures.push("review and ledger productionLaunchSha256 must match");
  }

  compareTargets(draft.target, review.target, ledger.target);
  compareLaunchWindows(draft.launchWindow, review.launchWindow, ledger.launchWindow);
  compareSummaries(review.runSummary, ledger.summary, ledger.runRecords);
  compareRunCorrelation(draft.runRecords, ledger.runRecords);
}

function compareTargets(draftTarget, reviewTarget, ledgerTarget) {
  if (!isRecord(draftTarget) || !isRecord(reviewTarget) || !isRecord(ledgerTarget)) return;
  for (const key of ["tenantFingerprint", "channel", "rolloutTrack"]) {
    if (draftTarget[key] !== reviewTarget[key] || draftTarget[key] !== ledgerTarget[key]) {
      failures.push(`target.${key} must match across draft, review, and ledger`);
    }
  }
  if (reviewTarget.changeTicket !== ledgerTarget.changeTicket) {
    failures.push("review.target.changeTicket must match ledger.target.changeTicket");
  }
  if (!hasValue(reviewTarget.changeTicket)) {
    failures.push("review.target.changeTicket is required to verify draft fingerprint");
    return;
  }
  const expectedFingerprint = shortHashFor(
    "provider_write_ledger_change_ticket",
    reviewTarget.changeTicket,
  );
  if (draftTarget.changeTicketFingerprint !== expectedFingerprint) {
    failures.push("draft.target.changeTicketFingerprint must match the review and ledger change ticket");
  }
}

function compareLaunchWindows(draftWindow, reviewWindow, ledgerWindow) {
  if (!isRecord(draftWindow) || !isRecord(reviewWindow) || !isRecord(ledgerWindow)) return;
  for (const key of [
    "startsAt",
    "endsAt",
    "closedAt",
    "durationMinutes",
    "freezeWindowActive",
  ]) {
    if (draftWindow[key] !== reviewWindow[key] || draftWindow[key] !== ledgerWindow[key]) {
      failures.push(`launchWindow.${key} must match across draft, review, and ledger`);
    }
  }
}

function compareSummaries(reviewSummary, ledgerSummary, ledgerRuns) {
  if (!isRecord(reviewSummary) || !isRecord(ledgerSummary) || !Array.isArray(ledgerRuns)) return;
  for (const key of [
    "totalRuns",
    "succeededRuns",
    "failedRuns",
    "rolledBackRuns",
    "blockedRuns",
    "allRunsReviewed",
    "failedRunsHaveIncidentNotes",
    "rollbackActionsVerified",
    "noAutoCustomerReplies",
  ]) {
    if (reviewSummary[key] !== ledgerSummary[key]) {
      failures.push(`review.runSummary.${key} must match ledger.summary.${key}`);
    }
  }
  const failedProviderMutationRuns = ledgerRuns.filter(
    (run) =>
      isRecord(run) &&
      run.status === "failed" &&
      run.providerMutationExecuted === true,
  ).length;
  if (reviewSummary.failedProviderMutationRuns !== failedProviderMutationRuns) {
    failures.push("review.runSummary.failedProviderMutationRuns must match failed provider mutation runs in ledger");
  }
}

function compareRunCorrelation(draftRuns, ledgerRuns) {
  if (!Array.isArray(draftRuns) || !Array.isArray(ledgerRuns)) return;
  const draftPairs = fingerprintPairSet(draftRuns, "draft.runRecords");
  const ledgerPairs = fingerprintPairSet(ledgerRuns, "ledger.runRecords");
  for (const pair of draftPairs) {
    if (!ledgerPairs.has(pair)) {
      failures.push("ledger.runRecords must contain every draft request/executionAttempt fingerprint pair");
    }
  }
  for (const pair of ledgerPairs) {
    if (!draftPairs.has(pair)) {
      failures.push("draft.runRecords must contain every ledger request/executionAttempt fingerprint pair");
    }
  }
}

function fingerprintPairSet(runs, label) {
  const pairs = new Set();
  for (const [index, run] of runs.entries()) {
    if (!isRecord(run)) continue;
    const pair = `${run.requestFingerprint}:${run.executionAttemptFingerprint}`;
    if (pairs.has(pair)) {
      failures.push(`${label}[${index}] duplicates request/executionAttempt fingerprint pair`);
    }
    pairs.add(pair);
  }
  return pairs;
}

function validateTarget(value, allowedKeys, label, draftTarget) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, allowedKeys, `${label} contains unsupported field`);
  validateFingerprint(`${label}.tenantFingerprint`, value.tenantFingerprint);
  if (!CHANNELS.has(value.channel)) failures.push(`${label}.channel must be taobao or douyin`);
  if (value.rolloutTrack !== "single_merchant_pilot") {
    failures.push(`${label}.rolloutTrack must be single_merchant_pilot`);
  }
  if (draftTarget) {
    if (value.changeTicketFingerprint !== null) {
      validateFingerprint(`${label}.changeTicketFingerprint`, value.changeTicketFingerprint);
    } else {
      failures.push(`${label}.changeTicketFingerprint must not be null for assembly`);
    }
  } else if (!hasValue(value.changeTicket)) {
    failures.push(`${label}.changeTicket must be a non-empty safe string`);
  }
}

function validateLaunchWindow(value, label) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, LAUNCH_WINDOW_KEYS, `${label} contains unsupported field`);
  for (const key of ["startsAt", "endsAt", "closedAt"]) {
    if (!isIsoTimestamp(value[key])) failures.push(`${label}.${key} must be an ISO timestamp`);
  }
  validateIntegerInRange(`${label}.durationMinutes`, value.durationMinutes, 15, 120);
  validateBoolean(`${label}.freezeWindowActive`, value.freezeWindowActive);
  if (value.freezeWindowActive !== true) {
    failures.push(`${label}.freezeWindowActive must be true`);
  }
}

function validateDraftSummary(summary, runs) {
  if (!isRecord(summary)) {
    failures.push("draft.summary must be an object");
    return;
  }
  validateAllowedKeys(summary, DRAFT_SUMMARY_KEYS, "draft.summary contains unsupported field");
  validateIntegerInRange("draft.summary.totalRuns", summary.totalRuns, 0, 50);
  validateIntegerInRange("draft.summary.dryRunRecordedRuns", summary.dryRunRecordedRuns, 0, 50);
  validateIntegerInRange("draft.summary.blockedRuns", summary.blockedRuns, 0, 50);
  validateIntegerInRange("draft.summary.failedRuns", summary.failedRuns, 0, 50);
  validateBoolean("draft.summary.allRunsReviewed", summary.allRunsReviewed);
  validateBoolean("draft.summary.failedRunsHaveIncidentNotes", summary.failedRunsHaveIncidentNotes);
  validateBoolean("draft.summary.noAutoCustomerReplies", summary.noAutoCustomerReplies);
  if (summary.rollbackActionsVerified !== false) {
    failures.push("draft.summary.rollbackActionsVerified must be false");
  }
  if (summary.readyForSafeLedger !== false) {
    failures.push("draft.summary.readyForSafeLedger must be false");
  }
  if (!Array.isArray(summary.missingSafeLedgerInputs)) {
    failures.push("draft.summary.missingSafeLedgerInputs must be an array");
  } else {
    for (const required of [
      "artifact_bindings",
      "live_provider_mutation_evidence",
      "manual_closeout_review",
    ]) {
      if (!summary.missingSafeLedgerInputs.includes(required)) {
        failures.push(`draft.summary.missingSafeLedgerInputs must include ${required}`);
      }
    }
    if (Array.isArray(runs) && runs.length === 0 && !summary.missingSafeLedgerInputs.includes("pilot_run_records")) {
      failures.push("empty drafts must include pilot_run_records as missing input");
    }
  }
  if (Array.isArray(runs)) {
    if (summary.totalRuns !== runs.length) failures.push("draft.summary.totalRuns must match runRecords length");
    if (summary.dryRunRecordedRuns !== runs.filter((run) => run.status === "dry_run_recorded").length) {
      failures.push("draft.summary.dryRunRecordedRuns must match runRecords");
    }
    if (summary.blockedRuns !== runs.filter((run) => run.status === "blocked").length) {
      failures.push("draft.summary.blockedRuns must match runRecords");
    }
    if (summary.failedRuns !== runs.filter((run) => run.status === "failed").length) {
      failures.push("draft.summary.failedRuns must match runRecords");
    }
  }
}

function validateDraftRunRecords(value) {
  if (!Array.isArray(value)) {
    failures.push("draft.runRecords must be an array");
    return;
  }
  if (value.length > 50) failures.push("draft.runRecords must contain at most 50 records");
  for (const [index, run] of value.entries()) {
    if (!isRecord(run)) {
      failures.push(`draft.runRecords[${index}] must be an object`);
      continue;
    }
    validateAllowedKeys(run, DRAFT_RUN_KEYS, `draft.runRecords[${index}] contains unsupported field`);
    validateCommonRun(run, `draft.runRecords[${index}]`);
    if (!DRAFT_STATUSES.has(run.status)) failures.push(`draft.runRecords[${index}].status must be a draft status`);
    if (run.networkExecution !== "not_started") failures.push(`draft.runRecords[${index}].networkExecution must be not_started`);
    for (const key of [
      "providerMutationExecuted",
      "customerVisibleMessageSent",
      "payloadEscrowOpened",
      "providerPayloadStored",
      "providerResponseStored",
    ]) {
      if (run[key] !== false) failures.push(`draft.runRecords[${index}].${key} must be false`);
    }
  }
}

function validateLedgerRunRecords(value) {
  if (!Array.isArray(value)) {
    failures.push("ledger.runRecords must be an array");
    return;
  }
  if (value.length > 50) failures.push("ledger.runRecords must contain at most 50 records");
  for (const [index, run] of value.entries()) {
    if (!isRecord(run)) {
      failures.push(`ledger.runRecords[${index}] must be an object`);
      continue;
    }
    validateAllowedKeys(run, LEDGER_RUN_KEYS, `ledger.runRecords[${index}] contains unsupported field`);
    validateCommonRun(run, `ledger.runRecords[${index}]`);
    validateSha256(`ledger.runRecords[${index}].auditLogSha256`, run.auditLogSha256);
    if (!LEDGER_STATUSES.has(run.status)) failures.push(`ledger.runRecords[${index}].status must be a ledger status`);
    if (!["provider_api_called", "blocked_before_network"].includes(run.networkExecution)) {
      failures.push(`ledger.runRecords[${index}].networkExecution must be provider_api_called or blocked_before_network`);
    }
    validateBoolean(`ledger.runRecords[${index}].providerMutationExecuted`, run.providerMutationExecuted);
    if (run.customerVisibleMessageSent !== false) failures.push(`ledger.runRecords[${index}].customerVisibleMessageSent must be false`);
    if (run.providerResponseStored !== false) failures.push(`ledger.runRecords[${index}].providerResponseStored must be false`);
    if (run.providerPayloadStored !== false) failures.push(`ledger.runRecords[${index}].providerPayloadStored must be false`);
    if (["succeeded", "rolled_back"].includes(run.status) && run.providerMutationExecuted !== true) {
      failures.push(`ledger.runRecords[${index}].providerMutationExecuted must be true for succeeded or rolled_back runs`);
    }
    if (run.status === "blocked" && run.networkExecution !== "blocked_before_network") {
      failures.push(`ledger.runRecords[${index}].blocked runs must be blocked before network`);
    }
  }
}

function validateCommonRun(run, label) {
  validateSha256(`${label}.runFingerprint`, run.runFingerprint);
  validateFingerprint(`${label}.requestFingerprint`, run.requestFingerprint);
  validateFingerprint(`${label}.executionAttemptFingerprint`, run.executionAttemptFingerprint);
  validateNullableFingerprint(`${label}.operatorFingerprint`, run.operatorFingerprint);
  validateNullableFingerprint(`${label}.reviewerFingerprint`, run.reviewerFingerprint);
  validateNullableFingerprint(`${label}.rollbackOwnerFingerprint`, run.rollbackOwnerFingerprint);
  if (!FIRST_PILOT_ACTIONS.has(run.action)) failures.push(`${label}.action must be a first-pilot provider write action`);
  if (run.riskLevel !== "low") failures.push(`${label}.riskLevel must be low`);
  if (!isIsoTimestamp(run.createdAt)) failures.push(`${label}.createdAt must be an ISO timestamp`);
  if (!isIsoTimestamp(run.completedAt)) failures.push(`${label}.completedAt must be an ISO timestamp`);
}

function validateLedgerSummary(summary, runs) {
  if (!isRecord(summary)) {
    failures.push("ledger.summary must be an object");
    return;
  }
  validateAllowedKeys(summary, LEDGER_SUMMARY_KEYS, "ledger.summary contains unsupported field");
  validateStatusSummary("ledger.summary", summary, runs);
  for (const key of [
    "allRunsReviewed",
    "failedRunsHaveIncidentNotes",
    "rollbackActionsVerified",
    "noAutoCustomerReplies",
  ]) {
    if (summary[key] !== true) failures.push(`ledger.summary.${key} must be true`);
  }
}

function validateReviewRunSummary(summary) {
  if (!isRecord(summary)) {
    failures.push("review.runSummary must be an object");
    return;
  }
  validateAllowedKeys(summary, REVIEW_SUMMARY_KEYS, "review.runSummary contains unsupported field");
  for (const key of [
    "totalRuns",
    "succeededRuns",
    "failedRuns",
    "rolledBackRuns",
    "blockedRuns",
    "failedProviderMutationRuns",
  ]) {
    validateIntegerInRange(`review.runSummary.${key}`, summary[key], 0, 50);
  }
  if (summary.totalRuns !== summary.succeededRuns + summary.failedRuns + summary.rolledBackRuns + summary.blockedRuns) {
    failures.push("review.runSummary.totalRuns must equal status counts");
  }
  for (const key of [
    "allRunsReviewed",
    "failedRunsHaveIncidentNotes",
    "rollbackActionsVerified",
    "noAutoCustomerReplies",
  ]) {
    if (summary[key] !== true) failures.push(`review.runSummary.${key} must be true`);
  }
}

function validateStatusSummary(label, summary, runs) {
  for (const key of ["totalRuns", "succeededRuns", "failedRuns", "rolledBackRuns", "blockedRuns"]) {
    validateIntegerInRange(`${label}.${key}`, summary[key], 0, 50);
  }
  if (!Array.isArray(runs)) return;
  if (summary.totalRuns !== runs.length) failures.push(`${label}.totalRuns must match runRecords length`);
  if (summary.succeededRuns !== runs.filter((run) => run.status === "succeeded").length) {
    failures.push(`${label}.succeededRuns must match run record statuses`);
  }
  if (summary.failedRuns !== runs.filter((run) => run.status === "failed").length) {
    failures.push(`${label}.failedRuns must match run record statuses`);
  }
  if (summary.rolledBackRuns !== runs.filter((run) => run.status === "rolled_back").length) {
    failures.push(`${label}.rolledBackRuns must match run record statuses`);
  }
  if (summary.blockedRuns !== runs.filter((run) => run.status === "blocked").length) {
    failures.push(`${label}.blockedRuns must match run record statuses`);
  }
}

function validateReviewers(value) {
  if (!isRecord(value)) {
    failures.push("review.reviewers must be an object");
    return;
  }
  validateAllowedKeys(value, REVIEWER_KEYS, "review.reviewers contains unsupported field");
  for (const key of [
    "releaseOwnerFingerprint",
    "operationsReviewerFingerprint",
    "rollbackOwnerFingerprint",
  ]) {
    validateFingerprint(`review.reviewers.${key}`, value[key]);
  }
  if (
    new Set([
      value.releaseOwnerFingerprint,
      value.operationsReviewerFingerprint,
      value.rollbackOwnerFingerprint,
    ]).size !== 3
  ) {
    failures.push("review.reviewers must be distinct");
  }
  if (!isIsoTimestamp(value.reviewedAt)) failures.push("review.reviewers.reviewedAt must be an ISO timestamp");
  if (value.secondReviewCompleted !== true) failures.push("review.reviewers.secondReviewCompleted must be true");
}

function validateCloseout(value) {
  if (!isRecord(value)) {
    failures.push("review.closeout must be an object");
    return;
  }
  validateAllowedKeys(value, CLOSEOUT_KEYS, "review.closeout contains unsupported field");
  if (value.decision !== "approved_for_safe_ledger") {
    failures.push("review.closeout.decision must be approved_for_safe_ledger");
  }
  for (const key of [
    "customerImpactReviewed",
    "providerMutationReviewCompleted",
    "incidentReviewCompleted",
    "rollbackReviewCompleted",
    "evidencePackageReviewed",
  ]) {
    if (value[key] !== true) failures.push(`review.closeout.${key} must be true`);
  }
  if (!Array.isArray(value.outstandingActions) || value.outstandingActions.length !== 0) {
    failures.push("review.closeout.outstandingActions must be empty");
  }
}

function validateAllTrueFalseEvidence(value, allowedKeys, label, expectations) {
  if (!isRecord(value)) {
    failures.push(`${label} must be an object`);
    return;
  }
  validateAllowedKeys(value, allowedKeys, `${label} contains unsupported field`);
  for (const [key, expected] of Object.entries(expectations)) {
    if (value[key] !== expected) failures.push(`${label}.${key} must be ${expected}`);
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
  for (const key of allowedKeys) {
    validateSha256(`${label}.${key}`, value[key]);
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

function readJsonArtifact(filePath, label, artifactDir) {
  const resolvedPath = resolveArtifactPath(filePath, label, artifactDir);
  if (!resolvedPath) return null;
  if (!existsSync(resolvedPath)) {
    failures.push(`provider write safe ledger assembly ${label} file does not exist`);
    return null;
  }
  if (lstatSync(resolvedPath).isSymbolicLink()) {
    failures.push(`provider write safe ledger assembly ${label} file must not be a symlink`);
    return null;
  }
  const stats = statSync(resolvedPath);
  if (!stats.isFile()) {
    failures.push(`provider write safe ledger assembly ${label} path must point to a file`);
    return null;
  }
  if (stats.size > MAX_ARTIFACT_BYTES) {
    failures.push(`provider write safe ledger assembly ${label} file is too large`);
    return null;
  }
  const bytes = readFileSync(resolvedPath);
  try {
    return {
      value: JSON.parse(stripBom(bytes.toString("utf8"))),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch {
    failures.push(`provider write safe ledger assembly ${label} file must be valid JSON`);
    return null;
  }
}

function resolveArtifactPath(filePath, label, artifactDir) {
  if (
    typeof filePath !== "string" ||
    filePath.trim() === "" ||
    /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(filePath) ||
    /[^/\s\\]+:[^/\s\\]+@/.test(filePath) ||
    /^\\\\/.test(filePath)
  ) {
    failures.push(`--${labelToArg(label)} must be a safe local path`);
    return null;
  }
  const candidate = isAbsolute(filePath)
    ? resolve(filePath)
    : resolve(repoRoot, filePath);
  if (!isPathInside(repoRoot, candidate)) {
    failures.push(`--${labelToArg(label)} must stay inside repository`);
    return null;
  }
  if (!isPathInside(artifactDir, candidate)) {
    failures.push(`--${labelToArg(label)} must be inside ${relative(repoRoot, artifactDir).replaceAll("\\", "/")}`);
    return null;
  }
  if (existsSync(artifactDir) && lstatSync(artifactDir).isSymbolicLink()) {
    failures.push(`${relative(repoRoot, artifactDir).replaceAll("\\", "/")} must not be a symlink`);
    return null;
  }
  if (existsSync(candidate)) {
    const realCandidate = realpathSync(candidate);
    const realArtifactDir = existsSync(artifactDir) ? realpathSync(artifactDir) : artifactDir;
    if (!isPathInside(realArtifactDir, realCandidate)) {
      failures.push(`--${labelToArg(label)} must resolve inside ${relative(repoRoot, artifactDir).replaceAll("\\", "/")}`);
      return null;
    }
  }
  return candidate;
}

function parseArgs(argv) {
  const args = {
    draft: undefined,
    review: undefined,
    ledger: undefined,
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
    if (arg.startsWith("--draft=")) {
      args.draft = arg.slice("--draft=".length);
      continue;
    }
    if (arg.startsWith("--review=")) {
      args.review = arg.slice("--review=".length);
      continue;
    }
    if (arg.startsWith("--ledger=")) {
      args.ledger = arg.slice("--ledger=".length);
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
    draft:
      args.draft ??
      env.SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_DRAFT_FILE,
    review:
      args.review ??
      env.SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REVIEW_FILE,
    ledger:
      args.ledger ??
      env.SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_LEDGER_FILE,
    requirePass:
      args.requirePass ||
      env.SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REQUIRE_PASS === "true",
  };
}

function verifyStaticSafety() {
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const forbiddenTokens = [
    "node:" + "http",
    "node:" + "https",
    "Prisma" + "Client",
    "provider" + "Adapter",
    "credential" + "Resolver",
    "loadProvider" + "Credential",
    ".send" + "Message(",
    ".change" + "Address(",
    ".issue" + "Coupon(",
    "fetch" + "(",
  ];
  for (const token of forbiddenTokens) {
    if (source.includes(token)) {
      failures.push("verifier source must not import or call provider, network, database, or credential code");
    }
  }
}

function validateNoSensitiveFields(value, label) {
  visit(value, (key, item) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_FIELD_NAMES.has(normalizedKey)) {
      failures.push(`forbidden sensitive ${label} field`);
    }
    if (typeof item === "string" && isForbiddenValue(item)) {
      failures.push(`forbidden sensitive ${label} value`);
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
  if (typeof value !== "boolean") failures.push(`${label} must be boolean`);
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

function validateNullableFingerprint(label, value) {
  if (value === null) return;
  validateFingerprint(label, value);
}

function validateSha256(label, value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value) || /^(.)\1{63}$/.test(value)) {
    failures.push(`${label} must be a non-placeholder sha256 hash`);
  }
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

function labelToArg(label) {
  if (label === "manual closeout review") return "review";
  if (label === "final ledger") return "ledger";
  return "draft";
}

function redactArg(value) {
  if (typeof value !== "string") return "<redacted>";
  const [name] = value.split("=", 1);
  return name.startsWith("--") ? `${name}=<redacted>` : "<redacted>";
}

function shortHashFor(kind, value) {
  return createHash("sha256")
    .update(stableJson({ kind, value }))
    .digest("hex")
    .slice(0, 12);
}

function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
}

main();
