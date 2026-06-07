import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  sharedContracts: "packages/shared/src/ops-contracts.ts",
  prismaSchema: "prisma/schema.prisma",
  migration:
    "prisma/migrations/20260607221500_pr58_provider_write_requests/migration.sql",
  providerWriteDocs: "docs/deploy/provider-write-requests.md",
  providerDocs: "docs/deploy/provider-adapter-contracts.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  publicApiSurface: "docs/deploy/public-api-surface.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  apiConfig: "apps/api/src/config/api-config.ts",
  registry: "apps/api/src/adapters/provider-adapter-registry.service.ts",
  opsController: "apps/api/src/ops/ops.controller.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  opsControllerSpec: "apps/api/src/ops/ops.controller.spec.ts",
  webBffRoute:
    "apps/web/src/app/api/operator/provider-writes/requests/route.ts",
  webBffSpec: "apps/web/src/app/api/operator/operator-bff.spec.ts",
  taskPlan: "task_plan.md",
};

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-write-requests",
  "scripts/verify-provider-write-requests.mjs",
]);

mustContainAll("shared provider write contracts", content.sharedContracts, [
  "ProviderWriteActionSchema",
  "ProviderWritePayloadSchema",
  "ProviderWriteRequestSchema",
  "ProviderWriteResponseSchema",
  "modify_address",
  "issue_coupon",
  "urge_logistics",
  "providerMutationExecuted: z.literal(false)",
  "customerVisibleMessageSent: z.literal(false)",
  "networkExecution: z.literal(\"not_started\")",
]);
mustNotContainAny("shared provider write unsafe actions", content.sharedContracts, [
  "ProviderWriteActionSchema = z.enum([\"refund\"",
  "ProviderWriteActionSchema = z.enum([\"update_invoice\"",
]);

mustContainAll("provider write prisma schema", content.prismaSchema, [
  "model ProviderWriteRequest",
  "tenantId",
  "operatorId",
  "caseId",
  "channel",
  "action",
  "idempotencyKeyHash",
  "payloadHash",
  "payloadKeys",
  "requestHash",
  "providerMutationExecuted   Boolean  @default(false)",
  "customerVisibleMessageSent Boolean  @default(false)",
  "@@unique([tenantId, idempotencyKeyHash])",
  "@@index([tenantId, status, createdAt])",
]);
mustNotContainAny("provider write prisma raw fields", content.prismaSchema, [
  "newAddress",
  "providerPayload",
  "providerResponse",
  "rawProvider",
]);

mustContainAll("provider write migration", content.migration, [
  'CREATE TABLE "ProviderWriteRequest"',
  '"payloadHash" TEXT NOT NULL',
  '"payloadKeys" JSONB NOT NULL',
  '"requestHash" TEXT NOT NULL',
  '"providerMutationExecuted" BOOLEAN NOT NULL DEFAULT false',
  '"customerVisibleMessageSent" BOOLEAN NOT NULL DEFAULT false',
  'CREATE UNIQUE INDEX "ProviderWriteRequest_tenantId_idempotencyKeyHash_key"',
]);

mustContainAll("api config write review allowlist", content.apiConfig, [
  "PROVIDER_WRITE_REVIEW_ADAPTERS",
  "ProviderWriteActionSchema",
  "loadProviderWriteReviewAdapterConfigs",
  "allowedActions must not contain duplicates",
  "without credentials",
]);
mustNotContainAny("api config write review secrets", content.apiConfig, [
  "providerWriteReviewAdapterConfigSchema = z.object({ credentialRef",
  "accessToken",
  "clientSecret",
]);

mustContainAll("registry write request policy", content.registry, [
  "evaluateWriteRequestPolicy",
  "real_actions_disabled",
  "human_review_required",
  "Provider write review is not configured",
  "realCommerceActionsEnabled: false",
  "customerVisibleActionsEnabled: false",
  "Provider write requests may be queued for human review only.",
]);

mustContainAll("ops controller provider write routes", content.opsController, [
  'Get("provider-writes/requests")',
  'Post("provider-writes/request")',
  "ProviderWriteRequestSchema.parse",
  "requireProviderWriteAdminAccess",
  "requireProviderWriteOperatorAccess",
  "Provider write requests require operator permission",
  "context.authMethod",
  "Operator API key is required",
]);

mustContainAll("ops service provider write queue", content.opsService, [
  "listProviderWriteRequests",
  "requestProviderWrite",
  "providerWriteMetadata",
  "findProviderWriteRequest",
  "providerWriteCaseBelongsToTenant",
  "persistProviderWriteRequest",
  "auditProviderWrite",
  "providerWriteRequest.findUnique",
  "providerWriteRequest.create",
  "provider_write.",
  "providerMutationExecuted: false",
  "customerVisibleMessageSent: false",
  "Provider write idempotency key was already used for a different request.",
  "idempotencyKeyHash",
]);
mustNotContainAny("ops service no provider write execution", content.opsService, [
  ".changeAddress(",
  ".issueCoupon(",
  ".sendMessage(",
  "providerMutationExecuted: true",
  "customerVisibleMessageSent: true",
]);

mustContainAll("ops provider write tests", content.opsServiceSpec, [
  "queues human-reviewed provider write requests without provider network execution",
  "blocks provider write requests when review adapters are not configured",
  "rejects unsafe provider write request and response shapes",
  "reuses provider write requests for duplicate idempotency keys",
  "fails closed when a provider write idempotency key is reused for a different payload",
  "blocks provider write requests before persistence when cases cross tenants",
  "writeCallCount, 0",
  "includes(\"secret_order_1\"), false",
  "secret_order_idem_1",
]);

mustContainAll("ops provider write controller tests", content.opsControllerSpec, [
  "uses request operator context for provider write requests",
  "rejects insecure header fallback for provider write requests",
  "blocks viewer operators from creating provider write requests",
]);

mustContainAll("web bff provider write route", content.webBffRoute, [
  "/v2/provider-writes/request",
  "/v2/provider-writes/requests",
  "Provider write requests require operator permission",
  "Provider write operations require admin permission",
  "ProviderWriteResponseSchema.parse",
  "readLiteralString",
  "readLiteralBoolean",
]);
mustContainAll("web bff provider write tests", content.webBffSpec, [
  "proxies provider write requests through the operator session without leaking keys",
  "rejects provider write responses that imply network execution or bypass review",
  "lets admin sessions list sanitized provider write requests through the BFF",
  "rejects provider write request lists with unsafe execution state",
  "blocks viewer sessions from requesting provider writes in the BFF",
  "operator_api_key_must_not_leak",
  "payloadHash: \"must_not_leak\"",
]);

mustContainAll("provider write docs", content.providerWriteDocs, [
  "PR58 Provider Write Request Queue",
  "ProviderWriteRequest",
  "PROVIDER_WRITE_REVIEW_ADAPTERS",
  "POST /v2/provider-writes/request",
  "GET /v2/provider-writes/requests",
  "does not call provider APIs",
  "does not execute provider writes",
  "does not send customer-visible replies",
  "npm run verify:provider-write-requests",
]);

mustContainAll("provider adapter docs", content.providerDocs, [
  "PR58 Provider Write Request Queue",
  "ProviderWriteRequest",
  "PROVIDER_WRITE_REVIEW_ADAPTERS",
  "verify:provider-write-requests",
]);

mustContainAll("production readiness docs", content.productionReadiness, [
  "PR58 Provider Write Request Queue",
  "ProviderWriteRequest",
  "npm run verify:provider-write-requests",
]);

mustContainAll("public API surface docs", content.publicApiSurface, [
  "POST /v2/provider-writes/request",
  "GET /v2/provider-writes/requests",
  "ProviderWriteRequest",
  "providerMutationExecuted=false",
]);

mustContainAll("launch runbook docs", content.launchRunbook, [
  "npm run verify:provider-write-requests",
  "ProviderWriteRequest",
  "PROVIDER_WRITE_REVIEW_ADAPTERS",
]);

mustContainAll("task plan references", content.taskPlan, [
  "PR58 - Provider Write Request Queue",
  "verify:provider-write-requests",
]);

if (failures.length > 0) {
  console.error("Provider write request verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider write request verification passed.");

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
