import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  prismaSchema: "prisma/schema.prisma",
  migration: "prisma/migrations/20260606143000_pr38_provider_read_runs/migration.sql",
  providerDocs: "docs/deploy/provider-adapter-contracts.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  publicApiSurface: "docs/deploy/public-api-surface.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  opsModule: "apps/api/src/ops/ops.module.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  taskPlan: "task_plan.md",
};

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-read-audit",
  "scripts/verify-provider-read-audit.mjs",
]);

mustContainAll("prisma schema", content.prismaSchema, [
  "model ProviderReadRun",
  "tenantId",
  "operatorId",
  "caseId",
  "channel",
  "readCapability",
  "idempotencyKey",
  "lookupHash",
  "lookupKeys",
  "requestHash",
  "status",
  "networkExecution",
  "providerDataReturned Boolean  @default(false)",
  "@@unique([tenantId, idempotencyKey])",
  "@@index([tenantId, channel, createdAt])",
]);
mustNotContainAny("prisma schema raw lookup fields", content.prismaSchema, [
  "orderId        String",
  "logisticsId   String",
  "providerPayload",
  "rawProvider",
  "providerResponse",
]);

mustContainAll("pr38 migration", content.migration, [
  'CREATE TABLE "ProviderReadRun"',
  '"lookupHash" TEXT NOT NULL',
  '"lookupKeys" JSONB NOT NULL',
  '"requestHash" TEXT NOT NULL',
  '"providerDataReturned" BOOLEAN NOT NULL DEFAULT false',
  'CREATE UNIQUE INDEX "ProviderReadRun_tenantId_idempotencyKey_key"',
]);

mustContainAll("ops module dependencies", content.opsModule, [
  "PrismaModule",
  "AuditModule",
  "imports: [AdaptersModule, PrismaModule, AuditModule]",
]);

mustContainAll("ops service persistence", content.opsService, [
  "providerReadMetadata",
  "lookupHash",
  "lookupKeys",
  "requestHash",
  "findProviderReadRun",
  "providerReadCaseBelongsToTenant",
  "persistProviderReadRun",
  "auditProviderRead",
  "afterSalesCase.findFirst",
  "case_tenant_mismatch",
  "tenantId_idempotencyKey",
  "providerReadRun.findUnique",
  "providerReadRun.create",
  "provider_read.",
  "providerDataReturned: false",
  "Provider read idempotency key was already used for a different request.",
  "isUniqueConstraintError",
  '"P2002"',
]);
mustNotContainAny("ops service raw provider read persistence", content.opsService, [
  "orderId: request.lookup.orderId",
  "logisticsId: request.lookup.logisticsId",
  "providerPayload",
  "rawProvider",
  "providerResponse",
  "providerDataReturned: true",
]);

mustContainAll("ops service behavior tests", content.opsServiceSpec, [
  "persists provider read runs and sanitized audit records",
  "blocks persisted provider reads for cases outside the authenticated tenant",
  "reuses the same provider read run for duplicate idempotency keys",
  "fails closed when an idempotency key is reused for a different provider read",
  "re-reads provider read runs after a duplicate idempotency race",
  "audits sanitized idempotency conflicts after a duplicate race",
  "failNextCreateWithDuplicate",
  "includes(\"case_1\")",
  "persistence.runs.length, 1",
  "persistence.auditEntries.length, 1",
  "includes(\"order_1\"), false",
  "includes(\"order_2\")",
  "lookupHash",
  "requestHash",
]);

mustContainAll("provider docs", content.providerDocs, [
  "PR38 Provider Read Audit And Idempotency",
  "ProviderReadRun",
  "tenantId + idempotencyKey",
  "AfterSalesCase.id + merchantId",
  "lookupHash",
  "requestHash",
  "does not store raw order IDs",
  "npm run verify:provider-read-audit",
]);

mustContainAll("production readiness references", content.productionReadiness, [
  "PR38 Provider Read Audit And Idempotency",
  "ProviderReadRun",
  "caseId + merchantId",
  "npm run verify:provider-read-audit",
]);

mustContainAll("public API surface references", content.publicApiSurface, [
  "ProviderReadRun",
  "verified inside the authenticated tenant",
  "lookupHash",
  "idempotency",
  "must not persist raw order IDs",
]);

mustContainAll("launch runbook references", content.launchRunbook, [
  "npm run verify:provider-read-audit",
  "ProviderReadRun",
  "verified inside the authenticated tenant",
]);

mustContainAll("task plan references", content.taskPlan, [
  "PR38 - Provider Read Audit And Idempotency",
  "caseId + authenticated tenant",
  "verify:provider-read-audit",
]);

if (failures.length > 0) {
  console.error("Provider read audit verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider read audit verification passed.");

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
