import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.SMARTCS_PROVIDER_WRITE_APPROVAL_STATE_REPO_ROOT
  ? resolve(process.env.SMARTCS_PROVIDER_WRITE_APPROVAL_STATE_REPO_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  sharedContracts: "packages/shared/src/ops-contracts.ts",
  prismaSchema: "prisma/schema.prisma",
  migration:
    "prisma/migrations/20260607230000_pr59_provider_write_approval_state/migration.sql",
  providerWriteDocs: "docs/deploy/provider-write-requests.md",
  providerDocs: "docs/deploy/provider-adapter-contracts.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  publicApiSurface: "docs/deploy/public-api-surface.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  staticCiWorkflow: ".github/workflows/production-static-gates.yml",
  staticCiVerifier: "scripts/verify-production-static-ci.mjs",
  productionLaunchVerifier: "scripts/verify-production-launch.mjs",
  opsController: "apps/api/src/ops/ops.controller.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  opsControllerSpec: "apps/api/src/ops/ops.controller.spec.ts",
  webBffRequestRoute:
    "apps/web/src/app/api/operator/provider-writes/requests/route.ts",
  webBffApproveRoute:
    "apps/web/src/app/api/operator/provider-writes/requests/[id]/approve/route.ts",
  webBffRejectRoute:
    "apps/web/src/app/api/operator/provider-writes/requests/[id]/reject/route.ts",
  webBffSpec: "apps/web/src/app/api/operator/operator-bff.spec.ts",
  taskPlan: "task_plan.md",
  progress: "progress.md",
};

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-write-approval-state",
  "scripts/verify-provider-write-approval-state.mjs",
]);

mustContainAll("shared provider write approval contracts", content.sharedContracts, [
  "ProviderWriteStatusSchema",
  "\"approved\"",
  "\"rejected\"",
  "ProviderWriteApprovalRequestSchema",
  "ProviderWriteRejectionRequestSchema",
  "ProviderWriteApprovalReasonCodeSchema",
  "ProviderWriteRejectionReasonCodeSchema",
  "providerMutationExecuted: z.literal(false)",
  "customerVisibleMessageSent: z.literal(false)",
  "networkExecution: z.literal(\"not_started\")",
]);
mustNotContainAny("shared provider write review unsafe free text", content.sharedContracts, [
  "reviewNote: z.string",
  "operatorVisibleReason: z.string",
  "rawNote",
]);

mustContainAll("provider write approval prisma schema", content.prismaSchema, [
  "reviewerOperatorId",
  "reviewedAt",
  "reviewReasonCode",
  "reviewFingerprint",
  "payloadEscrowStatus",
  "payloadEscrowFingerprint",
  "@@index([tenantId, status, reviewedAt])",
  "@@index([tenantId, reviewerOperatorId, reviewedAt])",
]);
mustNotContainAny("provider write approval prisma raw fields", content.prismaSchema, [
  "newAddress",
  "providerPayload",
  "providerResponse",
  "rawProvider",
  "rawOrderId",
  "rawAddress",
]);

mustContainAll("provider write approval migration", content.migration, [
  'ALTER TABLE "ProviderWriteRequest"',
  '"reviewerOperatorId" TEXT',
  '"reviewedAt" TIMESTAMP(3)',
  '"reviewReasonCode" TEXT',
  '"reviewFingerprint" TEXT',
  '"payloadEscrowStatus" TEXT NOT NULL DEFAULT',
  '"payloadEscrowFingerprint" TEXT',
  'CREATE INDEX "ProviderWriteRequest_tenantId_status_reviewedAt_idx"',
]);

mustContainAll("ops controller approval routes", content.opsController, [
  'Post("provider-writes/requests/:id/approve")',
  'Post("provider-writes/requests/:id/reject")',
  "ProviderWriteApprovalRequestSchema.parse",
  "ProviderWriteRejectionRequestSchema.parse",
  "requireProviderWriteAdminAccess",
  "reviewerOperatorId: context.operatorId",
  "tenantId: context.tenantId",
  "Operator API key is required",
]);

mustContainAll("ops service approval state machine", content.opsService, [
  "approveProviderWriteRequest",
  "rejectProviderWriteRequest",
  "reviewProviderWriteRequest",
  "Provider write approval requires two-person review.",
  "status: \"approval_required\"",
  "providerWriteRequest.updateMany",
  "reviewFingerprint",
  "payloadEscrowStatus: \"not_stored\"",
  "provider_write.",
  "providerMutationExecuted: false",
  "customerVisibleMessageSent: false",
]);
mustNotContainAny("ops service no write execution", content.opsService, [
  ".changeAddress(",
  ".issueCoupon(",
  ".sendMessage(",
  "providerMutationExecuted: true",
  "customerVisibleMessageSent: true",
]);

mustContainAll("ops service approval tests", content.opsServiceSpec, [
  "approves queued provider write requests with two-person review without provider execution",
  "blocks provider write self-approval and leaves the request pending",
  "rejects queued provider write requests without provider execution",
  "fails closed when reviewing provider write requests outside the tenant or terminal state",
  "writeCallCount, 0",
  "secret_order_approval",
]);

mustContainAll("ops controller approval tests", content.opsControllerSpec, [
  "uses request operator context for provider write approvals",
  "uses request operator context for provider write rejections",
  "rejects non-admin provider write approvals",
  "rejects insecure header fallback for provider write approvals",
]);

mustContainAll("web bff approval routes", content.webBffApproveRoute, [
  "/v2/provider-writes/requests/",
  "/approve",
  "ProviderWriteApprovalRequestSchema.safeParse",
  "Provider write operations require admin permission",
  "ProviderWriteResponseSchema.parse",
  "readLiteralBoolean",
]);
mustContainAll("web bff rejection routes", content.webBffRejectRoute, [
  "/v2/provider-writes/requests/",
  "/reject",
  "ProviderWriteRejectionRequestSchema.safeParse",
  "Provider write operations require admin permission",
  "ProviderWriteResponseSchema.parse",
  "readLiteralBoolean",
]);
mustContainAll("web bff request route status split", content.webBffRequestRoute, [
  "[\"approval_required\", \"blocked\", \"failed\"]",
  "ProviderWriteRequestSchema.safeParse",
  "toProviderWriteRequestBody",
  "JSON.stringify(toProviderWriteRequestBody",
  "\"approved\"",
  "\"rejected\"",
  "payloadEscrowStatus",
  "reviewFingerprint",
]);
mustContainAll("web bff approval tests", content.webBffSpec, [
  "rejects provider write request responses that are already approved",
  "proxies provider write approvals through an admin session without leaking keys or raw payload",
  "rejects unsafe provider write approval responses from the API",
  "blocks non-admin provider write approvals and proxies rejections for admins",
  "operator_api_key_must_not_leak",
]);

mustContainAll("provider write docs", content.providerWriteDocs, [
  "PR59 Provider Write Approval State Machine",
  "POST /v2/provider-writes/requests/:id/approve",
  "POST /v2/provider-writes/requests/:id/reject",
  "two-person review",
  "payloadEscrowStatus",
  "does not execute provider writes",
  "npm run verify:provider-write-approval-state",
]);

mustContainAll("provider adapter docs", content.providerDocs, [
  "PR59 Provider Write Approval State Machine",
  "verify:provider-write-approval-state",
  "two-person review",
]);

mustContainAll("production readiness docs", content.productionReadiness, [
  "PR59 Provider Write Approval State Machine",
  "npm run verify:provider-write-approval-state",
]);

mustContainAll("public API surface docs", content.publicApiSurface, [
  "POST /v2/provider-writes/requests/:id/approve",
  "POST /v2/provider-writes/requests/:id/reject",
  "POST /api/operator/provider-writes/requests/:id/approve",
  "POST /api/operator/provider-writes/requests/:id/reject",
  "payloadEscrowStatus",
]);

mustContainAll("launch runbook docs", content.launchRunbook, [
  "npm run verify:provider-write-approval-state",
  "Provider write approval state machine",
]);

mustContainAll("static CI wiring", content.staticCiWorkflow, [
  "node --test scripts/verify-provider-write-approval-state.test.mjs",
  "npm run verify:provider-write-approval-state",
]);

mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
  "node --test scripts/verify-provider-write-approval-state.test.mjs",
  "npm run verify:provider-write-approval-state",
]);

mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
  "verify-provider-write-approval-state.mjs",
  "verify:provider-write-approval-state",
  "provider write approval state",
]);

mustContainAll("task plan references", content.taskPlan, [
  "PR59 - Provider Write Approval State Machine",
  "verify:provider-write-approval-state",
]);

mustContainAll("progress references", content.progress, [
  "Started PR59 provider write approval state machine",
]);

if (failures.length > 0) {
  console.error("Provider write approval state verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider write approval state verification passed.");

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
