import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  adapterModule: "apps/api/src/adapters/adapters.module.ts",
  adapterRegistry: "apps/api/src/adapters/provider-adapter-registry.service.ts",
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
  "verify:provider-credential-boundary",
  "scripts/verify-provider-credential-boundary.mjs",
]);

mustContainAll("adapter module", content.adapterModule, [
  "ProviderCredentialResolverService",
  "providers:",
  "exports:",
]);

mustContainAll("adapter registry", content.adapterRegistry, [
  "readonlyConfigs",
  "ProviderReadonlyAdapterConfig",
  "getReadonlyCredentialRef",
  "credentialRef",
]);

mustContainAll("credential resolver", content.credentialResolver, [
  "ProviderCredentialResolverService",
  "ProviderCredentialResolutionRequest",
  "ProviderCredentialResolution",
  'status: "not_implemented"',
  "credentialRefFingerprint",
  "credentialMaterialLoaded: false",
  "secretValueReturned: false",
  "fingerprintCredentialRef",
]);
mustNotContainAny("credential resolver forbidden behavior", content.credentialResolver, [
  "process.env",
  "fetch(",
  "axios",
  "http.request",
  "https.request",
  "providerDataReturned: true",
]);

mustContainAll("credential resolver tests", content.credentialResolverSpec, [
  "returns only sanitized credential resolution metadata",
  "credential_ref_must_not_leak",
  "actual_provider_token",
  "secretValueReturned",
  "credentialMaterialLoaded",
]);

mustContainAll("ops service credential boundary", content.opsService, [
  "ProviderCredentialResolverService",
  "resolveProviderReadCredential",
  "getReadonlyCredentialRef",
  "toProviderReadCredentialAuditMetadata",
  "credentialResolutionStatus",
  "credentialRefFingerprint",
  "secretValueReturned: false",
  "credentialMaterialLoaded: false",
]);
mustNotContainAny("ops service forbidden credential output", content.opsService, [
  "providerDataReturned: true",
]);

mustContainAll("ops service credential tests", content.opsServiceSpec, [
  "passes readonly credential references through a no-secret resolver without leaking them",
  "keeps readonly credential refs scoped to exact tenant and channel",
  "does not resolve credentials for blocked provider reads",
  "does not resolve credentials before case tenant ownership is verified",
  "does not resolve credentials again for idempotency replays or conflicts",
  "does not resolve credentials before a raced idempotency create is confirmed",
  "RecordingCredentialResolver",
  "credential_ref_must_not_leak",
  "actual_provider_token",
  "credential_ref_fingerprint_123",
]);

mustContainAll("provider docs", content.providerDocs, [
  "PR40 Provider Credential Resolution Boundary",
  "ProviderCredentialResolverService",
  "credentialRefFingerprint",
  "credentialMaterialLoaded=false",
  "secretValueReturned=false",
  "npm run verify:provider-credential-boundary",
]);

mustContainAll("production readiness docs", content.productionReadiness, [
  "PR40 Provider Credential Resolution Boundary",
  "credentialRefFingerprint",
  "credentialMaterialLoaded=false",
  "secretValueReturned=false",
  "npm run verify:provider-credential-boundary",
]);

mustContainAll("public API surface docs", content.publicApiSurface, [
  "Provider credential resolution boundary",
  "credentialRefFingerprint",
  "credentialMaterialLoaded=false",
  "secretValueReturned=false",
]);

mustContainAll("launch runbook docs", content.launchRunbook, [
  "npm run verify:provider-credential-boundary",
  "provider credential resolution",
]);

mustContainAll("task plan", content.taskPlan, [
  "PR40 - Provider Credential Resolution Boundary",
  "verify:provider-credential-boundary",
]);

if (failures.length > 0) {
  console.error("Provider credential boundary verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider credential boundary verification passed.");

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
