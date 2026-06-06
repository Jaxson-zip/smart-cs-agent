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
  afterSalesContracts: "packages/shared/src/after-sales-contracts.ts",
  adapterInterface: "apps/api/src/adapters/adapters.interface.ts",
  adapterRegistry: "apps/api/src/adapters/provider-adapter-registry.service.ts",
  taobaoAdapter: "apps/api/src/adapters/mock-taobao.adapter.ts",
  douyinAdapter: "apps/api/src/adapters/mock-douyin.adapter.ts",
  actionService: "apps/api/src/actions/action.service.ts",
  actionServiceSpec: "apps/api/src/actions/action.service.spec.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  webCaseMapper: "apps/web/src/lib/cases.ts",
  taskPlan: "task_plan.md",
};

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-adapters",
  "scripts/verify-provider-adapters.mjs",
]);

mustContainAll("provider adapter docs", content.providerDocs, [
  "PR35 Provider Adapter Contract Package",
  "does not enable real provider network calls",
  "Current Adapter Status",
  "`sandbox_mock`",
  "`sandbox_only`",
  "`real_readonly`",
  "`real_actions_disabled`",
  "`human_review_required`",
  "`handoff` is the only queueable non-commerce action",
  "`connected=true` for a mock adapter means the sandbox adapter is available",
  "`simulated`",
  "Real customer-visible replies remain outside this PR",
  "Real commerce actions remain outside this PR",
  "npm run verify:provider-adapters",
]);

mustContainAll("shared ops contracts", content.sharedOpsContracts, [
  "ProviderAdapterModeSchema",
  "ProviderWritePolicySchema",
  '"sandbox_mock"',
  '"real_readonly"',
  '"real_actions_disabled"',
  '"not_configured"',
  '"sandbox_only"',
  '"read_only"',
  '"human_review_required"',
  '"disabled"',
  "adapterMode: ProviderAdapterModeSchema",
  "writePolicy: ProviderWritePolicySchema",
  "customerVisibleActionsEnabled: z.boolean()",
  "realCommerceActionsEnabled: z.boolean()",
  "contractVersion: z.string().min(1)",
  "safetyNotes: z.array(z.string().min(1))",
]);

mustContainAll("after-sales action contracts", content.afterSalesContracts, [
  "afterSalesActionStatusSchema",
  '"success"',
  '"failed"',
  '"pending"',
  '"simulated"',
]);

mustContainAll("adapter interface", content.adapterInterface, [
  "ProviderAdapterContract",
  "mode: ProviderAdapterMode",
  "writePolicy: ProviderWritePolicy",
  "customerVisibleActionsEnabled: boolean",
  "realCommerceActionsEnabled: boolean",
  "contractVersion: string",
  "safetyNotes: string[]",
]);

mustContainAll("adapter registry", content.adapterRegistry, [
  "ProviderAdapterRegistry",
  "COMMERCE_WRITE_ACTIONS",
  '"modify_address"',
  '"issue_coupon"',
  '"escalate_coupon"',
  '"urge_logistics"',
  '"refund"',
  '"update_invoice"',
  'request.action === "handoff"',
  "Blocked by provider write policy",
  "real commerce writes are not enabled",
  "customer-visible actions are disabled",
  "toIntegrationStatus",
  "adapterMode: contract.mode",
  "writePolicy: contract.writePolicy",
  "disabledContract",
]);

mustContainAll("mock taobao adapter", content.taobaoAdapter, [
  "readonly channel = 'taobao'",
  "readonly mode = 'sandbox_mock'",
  "readonly writePolicy = 'sandbox_only'",
  "readonly customerVisibleActionsEnabled = false",
  "readonly realCommerceActionsEnabled = false",
  "provider-adapter-contract-v1",
  "never call real Taobao APIs",
]);

mustContainAll("mock douyin adapter", content.douyinAdapter, [
  "readonly channel = 'douyin'",
  "readonly mode = 'sandbox_mock'",
  "readonly writePolicy = 'sandbox_only'",
  "readonly customerVisibleActionsEnabled = false",
  "readonly realCommerceActionsEnabled = false",
  "provider-adapter-contract-v1",
  "never call real Douyin APIs",
]);

mustContainAll("ops service policy use", content.opsService, [
  "ProviderAdapterRegistry",
  "this.providerAdapters.listIntegrations()",
  "this.providerAdapters.evaluateActionPolicy(request)",
  'status: "blocked"',
  "policy.reason",
  'Action queued for internal operator handling.',
]);
mustNotContainAllTogether("ops service static integration list", content.opsService, [
  'channel: "taobao"',
  'capabilities: [',
  'lastEventAt: new Date().toISOString()',
]);

mustContainAll("ops service behavior coverage", content.opsServiceSpec, [
  "CommerceActionSchema",
  "blocks every non-handoff commerce action for sandbox Taobao and Douyin",
  "CommerceActionSchema.options.filter",
  'action !== "handoff"',
  'response.status, "blocked"',
]);

mustContainAll("action service mock boundary", content.actionService, [
  "executeMockAction",
  'status: "simulated"',
  'status: "pending"',
]);
mustNotContainAny("action service real-success mock markers", content.actionService, [
  'status: "success"',
]);

mustContainAll("action service behavior coverage", content.actionServiceSpec, [
  "marks mock provider actions as simulated instead of real success",
  "keeps human workflow actions pending",
  'result.status, "simulated"',
]);

mustContainAll("web action status labels", content.webCaseMapper, [
  "simulated",
  "模拟完成",
]);

mustContainAll("production readiness references", content.productionReadiness, [
  "PR35 Provider Adapter Contract Package",
  "docs/deploy/provider-adapter-contracts.md",
  "npm run verify:provider-adapters",
]);

mustContainAll("public API surface references", content.publicApiSurface, [
  "Provider adapter contracts",
  "adapterMode",
  "writePolicy",
  "customerVisibleActionsEnabled",
  "realCommerceActionsEnabled",
  "provider write policy",
]);

mustContainAll("launch runbook references", content.launchRunbook, [
  "npm run verify:provider-adapters",
  "Provider adapter contract",
  "real provider network calls",
]);

mustContainAll("task plan references", content.taskPlan, [
  "PR35 - Provider Adapter Contract Package",
  "verify:provider-adapters",
]);

mustNotEnableRealWrites("adapter registry", content.adapterRegistry);
mustNotEnableRealWrites("mock taobao adapter", content.taobaoAdapter);
mustNotEnableRealWrites("mock douyin adapter", content.douyinAdapter);

if (failures.length > 0) {
  console.error("Provider adapter verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider adapter verification passed.");

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

function mustNotContainAllTogether(label, haystack, needles) {
  if (needles.every((needle) => haystack.includes(needle))) {
    failures.push(`${label}: found all forbidden markers together`);
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
