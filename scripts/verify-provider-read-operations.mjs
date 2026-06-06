import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  opsController: "apps/api/src/ops/ops.controller.ts",
  opsControllerSpec: "apps/api/src/ops/ops.controller.spec.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  webRunsRoute: "apps/web/src/app/api/operator/provider-reads/runs/route.ts",
  webSummaryRoute: "apps/web/src/app/api/operator/provider-reads/summary/route.ts",
  webBffSpec: "apps/web/src/app/api/operator/operator-bff.spec.ts",
  providerDocs: "docs/deploy/provider-adapter-contracts.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  publicApiSurface: "docs/deploy/public-api-surface.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  taskPlan: "task_plan.md",
};

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-read-operations",
  "scripts/verify-provider-read-operations.mjs",
]);

mustContainAll("api controller provider read operations", content.opsController, [
  '@Get("provider-reads/runs")',
  '@Get("provider-reads/summary")',
  "requireProviderReadAdminAccess",
  "Provider read operations require admin permission",
  "Operator API key is required",
  "authMethod",
  "Provider read summary window is invalid",
  "PROVIDER_READ_SUMMARY_WINDOW_MS",
]);

mustContainAll("api service provider read operations", content.opsService, [
  "listProviderReadRuns",
  "getProviderReadSummary",
  "providerReadRun.findMany",
  "providerReadRun.count",
  "toSanitizedProviderReadRun",
  "lookupFingerprint",
  "requestFingerprint",
  "sanitizeLookupKeys",
  "PROVIDER_READ_SUMMARY_WINDOW_MS",
]);

mustContainAll("api provider read operation tests", content.opsServiceSpec, [
  "lists sanitized provider read runs for one tenant only",
  "summarizes provider read runs without leaking lookup data",
  "includes(\"secret_order_1\"), false",
  "includes(\"secret_order_2\"), false",
  "\"lookupHash\" in runs[0], false",
]);
mustContainAll("api controller provider read operation tests", content.opsControllerSpec, [
  "lets admin operators list sanitized provider read runs",
  "rejects non-admin provider read operation visibility",
  "rejects insecure header fallback for provider read operation visibility",
  "rejects invalid provider read summary windows",
  "lets admin operators read provider read summaries",
]);

mustContainAll("web provider read runs route", content.webRunsRoute, [
  "Provider read operations require admin permission",
  "/v2/provider-reads/runs",
  "lookupFingerprint",
  "requestFingerprint",
  "providerDataReturned: false",
  "Provider read operation response is invalid",
]);
mustNotContainAny("web provider read runs raw fields", content.webRunsRoute, [
  "lookupHash",
  "requestHash",
  "idempotencyKey",
  "providerPayload",
  "providerResponse",
  "operatorApiKey",
  '"orderId"',
  '"logisticsId"',
  "customerName",
  "customerPhone",
  "customerAddress",
  "customerMessage",
]);

mustContainAll("web provider read summary route", content.webSummaryRoute, [
  "Provider read operations require admin permission",
  "/v2/provider-reads/summary",
  "policyAcceptedCount",
  "blockedCount",
  "failedCount",
  "Provider read operation summary response is invalid",
]);
mustNotContainAny("web provider read summary raw fields", content.webSummaryRoute, [
  "lookupHash",
  "requestHash",
  "idempotencyKey",
  "providerPayload",
  "providerResponse",
  "operatorApiKey",
  '"orderId"',
  '"logisticsId"',
  "customerName",
  "customerPhone",
  "customerAddress",
  "customerMessage",
]);

mustContainAll("web bff provider read operation tests", content.webBffSpec, [
  "lets admin sessions list sanitized provider read runs through the BFF",
  "lets admin sessions read sanitized provider read summaries through the BFF",
  "blocks non-admin sessions from provider read operation visibility in the BFF",
  "must_not_leak",
  "providerPayload",
  "providerResponse",
  "operatorApiKey",
  "raw_order_1",
  "customer_phone_must_not_leak",
]);

mustContainAll("provider docs", content.providerDocs, [
  "PR39 Provider Read Operations Visibility",
  "GET /v2/provider-reads/runs",
  "GET /v2/provider-reads/summary",
  "reject the legacy insecure `x-tenant-id` header fallback",
  "lookupFingerprint",
  "requestFingerprint",
  "npm run verify:provider-read-operations",
]);

mustContainAll("production readiness docs", content.productionReadiness, [
  "PR39 Provider Read Operations Visibility",
  "admin-only",
  "rejects the legacy insecure `x-tenant-id` header fallback",
  "lookupFingerprint",
  "requestFingerprint",
  "npm run verify:provider-read-operations",
]);

mustContainAll("public API surface docs", content.publicApiSurface, [
  "GET /v2/provider-reads/runs",
  "GET /v2/provider-reads/summary",
  "GET /api/operator/provider-reads/runs",
  "GET /api/operator/provider-reads/summary",
  "reject the legacy insecure `x-tenant-id` header fallback",
  "Provider read operations require admin permission",
]);

mustContainAll("launch runbook docs", content.launchRunbook, [
  "npm run verify:provider-read-operations",
  "provider read operations",
  "reject the legacy insecure `x-tenant-id` header fallback",
]);

mustContainAll("task plan", content.taskPlan, [
  "PR39 - Provider Read Operations Visibility",
  "provider read operations visibility",
  "verify:provider-read-operations",
]);

if (failures.length > 0) {
  console.error("Provider read operations verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider read operations verification passed.");

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
