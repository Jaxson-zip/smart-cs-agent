import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.SMARTCS_PROVIDER_WRITE_EXECUTION_ATTEMPT_VISIBILITY_REPO_ROOT
  ? resolve(process.env.SMARTCS_PROVIDER_WRITE_EXECUTION_ATTEMPT_VISIBILITY_REPO_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  sharedContracts: "packages/shared/src/ops-contracts.ts",
  constraintsMigration:
    "prisma/migrations/20260608011000_pr61_provider_write_execution_attempt_constraints/migration.sql",
  opsController: "apps/api/src/ops/ops.controller.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  opsControllerSpec: "apps/api/src/ops/ops.controller.spec.ts",
  webBffRoute:
    "apps/web/src/app/api/operator/provider-writes/execution-attempts/route.ts",
  webBffSpec: "apps/web/src/app/api/operator/operator-bff.spec.ts",
  providerWriteDocs: "docs/deploy/provider-write-requests.md",
  providerDocs: "docs/deploy/provider-adapter-contracts.md",
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
const serviceListSlice = sliceBetween(
  content.opsService,
  "async listProviderWriteExecutionAttempts",
  "async getProviderWriteLivePilotRunLedgerDraft",
);
const serviceMapperSlice = sliceBetween(
  content.opsService,
  "function toSanitizedProviderWriteExecutionAttempt",
  "function emptyProviderWriteLivePilotRunLedgerDraft",
);
const sharedListSchemaSlice = sliceBetween(
  content.sharedContracts,
  "export const ProviderWriteExecutionAttemptListItemSchema",
  "export const ProviderWriteLivePilotRunLedgerDraftMissingInputSchema",
);

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-write-execution-attempt-visibility",
  "scripts/verify-provider-write-execution-attempt-visibility.mjs",
]);

mustContainAll("provider write execution constraints migration", content.constraintsMigration, [
  'ALTER TABLE "ProviderWriteExecutionAttempt"',
  'CONSTRAINT "ProviderWriteExecutionAttempt_status_chk"',
  '"status" IN (\'dry_run_recorded\', \'blocked\', \'failed\')',
  'CONSTRAINT "ProviderWriteExecutionAttempt_no_network_chk"',
  '"networkExecution" = \'not_started\'',
  '"providerMutationExecuted" = false',
  '"customerVisibleMessageSent" = false',
  '"payloadEscrowOpened" = false',
  'CONSTRAINT "ProviderWriteExecutionAttempt_payload_escrow_chk"',
  '"payloadEscrowStatus" = \'not_stored\'',
]);
mustNotContainAnyInsensitive("constraints migration unsafe operations", content.constraintsMigration, [
  "CASCADE",
  "DROP TABLE",
  "providerPayload",
  "providerResponse",
  "operatorApiKey",
  "accessToken",
  "refreshToken",
  "customerMessage",
]);

mustContainAll("shared execution attempt list contract", content.sharedContracts, [
  "ProviderWriteExecutionAttemptListItemSchema",
  "providerWriteRequestId: z.string()",
  "status: ProviderWriteExecutionAttemptStatusSchema",
  "networkExecution: z.literal(\"not_started\")",
  "providerMutationExecuted: z.literal(false)",
  "customerVisibleMessageSent: z.literal(false)",
  "payloadEscrowStatus: z.literal(\"not_stored\")",
  "payloadEscrowOpened: z.literal(false)",
  "requestFingerprint: z.string()",
  "attemptFingerprint: z.string()",
  "ProviderWriteExecutionAttemptListItem",
  ".strict()",
]);
mustNotContainAny("shared execution attempt list unsafe exposure", sharedListSchemaSlice, [
  "operatorVisibleResult",
  "idempotencyKeyHash",
  "requestHash",
  "providerPayload",
  "providerResponse",
  "operatorApiKey",
  "accessToken",
  "refreshToken",
  "customerMessage",
]);

mustContainAll("ops service execution attempt list", content.opsService, [
  "listProviderWriteExecutionAttempts",
  "toSanitizedProviderWriteExecutionAttempt",
  "ProviderWriteExecutionAttemptListItemSchema.parse",
  "providerWriteRequestId: input.providerWriteRequestId",
  "requestFingerprint: fingerprint(attempt.requestHash)",
  "attemptFingerprint: fingerprint(attempt.attemptFingerprint)",
]);
mustNotContainAny("ops service list unsafe exposure", serviceListSlice + serviceMapperSlice, [
  "operatorVisibleResult:",
  "idempotencyKeyHash:",
  "requestHash:",
  "providerPayload",
  "providerResponse",
  "operatorApiKey",
  "accessToken",
  "refreshToken",
  "customerMessage",
  ".changeAddress(",
  ".issueCoupon(",
  ".sendMessage(",
  "credentialResolver",
  "decrypt",
  "secret://",
  "vault://",
]);

mustContainAll("ops controller execution attempt list route", content.opsController, [
  'Get("provider-writes/execution-attempts")',
  "providerWriteExecutionAttemptsQuerySchema",
  "ProviderWriteExecutionAttemptStatusSchema.optional()",
  "requireProviderWriteAdminAccess",
  "listProviderWriteExecutionAttempts",
]);

mustContainAll("ops service execution visibility tests", content.opsServiceSpec, [
  "ProviderWriteExecutionAttemptListItemSchema",
  "lists sanitized provider write execution attempts for one tenant with filters",
  "idempotencyKeyHash",
  "requestHash",
]);
mustContainAll("ops controller execution visibility tests", content.opsControllerSpec, [
  "lets admin operators list sanitized provider write execution attempts",
  "rejects non-admin provider write execution attempt visibility",
]);

mustContainAll("web bff execution attempt list route", content.webBffRoute, [
  "ProviderWriteExecutionAttemptListItemSchema",
  "/v2/provider-writes/execution-attempts",
  "Provider write operations require admin permission",
  "rejectUnsafeProviderWriteExecutionAttemptFields",
  "providerpayload",
  "operatorapikey",
  "operatorvisibleresult",
]);
mustContainAll("web bff execution visibility tests", content.webBffSpec, [
  "lets admin sessions list sanitized provider write execution attempts through the BFF",
  "rejects unsafe provider write execution attempt lists and blocks non-admin sessions",
  "operator_api_key_must_not_leak",
]);

mustContainAll("provider write docs", content.providerWriteDocs, [
  "PR61 Provider Write Execution Attempt Invariants And Visibility",
  "GET /v2/provider-writes/execution-attempts",
  "GET /api/operator/provider-writes/execution-attempts",
  "verify:provider-write-execution-attempt-visibility",
]);
mustContainAll("provider adapter docs", content.providerDocs, [
  "PR61 Provider Write Execution Attempt Invariants And Visibility",
  "verify:provider-write-execution-attempt-visibility",
]);
mustContainAll("production readiness docs", content.productionReadiness, [
  "PR61 Provider Write Execution Attempt Invariants And Visibility",
  "verify:provider-write-execution-attempt-visibility",
]);
mustContainAll("public API surface docs", content.publicApiSurface, [
  "GET /v2/provider-writes/execution-attempts",
  "GET /api/operator/provider-writes/execution-attempts",
  "ProviderWriteExecutionAttemptListItem",
]);
mustContainAll("launch runbook docs", content.launchRunbook, [
  "verify:provider-write-execution-attempt-visibility",
  "Provider write execution attempt visibility",
]);

mustContainAll("static CI wiring", content.staticCiWorkflow, [
  "node --test scripts/verify-provider-write-execution-attempt-visibility.test.mjs",
  "npm run verify:provider-write-execution-attempt-visibility",
]);
mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
  "node --test scripts/verify-provider-write-execution-attempt-visibility.test.mjs",
  "npm run verify:provider-write-execution-attempt-visibility",
]);
mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
  "verify-provider-write-execution-attempt-visibility.mjs",
  "verify:provider-write-execution-attempt-visibility",
  "provider write execution attempt visibility",
]);
mustContainAll("task plan references", content.taskPlan, [
  "PR61 - Provider Write Execution Attempt Invariants And Visibility",
  "verify:provider-write-execution-attempt-visibility",
]);
mustContainAll("progress references", content.progress, [
  "Started PR61 provider write execution attempt invariants and visibility",
]);

if (failures.length > 0) {
  console.error("Provider write execution attempt visibility verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider write execution attempt visibility verification passed.");

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

function mustNotContainAnyInsensitive(label, haystack, needles) {
  const lowerHaystack = haystack.toLowerCase();
  for (const needle of needles) {
    if (lowerHaystack.includes(needle.toLowerCase())) {
      failures.push(`${label}: unexpectedly contains ${needle}`);
    }
  }
}

function sliceBetween(haystack, startNeedle, endNeedle) {
  const start = haystack.indexOf(startNeedle);
  if (start === -1) {
    failures.push(`slice: missing ${startNeedle}`);
    return "";
  }
  const end = haystack.indexOf(endNeedle, start + startNeedle.length);
  if (end === -1) {
    failures.push(`slice: missing ${endNeedle}`);
    return haystack.slice(start);
  }
  return haystack.slice(start, end);
}
