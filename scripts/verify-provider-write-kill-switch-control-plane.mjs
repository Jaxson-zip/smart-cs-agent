import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot =
  process.env.SMARTCS_PROVIDER_WRITE_KILL_SWITCH_CONTROL_PLANE_REPO_ROOT
    ? resolve(process.env.SMARTCS_PROVIDER_WRITE_KILL_SWITCH_CONTROL_PLANE_REPO_ROOT)
    : fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  packageJson: "package.json",
  sharedContracts: "packages/shared/src/ops-contracts.ts",
  prismaSchema: "prisma/schema.prisma",
  migration:
    "prisma/migrations/20260608033000_pr66_provider_write_kill_switch_control_plane/migration.sql",
  opsService: "apps/api/src/ops/ops.service.ts",
  opsServiceSpec: "apps/api/src/ops/ops.service.spec.ts",
  opsController: "apps/api/src/ops/ops.controller.ts",
  opsControllerSpec: "apps/api/src/ops/ops.controller.spec.ts",
  bffRoute:
    "apps/web/src/app/api/operator/provider-writes/kill-switch/status/route.ts",
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

const killSwitchServiceSlice = [
  sliceBetween(
    content.opsService,
    "async getProviderWriteKillSwitchStatus",
    "async listProviderReadRuns",
  ),
  sliceBetween(
    content.opsService,
    "private async findLatestProviderWriteKillSwitchEvent",
    "private async reviewProviderWriteRequest",
  ),
  sliceBetween(
    content.opsService,
    "private async auditProviderWriteKillSwitch",
    "handleCompensationDeclined",
  ),
  sliceBetween(
    content.opsService,
    "function providerWriteKillSwitchStatusFromEvent",
    "function providerReadResponseFromRun",
  ),
].join("\n");

const executionDecisionSlice = [
  sliceBetween(
    content.opsService,
    "async executeProviderWriteAttempt",
    "private async findProviderReadRun",
  ),
  sliceBetween(
    content.opsService,
    "function providerWriteExecutionDecision",
    "function providerWriteKillSwitchStatusFromEvent",
  ),
].join("\n");

mustContainAll("package scripts", content.packageJson, [
  "verify:provider-write-kill-switch-control-plane",
  "scripts/verify-provider-write-kill-switch-control-plane.mjs",
]);

mustContainAll("shared kill-switch contracts", content.sharedContracts, [
  "ProviderWriteKillSwitchActionSchema",
  "ProviderWriteKillSwitchReasonCodeSchema",
  "ProviderWriteKillSwitchUpdateRequestSchema",
  "ProviderWriteKillSwitchStatusSchema",
  "ProviderWriteKillSwitchActionSchema = z.enum([",
  "incident_response",
  "provider_anomaly",
  "operator_error",
  "launch_rehearsal",
  "post_incident_restore",
  "z.enum([\"env\", \"emergency_stop\", \"env_and_emergency_stop\", \"none\"])",
  "networkExecution: z.literal(\"not_started\")",
  "providerMutationExecuted: z.literal(false)",
  "customerVisibleMessageSent: z.literal(false)",
]);

mustContainAll("prisma kill-switch model", content.prismaSchema, [
  "model ProviderWriteKillSwitchEvent",
  "tenantId",
  "operatorId",
  "action",
  "reasonCode",
  "idempotencyKeyHash",
  "stateFingerprint",
  "envKillSwitchEnabled",
  "emergencyStopEngaged",
  "effectiveKillSwitchEnabled",
  "networkExecution",
  "providerMutationExecuted",
  "customerVisibleMessageSent",
  "@@unique([tenantId, idempotencyKeyHash])",
  "@@index([tenantId, createdAt])",
]);

mustContainAll("migration kill-switch constraints", content.migration, [
  "CREATE TABLE \"ProviderWriteKillSwitchEvent\"",
  "\"idempotencyKeyHash\" TEXT NOT NULL",
  "\"stateFingerprint\" TEXT NOT NULL",
  "\"networkExecution\" TEXT NOT NULL DEFAULT 'not_started'",
  "\"providerMutationExecuted\" BOOLEAN NOT NULL DEFAULT false",
  "\"customerVisibleMessageSent\" BOOLEAN NOT NULL DEFAULT false",
  "CHECK (\"action\" IN ('engage', 'release'))",
  "CHECK (\"reasonCode\" IN ('incident_response', 'provider_anomaly', 'operator_error', 'launch_rehearsal', 'post_incident_restore'))",
  "CHECK (\"networkExecution\" = 'not_started' AND \"providerMutationExecuted\" = false AND \"customerVisibleMessageSent\" = false)",
  "CREATE UNIQUE INDEX \"ProviderWriteKillSwitchEvent_tenantId_idempotencyKeyHash_key\"",
]);
mustNotContainAny("migration no raw provider/customer fields", content.migration, [
  "\"idempotencyKey\"",
  "\"providerPayload\"",
  "\"providerResponse\"",
  "\"rawPayload\"",
  "\"customerMessage\"",
  "\"orderId\"",
  "\"logisticsId\"",
  "\"address\"",
  "\"credentialRef\"",
  "\"credentialMaterial\"",
  "\"operatorApiKey\"",
  "\"accessToken\"",
  "\"refreshToken\"",
  "\"token\"",
  "\"secret\"",
]);

mustContainAll("ops service kill-switch status and persistence", killSwitchServiceSlice, [
  "getProviderWriteKillSwitchStatus",
  "updateProviderWriteKillSwitch",
  "findLatestProviderWriteKillSwitchEvent",
  "findProviderWriteKillSwitchEventByIdempotencyKey",
  "providerWriteEmergencyStopEngaged",
  "providerWriteKillSwitchStatusFromEvent",
  "ProviderWriteKillSwitchStatusSchema.parse",
  "provider_write_kill_switch_idempotency_key",
  "provider_write_kill_switch_state",
  "idempotencyKeyHash",
  "stateFingerprint",
  "provider_write_kill_switch.${input.action}",
  "idempotencyKeyFingerprint",
  "networkExecution: \"not_started\"",
  "providerMutationExecuted: false",
  "customerVisibleMessageSent: false",
]);

mustContainAll("ops service execution emergency stop block", executionDecisionSlice, [
  "providerWriteEmergencyStopEngaged",
  "const emergencyStopEngaged = await this.providerWriteEmergencyStopEngaged",
  "providerWriteExecutionDecision(",
  "emergencyStopEngaged",
  "policyReason: \"emergency_stop_engaged\"",
  "Provider write execution attempt blocked by the provider write emergency stop.",
]);

mustNotContainAny("kill-switch control plane no provider writes or secret access", killSwitchServiceSlice, [
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
  "credentialMaterialLoaded: true",
]);
mustNotContainAny("execution emergency stop block no provider writes or secret access", executionDecisionSlice, [
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
  "credentialMaterialLoaded: true",
]);

mustContainAll("ops service kill-switch tests", content.opsServiceSpec, [
  "ProviderWriteKillSwitchStatusSchema",
  "ProviderWriteKillSwitchUpdateRequestSchema",
  "reports provider write kill switch status without provider writes or secret material",
  "records provider write emergency stop events idempotently with sanitized audit details",
  "blocks provider write execution attempts while the persisted emergency stop is engaged",
  "emergency_stop_engaged",
]);

mustContainAll("api controller kill-switch routes", content.opsController, [
  "ProviderWriteKillSwitchUpdateRequestSchema",
  "provider-writes/kill-switch/status",
  "getProviderWriteKillSwitchStatus",
  "updateProviderWriteKillSwitch",
  "requireProviderWriteAdminAccess(context)",
  "requireRequestContext(headers)",
]);
mustContainAll("api controller kill-switch tests", content.opsControllerSpec, [
  "lets admin operators read provider write kill switch status",
  "lets admin operators update provider write kill switch status with request context",
  "rejects non-admin provider write kill switch visibility and updates",
  "rejects insecure header fallback for provider write kill switch operations",
]);

mustContainAll("web bff kill-switch route", content.bffRoute, [
  "ProviderWriteKillSwitchStatusSchema",
  "ProviderWriteKillSwitchUpdateRequestSchema",
  "readOperatorSession",
  "Provider write operations require admin permission",
  "/v2/provider-writes/kill-switch/status",
  "Provider write kill switch payload is invalid",
  "Provider write kill switch status response is invalid",
]);
mustContainAll("web bff kill-switch unsafe field guard", content.bffRoute, [
  "accesstoken",
  "credentialmaterial",
  "credentialref",
  "customermessage",
  "idempotencykey",
  "operatorapikey",
  "providerpayload",
  "providerresponse",
  "rawpayload",
  "refreshtoken",
  "secret",
  "token",
]);
mustContainAll("web bff kill-switch tests", content.bffSpec, [
  "lets admin sessions read and update provider write kill switch status through the BFF",
  "rejects unsafe provider write kill switch status and blocks non-admin sessions",
  "rejects malformed provider write kill switch update payloads in the BFF",
  "Provider write kill switch status response is invalid",
]);

mustContainAll("provider write docs kill-switch control plane", content.providerWriteDocs, [
  "PR66 Provider Write Kill Switch Control Plane",
  "GET /v2/provider-writes/kill-switch/status",
  "POST /v2/provider-writes/kill-switch/status",
  "GET /api/operator/provider-writes/kill-switch/status",
  "POST /api/operator/provider-writes/kill-switch/status",
  "npm run verify:provider-write-kill-switch-control-plane",
  "emergency_stop_engaged",
]);
mustContainAll("production readiness kill-switch control plane", content.productionReadiness, [
  "PR66 Provider Write Kill Switch Control Plane",
  "npm run verify:provider-write-kill-switch-control-plane",
  "ProviderWriteKillSwitchStatusSchema",
]);
mustContainAll("launch runbook kill-switch control plane", content.launchRunbook, [
  "Provider write kill switch control plane",
  "GET /v2/provider-writes/kill-switch/status",
  "POST /api/operator/provider-writes/kill-switch/status",
  "npm run verify:provider-write-kill-switch-control-plane",
  "emergency_stop_engaged",
]);
mustContainAll("public API surface kill-switch control plane", content.publicApiSurface, [
  "GET /v2/provider-writes/kill-switch/status",
  "POST /v2/provider-writes/kill-switch/status",
  "GET /api/operator/provider-writes/kill-switch/status",
  "POST /api/operator/provider-writes/kill-switch/status",
  "ProviderWriteKillSwitchStatusSchema",
  "emergency_stop_engaged",
]);

mustContainAll("static CI wiring", content.staticCiWorkflow, [
  "node --test scripts/verify-provider-write-kill-switch-control-plane.test.mjs",
  "npm run verify:provider-write-kill-switch-control-plane",
]);
mustContainAll("static CI verifier wiring", content.staticCiVerifier, [
  "node --test scripts/verify-provider-write-kill-switch-control-plane.test.mjs",
  "npm run verify:provider-write-kill-switch-control-plane",
]);
mustContainAll("production launch verifier wiring", content.productionLaunchVerifier, [
  "verify:provider-write-kill-switch-control-plane",
  "Provider write kill switch control plane",
  "GET /v2/provider-writes/kill-switch/status",
]);
mustContainAll("task plan kill-switch control plane", content.taskPlan, [
  "PR66 - Provider Write Kill Switch Control Plane",
  "verify:provider-write-kill-switch-control-plane",
]);
mustContainAll("progress kill-switch control plane", content.progress, [
  "Started PR66 provider write kill switch control plane",
]);

if (failures.length > 0) {
  console.error("Provider write kill switch control-plane verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Provider write kill switch control-plane verification passed.");

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
