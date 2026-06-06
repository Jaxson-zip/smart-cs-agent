import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  envExample: ".env.example",
  providerDocs: "docs/deploy/provider-adapter-contracts.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  publicApiSurface: "docs/deploy/public-api-surface.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  apiConfig: "apps/api/src/config/api-config.ts",
  apiConfigSpec: "apps/api/src/config/api-config.spec.ts",
  sharedOpsContracts: "packages/shared/src/ops-contracts.ts",
  adapterInterface: "apps/api/src/adapters/adapters.interface.ts",
  adapterRegistry: "apps/api/src/adapters/provider-adapter-registry.service.ts",
  opsController: "apps/api/src/ops/ops.controller.ts",
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
  "verify:provider-readonly",
  "scripts/verify-provider-readonly.mjs",
]);

mustContainAll("env example", content.envExample, [
  "PROVIDER_READONLY_ADAPTERS='[]'",
]);

mustContainAll("provider docs", content.providerDocs, [
  "PR36 Real Provider Readonly Foundation",
  "PROVIDER_READONLY_ADAPTERS",
  "credentialRef",
  "`real_readonly`",
  "`read_only`",
  "`readCapabilities`",
  "`get_order`",
  "`query_logistics`",
  "must not contain access tokens",
  "does not enable real refunds",
  "npm run verify:provider-readonly",
]);
mustNotContainAny("provider docs secret examples", content.providerDocs, [
  "accessToken",
  "refreshToken",
  "clientSecret",
]);

mustContainAll("production readiness references", content.productionReadiness, [
  "PR36 Real Provider Readonly Foundation",
  "PROVIDER_READONLY_ADAPTERS",
  "npm run verify:provider-readonly",
]);

mustContainAll("public API surface references", content.publicApiSurface, [
  "readCapabilities",
  "real_readonly",
  "read_only",
  "PROVIDER_READONLY_ADAPTERS",
]);

mustContainAll("launch runbook references", content.launchRunbook, [
  "npm run verify:provider-readonly",
  "PROVIDER_READONLY_ADAPTERS",
]);

mustContainAll("api config", content.apiConfig, [
  "providerReadonlyAdapterConfigSchema",
  ".strict()",
  "credentialRef",
  "secret:// or vault:// reference",
  "providerReadonlyAdaptersEnvSchema",
  "PROVIDER_READONLY_ADAPTERS",
  "loadProviderReadonlyAdapterConfigs",
  "providerReadonlyAdapters: parsed.data.PROVIDER_READONLY_ADAPTERS",
]);

mustContainAll("api config tests", content.apiConfigSpec, [
  "parses provider readonly adapter references without secrets",
  "rejects provider readonly adapter configs that inline secret material",
  "actual_token_value",
  "PROVIDER_READONLY_ADAPTERS",
  "credentialRef",
]);

mustContainAll("shared ops contracts", content.sharedOpsContracts, [
  "ProviderReadCapabilitySchema",
  '"get_order"',
  '"query_logistics"',
  "readCapabilities: z.array(ProviderReadCapabilitySchema)",
]);

mustContainAll("adapter interface", content.adapterInterface, [
  "ProviderReadCapability",
  "readCapabilities: ProviderReadCapability[]",
]);

mustContainAll("adapter registry", content.adapterRegistry, [
  "loadProviderReadonlyAdapterConfigs",
  "readonlyContractKeys",
  "contractKey(item.tenantId, item.channel)",
  "contractForTenant",
  "contractKey(tenantId, contract.channel)",
  "readOnlyContract",
  'mode: "real_readonly"',
  'writePolicy: "read_only"',
  'capabilities: ["handoff"]',
  "readCapabilities: READ_CAPABILITIES",
  "realCommerceActionsEnabled: false",
  "customerVisibleActionsEnabled: false",
]);
mustNotEnableRealWrites("adapter registry", content.adapterRegistry);

mustContainAll("ops tenant context", content.opsController, [
  "const context = requireRequestContext(headers)",
  "this.opsService.listIntegrations(context.tenantId)",
  "tenantId: context.tenantId",
]);
mustContainAll("ops service tenant context", content.opsService, [
  "listIntegrations(tenantId: string)",
  "this.providerAdapters.listIntegrations(tenantId)",
  "this.providerAdapters.evaluateActionPolicy(request)",
]);

mustContainAll("ops service behavior coverage", content.opsServiceSpec, [
  "projects configured real provider adapters as readonly without enabling writes",
  "does not leak readonly provider projection across tenants",
  "PROVIDER_READONLY_ADAPTERS",
  'listIntegrations("tenant_1")',
  'listIntegrations("tenant_2")',
  'taobao.adapterMode, "real_readonly"',
  'taobao.writePolicy, "read_only"',
  'taobao.capabilities, ["handoff"]',
  "writeAttempt.status",
  '"blocked"',
]);

mustContainAll("task plan references", content.taskPlan, [
  "PR36 - Real Provider Readonly Foundation",
  "verify:provider-readonly",
]);

if (failures.length > 0) {
  console.error("Provider readonly verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider readonly verification passed.");

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

function mustNotEnableRealWrites(label, haystack) {
  const forbiddenPatterns = [
    /customerVisibleActionsEnabled\s*(?::|=)\s*true/,
    /realCommerceActionsEnabled\s*(?::|=)\s*true/,
    /writePolicy\s*(?::|=)\s*["']human_review_required["']/,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(haystack)) {
      failures.push(`${label}: unexpectedly enables real or customer-visible writes`);
    }
  }
}
