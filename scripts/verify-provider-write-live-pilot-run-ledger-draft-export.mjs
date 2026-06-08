import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_DRAFT_EXPORT_REPO_ROOT
  ? resolve(process.env.SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_DRAFT_EXPORT_REPO_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  sharedContracts: "packages/shared/src/ops-contracts.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  opsController: "apps/api/src/ops/ops.controller.ts",
  opsControllerSpec: "apps/api/src/ops/ops.controller.spec.ts",
  bffRoute:
    "apps/web/src/app/api/operator/provider-writes/live-pilot-run-ledger/draft/route.ts",
  bffSpec: "apps/web/src/app/api/operator/operator-bff.spec.ts",
  ledgerDocs: "docs/deploy/provider-write-live-pilot-run-ledger.md",
  providerWriteDocs: "docs/deploy/provider-write-requests.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  publicApiSurface: "docs/deploy/public-api-surface.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  staticCiWorkflow: ".github/workflows/production-static-gates.yml",
  staticCiVerifier: "scripts/verify-production-static-ci.mjs",
  productionLaunchVerifier: "scripts/verify-production-launch.mjs",
  taskPlan: "task_plan.md",
  progress: "progress.md",
};

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

const sharedDraftSlice = sliceBetween(
  content.sharedContracts,
  "export const ProviderWriteLivePilotRunLedgerDraftMissingInputSchema",
  "export const ProviderWriteLiveExecutorMissingGateSchema",
);
const serviceDraftSlice = sliceBetween(
  content.opsService,
  "async getProviderWriteLivePilotRunLedgerDraft",
  "ingestMessage()",
);
const serviceDraftHelpersSlice = sliceBetween(
  content.opsService,
  "function emptyProviderWriteLivePilotRunLedgerDraft",
  "function sanitizeLookupKeys",
);
const bffDraftSlice = content.bffRoute;

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-write-live-pilot-run-ledger-draft-export",
  "scripts/verify-provider-write-live-pilot-run-ledger-draft-export.mjs",
]);

mustContainAll("shared draft contract", sharedDraftSlice, [
  "ProviderWriteLivePilotRunLedgerDraftSchema",
  "ProviderWriteLivePilotRunLedgerDraftPolicyReasonSchema",
  "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1",
  "draftOnly: z.literal(true)",
  "tenantFingerprint: z.string().regex(/^[a-f0-9]{12}$/)",
  "requestFingerprint: z.string().regex(/^[a-f0-9]{12}$/)",
  "executionAttemptFingerprint: z.string().regex(/^[a-f0-9]{12}$/)",
  "requiresArtifactBindings: z.literal(true)",
  "canPassPr69SafeLedger: z.literal(false)",
  "readyForSafeLedger: z.literal(false)",
  "rollbackActionsVerified: z.literal(false)",
  "networkExecution: z.literal(\"not_started\")",
  "providerMutationExecuted: z.literal(false)",
  "customerVisibleMessageSent: z.literal(false)",
  "payloadEscrowOpened: z.literal(false)",
  "providerPayloadStored: z.literal(false)",
  "providerResponseStored: z.literal(false)",
  "other_sanitized_policy_reason",
  "networkExecutedByExporter: z.literal(false)",
  "providerWriteExecutedByExporter: z.literal(false)",
  "payloadEscrowOpenedByExporter: z.literal(false)",
  "credentialsReadByExporter: z.literal(false)",
  "customerVisibleActionsSentByExporter: z.literal(false)",
  "artifact_bindings",
  "live_provider_mutation_evidence",
  "manual_closeout_review",
  "pilot_run_records",
]);
mustNotContainAny("shared draft contract unsafe pass shape", sharedDraftSlice, [
  "canPassPr69SafeLedger: z.literal(true)",
  "readyForSafeLedger: z.literal(true)",
  "providerMutationExecuted: z.literal(true)",
  "customerVisibleMessageSent: z.literal(true)",
  "payloadEscrowOpened: z.literal(true)",
]);

mustContainAll("api service draft export", serviceDraftSlice + serviceDraftHelpersSlice, [
  "getProviderWriteLivePilotRunLedgerDraft",
  "ProviderWriteLivePilotRunLedgerDraftSchema.parse",
  "providerWriteExecutionAttempt.findMany",
  "providerWriteRequest.findFirst",
  "tenantId: input.tenantId",
  "channel: input.channel",
  "createdAt: { gte: input.from, lte: input.to }",
  "draftOnly: true",
  "canPassPr69SafeLedger: false",
  "readyForSafeLedger: false",
  "providerWriteLedgerDraftMissingInputs",
  "sanitizeProviderWriteLedgerDraftPolicyReason",
  "artifact_bindings",
  "live_provider_mutation_evidence",
  "manual_closeout_review",
  "networkExecutedByExporter: false",
  "providerWriteExecutedByExporter: false",
  "payloadEscrowOpenedByExporter: false",
  "credentialsReadByExporter: false",
  "customerVisibleActionsSentByExporter: false",
  "shortHashFor(\"provider_write_ledger_tenant\"",
  "shortHashFor(\"provider_write_ledger_operator\"",
  "other_sanitized_policy_reason",
]);
mustNotContainAny("api service draft export no live side effects", serviceDraftSlice + serviceDraftHelpersSlice, [
  ".changeAddress(",
  ".issueCoupon(",
  ".sendMessage(",
  "executeProviderWriteAttempt(",
  "approveProviderWriteRequest(",
  "credentialResolver",
  "providerReadHarness",
  "loadProviderCredential",
  "secret://",
  "vault://",
  "providerMutationExecuted: true",
  "customerVisibleMessageSent: true",
  "payloadEscrowOpened: true",
  "payloadEscrowOpenedByExporter: true",
  "credentialsReadByExporter: true",
]);

mustContainAll("api service draft tests", content.opsServiceSpec, [
  "exports a sanitized provider write live pilot run ledger draft",
  "keeps provider write live pilot run ledger drafts inside the requested channel and window",
  "ProviderWriteLivePilotRunLedgerDraftSchema",
  "adapter.writeCallCount, 0",
]);

mustContainAll("api controller draft route", content.opsController, [
  'Get("provider-writes/live-pilot-run-ledger/draft")',
  "providerWriteLivePilotRunLedgerDraftQuerySchema",
  "PROVIDER_WRITE_LIVE_PILOT_LEDGER_WINDOW_MINUTES",
  "durationMinutes < PROVIDER_WRITE_LIVE_PILOT_LEDGER_WINDOW_MINUTES.min",
  "durationMinutes > PROVIDER_WRITE_LIVE_PILOT_LEDGER_WINDOW_MINUTES.max",
  "requireProviderWriteAdminAccess(context)",
  "getProviderWriteLivePilotRunLedgerDraft",
]);
mustContainAll("api controller draft tests", content.opsControllerSpec, [
  "lets admin operators export provider write live pilot run ledger drafts",
  "rejects invalid provider write live pilot run ledger draft windows",
  "rejects non-admin provider write live pilot run ledger draft export",
]);

mustContainAll("web bff draft route", bffDraftSlice, [
  "ProviderWriteLivePilotRunLedgerDraftSchema",
  "readOperatorSession",
  "Provider write operations require admin permission",
  "/v2/provider-writes/live-pilot-run-ledger/draft",
  "Provider write live pilot run ledger draft response is invalid",
  "rejectUnsafeProviderWriteLivePilotRunLedgerDraftFields",
  "operatorapikey",
  "providerpayload",
  "providerresponse",
  "rawtenantid",
  "rawidempotencykey",
  "credentialref",
  "secret",
  "token",
]);
mustNotContainAny("web bff draft route no unsafe passthrough", bffDraftSlice, [
  "NextResponse.json(body)",
  "providerMutationExecuted: true",
  "customerVisibleMessageSent: true",
  "payloadEscrowOpened: true",
]);
mustContainAll("web bff draft tests", content.bffSpec, [
  "lets admin sessions export sanitized provider write live pilot run ledger drafts through the BFF",
  "blocks non-admin sessions from exporting provider write live pilot run ledger drafts in the BFF",
  "rejects unsafe or pass-shaped provider write live pilot run ledger drafts",
  "canPassPr69SafeLedger, false",
  "readyForSafeLedger, false",
  "secret://provider-write-credential-ref",
  "admin_api_key_must_not_leak",
]);

mustContainAll("ledger docs draft export", content.ledgerDocs, [
  "PR70 Provider Write Live Pilot Run Ledger Draft Export",
  "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1",
  "npm run verify:provider-write-live-pilot-run-ledger-draft-export",
  "GET /v2/provider-writes/live-pilot-run-ledger/draft",
  "GET /api/operator/provider-writes/live-pilot-run-ledger/draft",
  "draftOnly=true",
  "readyForSafeLedger=false",
  "canPassPr69SafeLedger=false",
  "artifact_bindings",
  "live_provider_mutation_evidence",
  "manual_closeout_review",
  "does not call provider APIs",
  "does not execute provider writes",
  "does not read provider credentials",
  "does not open payload escrow",
  "does not send customer-visible replies",
]);
mustContainAll("provider write docs draft export", content.providerWriteDocs, [
  "PR70 Provider Write Live Pilot Run Ledger Draft Export",
  "ProviderWriteLivePilotRunLedgerDraftSchema",
  "verify:provider-write-live-pilot-run-ledger-draft-export",
]);
mustContainAll("production readiness draft export", content.productionReadiness, [
  "PR70 Provider Write Live Pilot Run Ledger Draft Export",
  "verify:provider-write-live-pilot-run-ledger-draft-export",
  "readyForSafeLedger=false",
]);
mustContainAll("public API surface draft export", content.publicApiSurface, [
  "GET /v2/provider-writes/live-pilot-run-ledger/draft",
  "GET /api/operator/provider-writes/live-pilot-run-ledger/draft",
  "ProviderWriteLivePilotRunLedgerDraftSchema",
  "canPassPr69SafeLedger=false",
]);
mustContainAll("launch runbook draft export", content.launchRunbook, [
  "Provider write live pilot run ledger draft export",
  "npm run verify:provider-write-live-pilot-run-ledger-draft-export",
  "GET /api/operator/provider-writes/live-pilot-run-ledger/draft",
  "draftOnly=true",
  "canPassPr69SafeLedger=false",
]);

mustContainAll("static CI wiring", content.staticCiWorkflow, [
  "node --test scripts/verify-provider-write-live-pilot-run-ledger-draft-export.test.mjs",
  "npm run verify:provider-write-live-pilot-run-ledger-draft-export",
]);
mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
  "node --test scripts/verify-provider-write-live-pilot-run-ledger-draft-export.test.mjs",
  "npm run verify:provider-write-live-pilot-run-ledger-draft-export",
]);
mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
  "verify:provider-write-live-pilot-run-ledger-draft-export",
  "provider write live pilot run ledger draft export",
  "GET /v2/provider-writes/live-pilot-run-ledger/draft",
]);
mustContainAll("task plan draft export", content.taskPlan, [
  "PR70 - Provider Write Live Pilot Run Ledger Draft Export",
  "verify:provider-write-live-pilot-run-ledger-draft-export",
]);
mustContainAll("progress draft export", content.progress, [
  "Started PR70 provider write live pilot run ledger draft export",
]);

if (failures.length > 0) {
  console.error("Provider write live pilot run ledger draft export verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider write live pilot run ledger draft export verification passed.");

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

function sliceBetween(haystack, startNeedle, endNeedle) {
  const startIndex = haystack.indexOf(startNeedle);
  if (startIndex === -1) {
    failures.push(`slice start missing: ${startNeedle}`);
    return "";
  }
  const endIndex = haystack.indexOf(endNeedle, startIndex + startNeedle.length);
  if (endIndex === -1) {
    failures.push(`slice end missing: ${endNeedle}`);
    return haystack.slice(startIndex);
  }
  return haystack.slice(startIndex, endIndex);
}
