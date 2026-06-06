import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  envExample: ".env.example",
  apiConfig: "apps/api/src/config/api-config.ts",
  apiConfigSpec: "apps/api/src/config/api-config.spec.ts",
  adapterModule: "apps/api/src/adapters/adapters.module.ts",
  harnessService:
    "apps/api/src/adapters/provider-readonly-client-harness.service.ts",
  harnessSpec:
    "apps/api/src/adapters/provider-readonly-client-harness.service.spec.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  providerDocs: "docs/deploy/provider-adapter-contracts.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  publicApiSurface: "docs/deploy/public-api-surface.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  productionLaunchVerifier: "scripts/verify-production-launch.mjs",
  taskPlan: "task_plan.md",
};

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-read-harness",
  "scripts/verify-provider-read-harness.mjs",
]);

mustContainAll("env example", content.envExample, [
  "PROVIDER_READ_TIMEOUT_MS",
  "PROVIDER_READ_MAX_RETRIES",
]);

mustContainAll("api config", content.apiConfig, [
  "PROVIDER_READ_TIMEOUT_MS",
  "PROVIDER_READ_MAX_RETRIES",
  "loadProviderReadonlyHarnessConfig",
  "timeoutMs",
  "maxRetries",
  ".min(100)",
  ".max(30000)",
  ".max(3)",
]);

mustContainAll("api config tests", content.apiConfigSpec, [
  "providerReadTimeoutMs",
  "providerReadMaxRetries",
  "rejects invalid provider read harness configuration",
]);

mustContainAll("adapter module", content.adapterModule, [
  "ProviderReadonlyClientHarnessService",
  "providers:",
  "exports:",
]);

mustContainAll("harness service", content.harnessService, [
  "ProviderReadonlyClientHarnessService",
  "planReadonlyRead",
  "ProviderReadonlyClientHarnessResult",
  'executionMode: "sandbox_noop"',
  'executionMode: "credential_not_ready"',
  'networkExecution: "not_implemented"',
  "networkAttempted: false",
  "providerDataReturned: false",
  "providerResponseCaptured: false",
  "attemptCount: 0",
  "providerRequestPrepared",
]);
mustNotContainAny("harness forbidden behavior", content.harnessService, [
  "fetch(",
  "axios",
  "http.request",
  "https.request",
  "providerDataReturned: true",
  "providerResponseCaptured: true",
  "networkAttempted: true",
]);

mustContainAll("harness tests", content.harnessSpec, [
  "creates a no-network sandbox execution plan",
  "does not prepare a provider request when credentials are not ready",
  "order_must_not_leak",
  "networkAttempted",
  "providerDataReturned",
  "providerResponseCaptured",
]);

mustContainAll("ops service", content.opsService, [
  "ProviderReadonlyClientHarnessService",
  "planProviderReadExecution",
  "providerReadExecution",
  "toProviderReadExecutionAuditMetadata",
  "providerDataReturned: false",
  "networkAttempted: false",
  "providerResponseCaptured: false",
]);
mustNotContainAny("ops forbidden provider execution", content.opsService, [
  "providerDataReturned: true",
  "networkAttempted: true",
  "providerResponseCaptured: true",
  "fetch(",
  "axios",
  "http.request",
  "https.request",
]);

mustContainAll("ops tests", content.opsServiceSpec, [
  "audits readonly sandbox harness execution without network or provider data",
  "order_harness_must_not_leak",
  "providerReadExecution",
  "networkAttempted: false",
  "providerDataReturned: false",
  "providerResponseCaptured: false",
]);

mustContainAll("provider docs", content.providerDocs, [
  "PR42 Provider Readonly Sandbox Harness",
  "ProviderReadonlyClientHarnessService",
  "PROVIDER_READ_TIMEOUT_MS",
  "PROVIDER_READ_MAX_RETRIES",
  "networkAttempted=false",
  "providerDataReturned=false",
  "npm run verify:provider-read-harness",
]);

mustContainAll("production readiness docs", content.productionReadiness, [
  "PR42 Provider Readonly Sandbox Harness",
  "ProviderReadonlyClientHarnessService",
  "PROVIDER_READ_TIMEOUT_MS",
  "PROVIDER_READ_MAX_RETRIES",
  "npm run verify:provider-read-harness",
]);

mustContainAll("public api docs", content.publicApiSurface, [
  "Provider readonly sandbox harness",
  "networkAttempted=false",
  "providerDataReturned=false",
  "providerResponseCaptured=false",
]);

mustContainAll("launch runbook", content.launchRunbook, [
  "npm run verify:provider-read-harness",
  "provider readonly sandbox harness",
  "networkAttempted=false",
  "providerDataReturned=false",
]);

mustContainAll("production launch verifier", content.productionLaunchVerifier, [
  "verify:provider-read-harness",
]);

mustContainAll("task plan", content.taskPlan, [
  "PR42 - Provider Readonly Sandbox Harness",
  "verify:provider-read-harness",
]);

if (failures.length > 0) {
  console.error("Provider read harness verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider read harness verification passed.");

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
