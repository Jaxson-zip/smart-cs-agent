import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.SMARTCS_PROVIDER_WRITE_LIVE_EXECUTOR_GUARD_REPO_ROOT
  ? resolve(process.env.SMARTCS_PROVIDER_WRITE_LIVE_EXECUTOR_GUARD_REPO_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  envExample: ".env.example",
  apiConfig: "apps/api/src/config/api-config.ts",
  apiConfigSpec: "apps/api/src/config/api-config.spec.ts",
  opsService: "apps/api/src/ops/ops.service.ts",
  providerWriteDocs: "docs/deploy/provider-write-requests.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  launchRunbook: "docs/deploy/production-launch-runbook.md",
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

const executionBoundarySlice = [
  sliceBetween(
    content.opsService,
    "async executeProviderWriteAttempt",
    "private async findProviderReadRun",
  ),
  sliceBetween(
    content.opsService,
    "private async persistProviderWriteExecutionAttempt",
    "private async providerReadCaseBelongsToTenant",
  ),
  sliceBetween(
    content.opsService,
    "function providerWriteExecutionDecision",
    "function providerWriteExecutionAttemptResponse",
  ),
].join("\n");

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-write-live-executor-startup-guard",
  "scripts/verify-provider-write-live-executor-startup-guard.mjs",
]);

mustContainAll("env example live executor guard", content.envExample, [
  "PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED=false",
  'PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256=""',
  'PROVIDER_WRITE_APPROVAL_SHA256=""',
]);

mustContainAll("api config live executor guard", content.apiConfig, [
  "PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED",
  "PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256",
  "PROVIDER_WRITE_APPROVAL_SHA256",
  "providerWriteLiveExecutorEnabled",
  "providerWriteDryRunRehearsalSha256",
  "providerWriteApprovalSha256",
  "productionProviderWriteLiveExecutorIssues",
  "PROVIDER_WRITE_EXECUTION_KILL_SWITCH",
  "PROVIDER_WRITE_PAYLOAD_ESCROW_MODE",
  "sealed_metadata",
  "PROVIDER_WRITE_REVIEW_ADAPTERS",
  "PROVIDER_CREDENTIALS",
  "must start with the kill switch enabled",
  "non-placeholder lowercase sha256 hash",
]);
mustNotContainAny("api config live executor no secret values", content.apiConfig, [
  "accessToken",
  "refreshToken",
  "clientSecret",
  "providerToken",
]);

mustContainAll("api config tests live executor guard", content.apiConfigSpec, [
  "keeps provider write live executor disabled unless explicitly configured",
  "rejects unsafe provider write live executor evidence hashes",
  "fails closed when production live provider writes are enabled without every startup guard",
  "accepts production live provider write startup only with all guard evidence and kill switch enabled",
  "providerWriteLiveExecutorProductionEnv",
]);

mustNotContainAny("execution boundary no live provider writes", executionBoundarySlice, [
  ".changeAddress(",
  ".issueCoupon(",
  ".sendMessage(",
  "providerMutationExecuted: true",
  "customerVisibleMessageSent: true",
  "payloadEscrowOpened: true",
  "credentialResolver",
  "loadProviderCredentialRefs",
  "decrypt",
  "secret://",
  "vault://",
]);
mustContainAll("execution boundary remains no network", executionBoundarySlice, [
  "networkExecution: \"not_started\"",
  "providerMutationExecuted: false",
  "customerVisibleMessageSent: false",
  "payloadEscrowOpened: false",
]);

mustContainAll("provider write docs live executor guard", content.providerWriteDocs, [
  "PR64 Provider Write Live Executor Startup Guard",
  "PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED",
  "PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256",
  "PROVIDER_WRITE_APPROVAL_SHA256",
  "npm run verify:provider-write-live-executor-startup-guard",
  "does not call provider APIs",
  "does not execute provider writes",
]);

mustContainAll("production readiness live executor guard", content.productionReadiness, [
  "PR64 Provider Write Live Executor Startup Guard",
  "npm run verify:provider-write-live-executor-startup-guard",
  "PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED",
]);

mustContainAll("launch runbook live executor guard", content.launchRunbook, [
  "Provider write live executor startup guard",
  "npm run verify:provider-write-live-executor-startup-guard",
  "PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED",
  "PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256",
  "PROVIDER_WRITE_APPROVAL_SHA256",
]);

mustContainAll("static CI wiring", content.staticCiWorkflow, [
  "node --test scripts/verify-provider-write-live-executor-startup-guard.test.mjs",
  "npm run verify:provider-write-live-executor-startup-guard",
]);
mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
  "node --test scripts/verify-provider-write-live-executor-startup-guard.test.mjs",
  "npm run verify:provider-write-live-executor-startup-guard",
]);
mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
  "verify:provider-write-live-executor-startup-guard",
  "Provider write live executor startup guard",
  "PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED",
]);
mustContainAll("task plan live executor guard", content.taskPlan, [
  "PR64 - Provider Write Live Executor Startup Guard",
  "verify:provider-write-live-executor-startup-guard",
]);
mustContainAll("progress live executor guard", content.progress, [
  "Started PR64 provider write live executor startup guard",
]);

if (failures.length > 0) {
  console.error("Provider write live executor startup guard verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider write live executor startup guard verification passed.");

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
