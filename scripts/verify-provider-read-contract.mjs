import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  providerDocs: "docs/deploy/provider-adapter-contracts.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  publicApiSurface: "docs/deploy/public-api-surface.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  sharedOpsContracts: "packages/shared/src/ops-contracts.ts",
  adapterRegistry: "apps/api/src/adapters/provider-adapter-registry.service.ts",
  opsController: "apps/api/src/ops/ops.controller.ts",
  opsControllerSpec: "apps/api/src/ops/ops.controller.spec.ts",
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
  "verify:provider-read-contract",
  "scripts/verify-provider-read-contract.mjs",
]);

mustContainAll("shared ops contracts", content.sharedOpsContracts, [
  "ProviderReadLookupSchema",
  "ProviderReadRequestSchema",
  "ProviderReadResponseSchema",
  "ProviderReadCapabilitySchema",
  "readCapability: ProviderReadCapabilitySchema",
  "get_order provider reads require orderId",
  "query_logistics provider reads require orderId or logisticsId",
  'status: z.enum(["policy_accepted", "blocked", "failed"])',
  'networkExecution: z.enum(["not_started", "not_implemented"])',
  "providerDataReturned: z.literal(false)",
  ".strict()",
  "at least one provider read lookup identifier is required",
]);
mustNotContainAny("shared ops contract broad provider read lookup", content.sharedOpsContracts, [
  "customerExternalId: z.string().min(1).optional()",
]);

mustContainAll("adapter registry read policy", content.adapterRegistry, [
  "evaluateReadPolicy",
  "ProviderReadRequest",
  'contract.mode !== "real_readonly"',
  'contract.writePolicy !== "read_only"',
  "Provider readonly credentials are not configured for this tenant and channel.",
  "contract.readCapabilities.includes(request.readCapability)",
]);

mustContainAll("ops controller read route", content.opsController, [
  '@Post("provider-reads/execute")',
  "executeProviderRead",
  "ProviderReadRequestSchema.parse(body)",
  "tenantId: context.tenantId",
  "operatorId: context.operatorId",
]);

mustContainAll("ops service no-network response", content.opsService, [
  "executeProviderRead",
  "this.providerAdapters.evaluateReadPolicy(request)",
  'status: "policy_accepted"',
  'networkExecution: "not_implemented"',
  "providerDataReturned: false",
  "provider network execution is not implemented in this build",
]);
mustNotContainAny("ops service live provider read leakage", content.opsService, [
  "getOrder(",
  "queryLogistics(",
  "fetch(",
  "axios",
  "providerPayload",
  "rawProvider",
  "providerDataReturned: true",
]);

mustContainAll("ops service behavior tests", content.opsServiceSpec, [
  "blocks provider reads unless real readonly credentials are configured",
  "accepts readonly provider reads by policy without returning provider data",
  "does not allow provider reads through another tenant's readonly projection",
  "does not call provider adapters when a readonly read is policy accepted",
  "blocks unsupported readonly capabilities even when an adapter is read-only",
  "keeps provider read responses exact and free of provider payload fields",
  "rejects unsafe provider read request and response shapes",
  'response.networkExecution, "not_implemented"',
  "response.providerDataReturned, false",
  "PoisonTaobaoAdapter",
  "providerPayload",
  "customerExternalId",
]);

mustContainAll("ops controller behavior tests", content.opsControllerSpec, [
  "uses request operator context for provider read execution",
  "requires operator context before executing provider reads",
  "blocks provider read body tenant spoofing through the real service",
  "tenantId: \"spoofed_tenant\"",
  'capturedRequest?.tenantId, "demo_tenant"',
  'capturedRequest?.operatorId, "operator_from_context"',
]);

mustContainAll("provider docs", content.providerDocs, [
  "PR37 Provider Read Execution Contract",
  "POST /v2/provider-reads/execute",
  "policy_accepted",
  "networkExecution=not_implemented",
  "providerDataReturned=false",
  "does not call real provider APIs",
  "does not return raw provider data",
  "npm run verify:provider-read-contract",
]);

mustContainAll("production readiness references", content.productionReadiness, [
  "PR37 Provider Read Execution Contract",
  "POST /v2/provider-reads/execute",
  "npm run verify:provider-read-contract",
]);

mustContainAll("public API surface references", content.publicApiSurface, [
  "POST /v2/provider-reads/execute",
  "Provider readonly API",
  "providerDataReturned=false",
  "networkExecution=not_implemented",
]);

mustContainAll("launch runbook references", content.launchRunbook, [
  "npm run verify:provider-read-contract",
  "POST /v2/provider-reads/execute",
]);

mustContainAll("task plan references", content.taskPlan, [
  "PR37 - Provider Read Execution Contract",
  "verify:provider-read-contract",
]);

mustNotContainRealExecutionLanguage({
  providerDocs: content.providerDocs,
  productionReadiness: content.productionReadiness,
  publicApiSurface: content.publicApiSurface,
  launchRunbook: content.launchRunbook,
});

if (failures.length > 0) {
  console.error("Provider read contract verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider read contract verification passed.");

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

function mustNotContainRealExecutionLanguage(items) {
  const forbiddenPatterns = [
    /\blive provider read(?:s)? (?:is|are) enabled/i,
    /\breal provider data (?:is|are) returned/i,
    /\breturns raw provider/i,
    /\bqueries Taobao directly/i,
    /\bqueries Douyin directly/i,
  ];

  for (const [label, haystack] of Object.entries(items)) {
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(haystack)) {
        failures.push(`${label}: contains unsafe live-read language ${pattern.source}`);
      }
    }
  }
}
