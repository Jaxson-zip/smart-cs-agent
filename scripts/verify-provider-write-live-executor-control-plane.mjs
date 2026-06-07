import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.SMARTCS_PROVIDER_WRITE_LIVE_EXECUTOR_CONTROL_PLANE_REPO_ROOT
  ? resolve(process.env.SMARTCS_PROVIDER_WRITE_LIVE_EXECUTOR_CONTROL_PLANE_REPO_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  sharedContracts: "packages/shared/src/ops-contracts.ts",
  apiConfig: "apps/api/src/config/api-config.ts",
  apiConfigService: "apps/api/src/config/api-config.service.ts",
  apiConfigSpec: "apps/api/src/config/api-config.spec.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  opsController: "apps/api/src/ops/ops.controller.ts",
  opsControllerSpec: "apps/api/src/ops/ops.controller.spec.ts",
  bffRoute:
    "apps/web/src/app/api/operator/provider-writes/live-executor/status/route.ts",
  bffSpec: "apps/web/src/app/api/operator/operator-bff.spec.ts",
  providerWriteDocs: "docs/deploy/provider-write-requests.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  publicApiSurface: "docs/deploy/public-api-surface.md",
  staticCiWorkflow: ".github/workflows/production-static-gates.yml",
  staticCiVerifier: "scripts/verify-production-static-ci.mjs",
  productionLaunchVerifier: "scripts/verify-production-launch.mjs",
  taskPlan: "task_plan.md",
  progress: "progress.md",
};

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

const configStatusSlice = sliceBetween(
  content.apiConfig,
  "export function providerWriteLiveExecutorStatus",
  "export function providerWritePayloadEscrowMode",
);

const controlPlaneExecutionSlice = [
  sliceBetween(
    content.opsService,
    "const DISABLED_PROVIDER_WRITE_LIVE_EXECUTOR_STATUS",
    "@Injectable()",
  ),
  sliceBetween(
    content.opsService,
    "getProviderWriteLiveExecutorStatus()",
    "async listProviderReadRuns",
  ),
  content.apiConfigService,
  content.bffRoute,
].join("\n");

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-write-live-executor-control-plane",
  "scripts/verify-provider-write-live-executor-control-plane.mjs",
]);

mustContainAll("shared live executor control-plane contract", content.sharedContracts, [
  "ProviderWriteLiveExecutorMissingGateSchema",
  "ProviderWriteLiveExecutorStatusSchema",
  "dry_run_rehearsal_evidence",
  "provider_write_approval_evidence",
  "execution_kill_switch",
  "payload_escrow_sealed_metadata",
  "provider_write_review_allowlist",
  "provider_credentials_ref",
  "networkExecution: z.literal(\"not_started\")",
  "providerMutationExecuted: z.literal(false)",
  "customerVisibleMessageSent: z.literal(false)",
  "payloadEscrowOpened: z.literal(false)",
]);

mustContainAll("api config live executor control-plane status", content.apiConfig, [
  "providerWriteLiveExecutorStatus",
  "providerWriteLiveExecutorStatusSnapshot",
  "ProviderWriteLiveExecutorStatusSchema.parse",
  "dryRunRehearsalEvidenceConfigured",
  "providerWriteApprovalEvidenceConfigured",
  "reviewAdapterCount",
  "credentialRefCount",
  "missingStartupGates",
  "networkExecution: \"not_started\"",
  "providerMutationExecuted: false",
  "customerVisibleMessageSent: false",
  "payloadEscrowOpened: false",
]);
mustContainAll("api config service live executor startup snapshot", content.apiConfigService, [
  "ApiConfigService",
  "loadApiConfig",
  "getProviderWriteLiveExecutorStatus",
  "this.config.providerWriteLiveExecutorStatus",
]);
mustNotContainAny("api config status no raw outputs", configStatusSlice, [
  "evidenceHash:",
  "credentialRef:",
  "providerPayload:",
  "providerResponse:",
]);

mustContainAll("api config tests live executor control-plane status", content.apiConfigSpec, [
  "reports provider write live executor control-plane status without leaking evidence or credential refs",
  "startupMode",
  "guarded_ready",
  "secret://",
]);

mustContainAll("ops service live executor control-plane status", content.opsService, [
  "ApiConfigService",
  "getProviderWriteLiveExecutorStatus",
  "this.apiConfig?.getProviderWriteLiveExecutorStatus()",
  "DISABLED_PROVIDER_WRITE_LIVE_EXECUTOR_STATUS",
]);
mustNotContainAny("ops service status no raw config reads", controlPlaneExecutionSlice, [
  "providerWriteLiveExecutorStatus(",
  "loadProviderCredentialRefs",
  "PROVIDER_CREDENTIALS",
  "PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256",
  "PROVIDER_WRITE_APPROVAL_SHA256",
]);
mustContainAll("ops service tests live executor control-plane status", content.opsServiceSpec, [
  "ProviderWriteLiveExecutorStatusSchema",
  "reports live executor control-plane status without provider writes or secret material",
  "reports live executor control-plane status from the startup snapshot instead of the current env",
  "adapter.writeCallCount, 0",
]);

mustContainAll("api controller live executor control-plane route", content.opsController, [
  "provider-writes/live-executor/status",
  "getProviderWriteLiveExecutorStatus",
  "requireProviderWriteAdminAccess(context)",
]);
mustContainAll("api controller tests live executor control-plane route", content.opsControllerSpec, [
  "lets admin operators read provider write live executor status",
  "rejects non-admin provider write live executor status visibility",
  "rejects insecure header fallback for provider write live executor status visibility",
]);

mustContainAll("web bff live executor control-plane route", content.bffRoute, [
  "ProviderWriteLiveExecutorStatusSchema",
  "readOperatorSession",
  "Provider write operations require admin permission",
  "/v2/provider-writes/live-executor/status",
  "Provider write live executor status response is invalid",
]);
mustContainAll("web bff live executor unsafe field guard", content.bffRoute, [
  "credentialref",
  "evidencehash",
  "hash",
  "operatorapikey",
  "providerpayload",
  "providerresponse",
  "secret",
  "token",
]);
mustContainAll("web bff tests live executor control-plane route", content.bffSpec, [
  "lets admin sessions read provider write live executor status through the BFF",
  "rejects unsafe provider write live executor status and blocks non-admin sessions",
  "Provider write live executor status response is invalid",
]);

mustNotContainAny("control-plane execution boundary no live provider writes", controlPlaneExecutionSlice, [
  ".changeAddress(",
  ".issueCoupon(",
  ".sendMessage(",
  "providerMutationExecuted: true",
  "customerVisibleMessageSent: true",
  "payloadEscrowOpened: true",
  "credentialResolver",
  "decrypt",
  "secret://",
  "vault://",
]);
mustContainAll("control-plane execution boundary remains no network", controlPlaneExecutionSlice, [
  "networkExecution: \"not_started\"",
  "providerMutationExecuted: false",
  "customerVisibleMessageSent: false",
  "payloadEscrowOpened: false",
]);

mustContainAll("provider write docs live executor control-plane", content.providerWriteDocs, [
  "PR65 Provider Write Live Executor Control Plane",
  "GET /v2/provider-writes/live-executor/status",
  "GET /api/operator/provider-writes/live-executor/status",
  "npm run verify:provider-write-live-executor-control-plane",
  "does not expose evidence hashes",
]);
mustContainAll("production readiness live executor control-plane", content.productionReadiness, [
  "PR65 Provider Write Live Executor Control Plane",
  "npm run verify:provider-write-live-executor-control-plane",
  "ProviderWriteLiveExecutorStatusSchema",
]);
mustContainAll("launch runbook live executor control-plane", content.launchRunbook, [
  "Provider write live executor control plane",
  "npm run verify:provider-write-live-executor-control-plane",
  "GET /api/operator/provider-writes/live-executor/status",
]);
mustContainAll("public API surface live executor control-plane", content.publicApiSurface, [
  "GET /v2/provider-writes/live-executor/status",
  "GET /api/operator/provider-writes/live-executor/status",
  "ProviderWriteLiveExecutorStatusSchema",
]);

mustContainAll("static CI wiring", content.staticCiWorkflow, [
  "node --test scripts/verify-provider-write-live-executor-control-plane.test.mjs",
  "npm run verify:provider-write-live-executor-control-plane",
]);
mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
  "node --test scripts/verify-provider-write-live-executor-control-plane.test.mjs",
  "npm run verify:provider-write-live-executor-control-plane",
]);
mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
  "verify:provider-write-live-executor-control-plane",
  "Provider write live executor control plane",
  "GET /v2/provider-writes/live-executor/status",
]);
mustContainAll("task plan live executor control-plane", content.taskPlan, [
  "PR65 - Provider Write Live Executor Control Plane",
  "verify:provider-write-live-executor-control-plane",
]);
mustContainAll("progress live executor control-plane", content.progress, [
  "Started PR65 provider write live executor control plane",
]);

if (failures.length > 0) {
  console.error("Provider write live executor control-plane verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider write live executor control-plane verification passed.");

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

function sliceBetween(haystack, startNeedle, endNeedle) {
  const start = haystack.indexOf(startNeedle);
  if (start === -1) {
    failures.push(`slice: missing start ${startNeedle}`);
    return "";
  }
  const end = haystack.indexOf(endNeedle, start);
  if (end === -1) {
    failures.push(`slice: missing end ${endNeedle}`);
    return haystack.slice(start);
  }
  return haystack.slice(start, end);
}
