import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.SMARTCS_PROVIDER_WRITE_EXECUTION_ATTEMPTS_REPO_ROOT
  ? resolve(process.env.SMARTCS_PROVIDER_WRITE_EXECUTION_ATTEMPTS_REPO_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  sharedContracts: "packages/shared/src/ops-contracts.ts",
  prismaSchema: "prisma/schema.prisma",
  migration:
    "prisma/migrations/20260608003000_pr60_provider_write_execution_attempts/migration.sql",
  idempotencyScopeMigration:
    "prisma/migrations/20260608004500_pr60_provider_write_execution_attempt_idempotency_scope/migration.sql",
  apiConfig: "apps/api/src/config/api-config.ts",
  opsController: "apps/api/src/ops/ops.controller.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  opsControllerSpec: "apps/api/src/ops/ops.controller.spec.ts",
  webBffRoute:
    "apps/web/src/app/api/operator/provider-writes/requests/[id]/execution-attempts/route.ts",
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
const executionSlice = [
  sliceBetween(
    content.opsService,
    "async executeProviderWriteAttempt",
    "private async findProviderReadRun",
  ),
  sliceBetween(
    content.opsService,
    "private async persistProviderWriteExecutionAttempt",
    "private async providerReadCaseBelongsToTenant",
  ),
  sliceBetween(
    content.opsService,
    "private async auditProviderWriteExecutionAttempt",
    "handleCompensationDeclined",
  ),
  sliceBetween(
    content.opsService,
    "function providerWriteExecutionAttemptMetadata",
    "function providerReadResponseFromRun",
  ),
].join("\n");
const executionAttemptPersistenceSlice = [
  sliceBetween(
    content.prismaSchema,
    "model ProviderWriteExecutionAttempt",
    "model CaseMessage",
  ),
  content.migration,
  content.idempotencyScopeMigration,
].join("\n");

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-write-execution-attempts",
  "scripts/verify-provider-write-execution-attempts.mjs",
]);

mustContainAll("shared execution attempt contracts", content.sharedContracts, [
  "ProviderWriteExecutionAttemptStatusSchema",
  "\"dry_run_recorded\"",
  "\"blocked\"",
  "\"failed\"",
  "ProviderWriteExecutionAttemptRequestSchema",
  "ProviderWriteExecutionAttemptResponseSchema",
  "networkExecution: z.literal(\"not_started\")",
  "providerMutationExecuted: z.literal(false)",
  "customerVisibleMessageSent: z.literal(false)",
  "payloadEscrowOpened: z.literal(false)",
]);
mustNotContainAny("shared execution attempt unsafe free text", content.sharedContracts, [
  "executionNote: z.string",
  "providerPayload",
  "providerResponse",
]);

mustContainAll("provider write execution attempt prisma schema", content.prismaSchema, [
  "model ProviderWriteExecutionAttempt",
  "providerWriteRequestId",
  "idempotencyKeyHash",
  "requestHash",
  "attemptFingerprint",
  "payloadEscrowStatus",
  "payloadEscrowOpened",
  "networkExecution",
  "providerMutationExecuted",
  "customerVisibleMessageSent",
  "@@unique([tenantId, providerWriteRequestId, idempotencyKeyHash])",
  "@@index([tenantId, providerWriteRequestId, createdAt])",
]);
mustNotContainAny("provider write execution attempt prisma raw fields", content.prismaSchema, [
  "newAddress",
  "providerPayload",
  "providerResponse",
  "rawProvider",
  "rawOrderId",
  "rawAddress",
  "accessToken",
]);
mustNotContainAnyInsensitive(
  "provider write execution attempt persistence sensitive fields",
  executionAttemptPersistenceSlice,
  [
    "address",
    "apiKey",
    "credentialMaterial",
    "credentialRef",
    "customerMessage",
    "logisticsId",
    "operatorApiKey",
    "orderId",
    "providerPayload",
    "providerResponse",
    "rawAddress",
    "rawLogisticsId",
    "rawOrderId",
    "rawPayload",
    "rawProvider",
    "refreshToken",
    "secret",
    "token",
    "accessToken",
  ],
);

mustContainAll("provider write execution migration", content.migration, [
  'CREATE TABLE "ProviderWriteExecutionAttempt"',
  '"providerWriteRequestId" TEXT NOT NULL',
  '"idempotencyKeyHash" TEXT NOT NULL',
  '"attemptFingerprint" TEXT NOT NULL',
  '"payloadEscrowOpened" BOOLEAN NOT NULL DEFAULT false',
  '"providerMutationExecuted" BOOLEAN NOT NULL DEFAULT false',
  '"customerVisibleMessageSent" BOOLEAN NOT NULL DEFAULT false',
]);
mustContainAll("provider write execution idempotency scope migration", content.idempotencyScopeMigration, [
  'DROP INDEX IF EXISTS "ProviderWriteExecutionAttempt_tenantId_idempotencyKeyHash_key"',
  'CREATE UNIQUE INDEX "ProviderWriteExecutionAttempt_tenantId_providerWriteRequestId_idempotencyKeyHash_key"',
  '"tenantId", "providerWriteRequestId", "idempotencyKeyHash"',
]);

mustContainAll("provider write execution config", content.apiConfig, [
  "PROVIDER_WRITE_EXECUTION_KILL_SWITCH",
  "providerWriteExecutionKillSwitch",
  "providerWriteExecutionKillSwitchEnabled",
  ".default(\"true\")",
]);

mustContainAll("ops controller execution attempt route", content.opsController, [
  'Post("provider-writes/requests/:id/execution-attempts")',
  "ProviderWriteExecutionAttemptRequestSchema.parse",
  "requireProviderWriteAdminAccess",
  "operatorId: context.operatorId",
  "tenantId: context.tenantId",
  "Operator API key is required",
]);

mustContainAll("ops service execution attempt safety", content.opsService, [
  "executeProviderWriteAttempt",
  "findProviderWriteExecutionAttempt",
  "persistProviderWriteExecutionAttempt",
  "providerWriteExecutionKillSwitchEnabled",
  "provider_write_execution.",
  "execution_kill_switch_enabled",
  "dry_run_recorded",
  "payloadEscrowOpened: false",
  "networkExecution: \"not_started\"",
  "providerMutationExecuted: false",
  "customerVisibleMessageSent: false",
]);
mustContainAll("ops service execution fingerprint binding", content.opsService, [
  "providerWriteRequestHash: request.requestHash",
  "requestStatus: request.status",
  "reviewFingerprint: request.reviewFingerprint ?? null",
  "payloadEscrowFingerprint: request.payloadEscrowFingerprint ?? null",
  "tenantId_providerWriteRequestId_idempotencyKeyHash",
]);
mustNotContainAny("ops service execution no provider writes", executionSlice, [
  ".changeAddress(",
  ".issueCoupon(",
  ".sendMessage(",
  "providerMutationExecuted: true",
  "customerVisibleMessageSent: true",
  "payloadEscrowOpened: true",
  "credentialResolver",
  "loadProviderCredentialRefs",
  "decrypt",
  "secret://",
  "vault://",
]);

mustContainAll("ops service execution tests", content.opsServiceSpec, [
  "blocks approved provider write execution attempts by default kill switch without provider execution",
  "records provider write dry-run execution attempts when the kill switch is explicitly disabled",
  "blocks execution attempts for provider write requests that are not approved",
  "scopes provider write execution attempt idempotency to each write request",
  "fails closed when provider write execution attempt idempotency is reused after request fingerprint drift",
  "writeCallCount, 0",
  "ProviderWriteExecutionAttemptRequestSchema",
]);

mustContainAll("ops controller execution tests", content.opsControllerSpec, [
  "uses request operator context for provider write execution attempts",
  "rejects non-admin provider write execution attempts",
]);

mustContainAll("web bff execution route", content.webBffRoute, [
  "ProviderWriteExecutionAttemptRequestSchema.safeParse",
  "ProviderWriteExecutionAttemptResponseSchema.parse",
  "/v2/provider-writes/requests/",
  "/execution-attempts",
  "Provider write operations require admin permission",
  "payloadEscrowOpened",
  "rejectUnsafeProviderWriteExecutionAttemptFields",
  "Unsafe provider write execution attempt field",
  "readLiteralBoolean",
]);
mustContainAll("web bff execution tests", content.webBffSpec, [
  "proxies provider write execution attempts through an admin session without leaking keys or raw payload",
  "rejects unsafe provider write execution attempt responses and blocks non-admin execution attempts",
  "providerPayload: { secret: true }",
  "operator_api_key_must_not_leak",
]);

mustContainAll("provider write docs", content.providerWriteDocs, [
  "PR60 Provider Write Execution Attempt Safety",
  "POST /v2/provider-writes/requests/:id/execution-attempts",
  "POST /api/operator/provider-writes/requests/:id/execution-attempts",
  "PROVIDER_WRITE_EXECUTION_KILL_SWITCH",
  "dry_run_recorded",
  "does not execute provider writes",
  "npm run verify:provider-write-execution-attempts",
]);

mustContainAll("provider adapter docs", content.providerDocs, [
  "PR60 Provider Write Execution Attempt Safety",
  "verify:provider-write-execution-attempts",
]);

mustContainAll("production readiness docs", content.productionReadiness, [
  "PR60 Provider Write Execution Attempt Safety",
  "npm run verify:provider-write-execution-attempts",
]);

mustContainAll("public API surface docs", content.publicApiSurface, [
  "POST /v2/provider-writes/requests/:id/execution-attempts",
  "POST /api/operator/provider-writes/requests/:id/execution-attempts",
  "ProviderWriteExecutionAttempt",
  "payloadEscrowOpened=false",
]);

mustContainAll("launch runbook docs", content.launchRunbook, [
  "npm run verify:provider-write-execution-attempts",
  "Provider write execution attempt",
]);

mustContainAll("static CI wiring", content.staticCiWorkflow, [
  "node --test scripts/verify-provider-write-execution-attempts.test.mjs",
  "npm run verify:provider-write-execution-attempts",
]);

mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
  "node --test scripts/verify-provider-write-execution-attempts.test.mjs",
  "npm run verify:provider-write-execution-attempts",
]);

mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
  "verify-provider-write-execution-attempts.mjs",
  "verify:provider-write-execution-attempts",
  "provider write execution attempts",
]);

mustContainAll("task plan references", content.taskPlan, [
  "PR60 - Provider Write Execution Attempt Safety",
  "verify:provider-write-execution-attempts",
]);

mustContainAll("progress references", content.progress, [
  "Started PR60 provider write execution attempt safety",
]);

if (failures.length > 0) {
  console.error("Provider write execution attempt verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider write execution attempt verification passed.");

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
