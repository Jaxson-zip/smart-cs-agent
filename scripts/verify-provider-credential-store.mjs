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
  credentialStore: "apps/api/src/adapters/provider-credential-store.service.ts",
  credentialStoreSpec:
    "apps/api/src/adapters/provider-credential-store.service.spec.ts",
  credentialResolver:
    "apps/api/src/adapters/provider-credential-resolver.service.ts",
  credentialResolverSpec:
    "apps/api/src/adapters/provider-credential-resolver.service.spec.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
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
  "verify:provider-credential-store",
  "scripts/verify-provider-credential-store.mjs",
]);

mustContainAll("env example", content.envExample, [
  "PROVIDER_READONLY_ADAPTERS",
  "PROVIDER_CREDENTIALS",
]);

mustContainAll("api config credential inventory", content.apiConfig, [
  "PROVIDER_CREDENTIALS",
  "providerCredentialRecordSchema",
  "loadProviderCredentialRefs",
  "credentialRef",
  ".strict()",
  "new Set(credentialRefs)",
  "without inline secrets",
]);
mustNotContainAny("api config inline credential material", content.apiConfig, [
  "material: z.string",
  "accessToken",
  "clientSecret",
  "apiKey",
]);

mustContainAll("api config tests", content.apiConfigSpec, [
  "parses provider credential presence records without returning secret material",
  "rejects provider credential records that inline secret material",
  "rejects duplicate provider credential refs without leaking material",
  "actual_provider_token_must_not_leak",
]);

mustContainAll("adapter module", content.adapterModule, [
  "ProviderCredentialStoreService",
  "ProviderCredentialResolverService",
  "providers:",
  "exports:",
]);

mustContainAll("credential store", content.credentialStore, [
  "ProviderCredentialStoreService",
  "ProviderCredentialStoreResolution",
  'status: "not_implemented"',
  'status: "configured"',
  'status: "missing"',
  'status: "invalid"',
  "credentialRefConfigured",
  "credentialMaterialLoaded: false",
]);
mustNotContainAny("credential store forbidden behavior", content.credentialStore, [
  "credentialMaterialLoaded: true",
  "fetch(",
  "axios",
  "http.request",
  "https.request",
  "providerDataReturned: true",
]);

mustContainAll("credential store tests", content.credentialStoreSpec, [
  "reports not implemented when the credential inventory is absent",
  "detects configured credential refs without loading secret material",
  "fails closed for invalid or secret-inlining credential inventories",
  "credentialRefConfigured",
  "actual_provider_token_must_not_leak",
]);

mustContainAll("credential resolver", content.credentialResolver, [
  "ProviderCredentialResolverService",
  "ProviderCredentialStoreService",
  "credentialRefConfigured",
  "credentialMaterialLoaded: false",
  "secretValueReturned: false",
]);
mustNotContainAny("credential resolver forbidden behavior", content.credentialResolver, [
  "credentialMaterialLoaded: true",
  "process.env",
  "fetch(",
  "axios",
  "http.request",
  "https.request",
  "providerDataReturned: true",
]);

mustContainAll("credential resolver tests", content.credentialResolverSpec, [
  "credentialRefConfigured",
  "credentialMaterialLoaded",
  "secretValueReturned",
  "actual_provider_token_must_not_leak",
]);

mustContainAll("ops service credential store audit", content.opsService, [
  "credentialRefConfigured",
  "credentialMaterialLoaded: false",
  "secretValueReturned: false",
  "providerDataReturned: false",
]);
mustNotContainAny("ops service forbidden provider output", content.opsService, [
  "credentialMaterialLoaded: true",
  "providerDataReturned: true",
]);

mustContainAll("ops service credential store tests", content.opsServiceSpec, [
  "audits configured credential refs without leaking tokens or full refs",
  "credentialRefConfigured: true",
  "credentialMaterialLoaded: false",
  "actual_provider_token_must_not_leak",
]);

mustContainAll("provider docs", content.providerDocs, [
  "PR41 Provider Credential Store Boundary",
  "PROVIDER_CREDENTIALS",
  "credentialRefConfigured",
  "credentialMaterialLoaded=false",
  "npm run verify:provider-credential-store",
]);

mustContainAll("production readiness docs", content.productionReadiness, [
  "PR41 Provider Credential Store Boundary",
  "PROVIDER_CREDENTIALS",
  "credentialRefConfigured",
  "credentialMaterialLoaded=false",
  "npm run verify:provider-credential-store",
]);

mustContainAll("public api docs", content.publicApiSurface, [
  "Provider credential store boundary",
  "PROVIDER_CREDENTIALS",
  "credentialRefConfigured",
  "credentialMaterialLoaded=false",
]);

mustContainAll("launch runbook docs", content.launchRunbook, [
  "npm run verify:provider-credential-store",
  "provider credential store",
  "credentialRefConfigured",
]);

mustContainAll("task plan", content.taskPlan, [
  "PR41 - Provider Credential Store Boundary",
  "verify:provider-credential-store",
]);

if (failures.length > 0) {
  console.error("Provider credential store verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider credential store verification passed.");

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
