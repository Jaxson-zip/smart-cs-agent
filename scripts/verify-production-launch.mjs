import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  launchRunbook: "docs/deploy/production-launch-runbook.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  channelRunbook: "docs/deploy/channel-queue-runbook.md",
  productionAlerting: "docs/deploy/production-alerting.md",
  productionStaticCi: "docs/deploy/production-static-ci.md",
  productionBranchProtection:
    "docs/deploy/production-branch-protection.md",
  productionProviderWriteApproval:
    "docs/deploy/production-provider-write-approval.md",
  providerWriteDryRunRehearsal:
    "docs/deploy/provider-write-dry-run-rehearsal.md",
  providerWriteKillSwitchRehearsal:
    "docs/deploy/provider-write-kill-switch-rehearsal.md",
  providerWriteLivePilotPreflight:
    "docs/deploy/provider-write-live-pilot-preflight.md",
  providerWriteLivePilotRunLedger:
    "docs/deploy/provider-write-live-pilot-run-ledger.md",
  providerWriteManualCloseoutReview:
    "docs/deploy/provider-write-manual-closeout-review.md",
  providerWriteSafeLedgerAssembly:
    "docs/deploy/provider-write-safe-ledger-assembly.md",
  providerWriteControlledExpansionApproval:
    "docs/deploy/provider-write-controlled-expansion-approval.md",
  providerWriteRequests:
    "docs/deploy/provider-write-requests.md",
  publicApiSurface:
    "docs/deploy/public-api-surface.md",
  productionStaticCiWorkflow:
    ".github/workflows/production-static-gates.yml",
  productionDeploymentArtifacts:
    "docs/deploy/production-deployment-artifacts.md",
  productionImageBuilds: "docs/deploy/production-image-builds.md",
  productionImageBuildWorkflow:
    "docs/deploy/production-image-build.yml.example",
  productionContainerSmoke: "docs/deploy/production-container-smoke.md",
  productionContainerSmokeWorkflow:
    "docs/deploy/production-container-smoke.yml.example",
  productionImageSecurity: "docs/deploy/production-image-security.md",
  productionImageSecurityWorkflow:
    "docs/deploy/production-image-security.yml.example",
  productionReleaseProvenance:
    "docs/deploy/production-release-provenance.md",
  productionReleaseProvenanceWorkflow:
    "docs/deploy/production-release-provenance.yml.example",
  productionReleaseEvidence:
    "docs/deploy/production-release-evidence.md",
  productionReleaseEvidenceWorkflow:
    "docs/deploy/production-release-evidence.yml.example",
  productionChangeApproval:
    "docs/deploy/production-change-approval.md",
  productionChangeApprovalWorkflow:
    "docs/deploy/production-change-approval.yml.example",
  productionLaunchBinding:
    "docs/deploy/production-launch-binding.md",
  productionLaunchBindingWorkflow:
    "docs/deploy/production-launch-binding.yml.example",
  productionAlertingVerifier: "scripts/verify-production-alerting.mjs",
  productionStaticCiVerifier: "scripts/verify-production-static-ci.mjs",
  productionBranchProtectionVerifier:
    "scripts/verify-production-branch-protection.mjs",
  productionProviderWriteApprovalVerifier:
    "scripts/verify-production-provider-write-approval.mjs",
  providerWriteDryRunRehearsalVerifier:
    "scripts/verify-provider-write-dry-run-rehearsal.mjs",
  providerWriteKillSwitchRehearsalVerifier:
    "scripts/verify-provider-write-kill-switch-rehearsal.mjs",
  providerWriteLivePilotPreflightVerifier:
    "scripts/verify-provider-write-live-pilot-preflight.mjs",
  providerWriteLivePilotRunLedgerVerifier:
    "scripts/verify-provider-write-live-pilot-run-ledger.mjs",
  providerWriteLivePilotRunLedgerDraftExportVerifier:
    "scripts/verify-provider-write-live-pilot-run-ledger-draft-export.mjs",
  providerWriteManualCloseoutReviewVerifier:
    "scripts/verify-provider-write-manual-closeout-review.mjs",
  providerWriteSafeLedgerAssemblyVerifier:
    "scripts/verify-provider-write-safe-ledger-assembly.mjs",
  providerWriteControlledExpansionApprovalVerifier:
    "scripts/verify-provider-write-controlled-expansion-approval.mjs",
  providerWriteLiveExecutorStartupGuardVerifier:
    "scripts/verify-provider-write-live-executor-startup-guard.mjs",
  providerWriteLiveExecutorControlPlaneVerifier:
    "scripts/verify-provider-write-live-executor-control-plane.mjs",
  providerWriteKillSwitchControlPlaneVerifier:
    "scripts/verify-provider-write-kill-switch-control-plane.mjs",
  providerWriteRequestsVerifier:
    "scripts/verify-provider-write-requests.mjs",
  providerWriteApprovalStateVerifier:
    "scripts/verify-provider-write-approval-state.mjs",
  providerWriteExecutionAttemptsVerifier:
    "scripts/verify-provider-write-execution-attempts.mjs",
  providerWriteExecutionAttemptVisibilityVerifier:
    "scripts/verify-provider-write-execution-attempt-visibility.mjs",
  providerWritePayloadEscrowBoundaryVerifier:
    "scripts/verify-provider-write-payload-escrow-boundary.mjs",
  productionDeployArtifactsVerifier:
    "scripts/verify-production-deploy-artifacts.mjs",
  productionImageBuildsVerifier:
    "scripts/verify-production-image-builds.mjs",
  productionContainerSmokeVerifier:
    "scripts/verify-production-container-smoke.mjs",
  productionImageSecurityVerifier:
    "scripts/verify-production-image-security.mjs",
  productionReleaseProvenanceVerifier:
    "scripts/verify-production-release-provenance.mjs",
  productionReleaseEvidenceVerifier:
    "scripts/verify-production-release-evidence.mjs",
  productionChangeApprovalVerifier:
    "scripts/verify-production-change-approval.mjs",
  productionLaunchBindingVerifier:
    "scripts/verify-production-launch-binding.mjs",
  providerAdapterVerifier: "scripts/verify-provider-adapters.mjs",
  providerReadonlyVerifier: "scripts/verify-provider-readonly.mjs",
  providerReadContractVerifier: "scripts/verify-provider-read-contract.mjs",
  providerReadAuditVerifier: "scripts/verify-provider-read-audit.mjs",
  providerReadOperationsVerifier: "scripts/verify-provider-read-operations.mjs",
  providerCredentialBoundaryVerifier:
    "scripts/verify-provider-credential-boundary.mjs",
  providerCredentialStoreVerifier:
    "scripts/verify-provider-credential-store.mjs",
  providerReadHarnessVerifier:
    "scripts/verify-provider-read-harness.mjs",
  launchEvidenceVerifier:
    "scripts/verify-launch-evidence.mjs",
  launchManifestVerifier:
    "scripts/verify-launch-manifest.mjs",
  productionCanary: "scripts/verify-production-canary.mjs",
  productionReadinessVerifier: "scripts/verify-production-readiness.mjs",
  channelRunbookVerifier: "scripts/verify-channel-queue-runbook.mjs",
  packageJson: "package.json",
  apiDockerfile: "apps/api/Dockerfile",
  webDockerfile: "apps/web/Dockerfile",
  composeProductionExample: "docker-compose.production.yml.example",
  taskPlan: "task_plan.md",
  progress: "progress.md",
};

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

mustContainAll("package scripts", content.packageJson, [
  "verify:production-launch",
  "scripts/verify-production-launch.mjs",
  "verify:production-readiness",
  "verify:production-canary",
  "verify:production-static-ci",
  "verify:production-branch-protection",
  "verify:production-branch-protection:safe",
  "verify:production-provider-write-approval",
  "verify:production-provider-write-approval:safe",
  "verify:provider-write-dry-run-rehearsal",
  "verify:provider-write-dry-run-rehearsal:safe",
  "verify:provider-write-kill-switch-rehearsal",
  "verify:provider-write-kill-switch-rehearsal:safe",
  "verify:provider-write-live-pilot-preflight",
  "verify:provider-write-live-pilot-preflight:safe",
  "verify:provider-write-live-pilot-run-ledger",
  "verify:provider-write-live-pilot-run-ledger:safe",
  "verify:provider-write-live-pilot-run-ledger-draft-export",
  "verify:provider-write-manual-closeout-review",
  "verify:provider-write-manual-closeout-review:safe",
  "verify:provider-write-safe-ledger-assembly",
  "verify:provider-write-safe-ledger-assembly:safe",
  "verify:provider-write-controlled-expansion-approval",
  "verify:provider-write-controlled-expansion-approval:safe",
  "verify:provider-write-live-executor-startup-guard",
  "verify:provider-write-live-executor-control-plane",
  "verify:provider-write-kill-switch-control-plane",
  "verify:provider-write-requests",
  "verify:provider-write-approval-state",
  "verify:provider-write-execution-attempts",
  "verify:provider-write-execution-attempt-visibility",
  "verify:provider-write-payload-escrow-boundary",
  "verify:production-deploy-artifacts",
  "verify:production-image-builds",
  "verify:production-image-builds:docker",
  "verify:production-container-smoke",
  "verify:production-container-smoke:docker",
  "verify:production-image-security",
  "verify:production-image-security:docker",
  "verify:production-release-provenance",
  "verify:production-release-provenance:safe",
  "verify:production-release-evidence",
  "verify:production-release-evidence:safe",
  "verify:production-change-approval",
  "verify:production-change-approval:safe",
  "verify:production-launch-binding",
  "verify:production-launch-binding:safe",
  "verify:production-alerting",
  "verify:provider-adapters",
  "verify:provider-readonly",
  "verify:provider-read-contract",
  "verify:provider-read-audit",
  "verify:provider-read-operations",
  "verify:provider-credential-boundary",
  "verify:provider-credential-store",
  "verify:provider-read-harness",
  "verify:merchant-launch-preflight",
  "verify:merchant-launch-preflight:safe",
  "generate:launch-evidence",
  "generate:launch-evidence:safe",
  "verify:launch-evidence-archive",
  "verify:launch-evidence-archive:safe",
  "verify:launch-manifest",
  "verify:launch-manifest:safe",
  "verify:launch-evidence",
  "verify:channel-runbook",
]);

mustContainAll("launch runbook sections", content.launchRunbook, [
  "PR34 Production Launch And Rollback Runbook",
  "Launch Decision",
  "Preflight Commands",
  "Deploy Sequence",
  "Rollback Triggers",
  "Rollback Sequence",
  "Stale Claim Recovery",
  "Post-Launch Evidence",
  "Rehearsal",
  "Verification",
]);

mustContainAll("launch runbook preflight", content.launchRunbook, [
  "npm run db:generate",
  "npm run db:migrate:deploy",
  "npm run test --workspace @smart-cs-agent/api",
  "npm run test --workspace @smart-cs-agent/web",
  "npm run typecheck --workspaces --if-present -- --pretty false",
  "npm run lint --workspaces --if-present -- --max-warnings=0",
  "npm run build --workspaces --if-present",
  "npm run verify:production-static-ci",
  "npm run verify:production-branch-protection",
  "npm run verify:production-branch-protection:safe",
  "npm run verify:production-provider-write-approval",
  "npm run verify:production-provider-write-approval:safe",
  "npm run verify:provider-write-dry-run-rehearsal",
  "npm run verify:provider-write-dry-run-rehearsal:safe",
  "npm run verify:provider-write-kill-switch-rehearsal",
  "npm run verify:provider-write-kill-switch-rehearsal:safe",
  "npm run verify:provider-write-live-pilot-preflight",
  "npm run verify:provider-write-live-pilot-preflight:safe",
  "npm run verify:provider-write-live-pilot-run-ledger",
  "npm run verify:provider-write-live-pilot-run-ledger:safe",
  "npm run verify:provider-write-live-pilot-run-ledger-draft-export",
  "npm run verify:provider-write-manual-closeout-review",
  "npm run verify:provider-write-manual-closeout-review:safe",
  "npm run verify:provider-write-safe-ledger-assembly",
  "npm run verify:provider-write-safe-ledger-assembly:safe",
  "npm run verify:provider-write-live-executor-startup-guard",
  "npm run verify:provider-write-live-executor-control-plane",
  "npm run verify:provider-write-kill-switch-control-plane",
  "npm run verify:provider-write-requests",
  "npm run verify:provider-write-execution-attempt-visibility",
  "npm run verify:provider-write-payload-escrow-boundary",
  "npm run verify:production-readiness",
  "--env-file=<secure-production-env>",
  "--require-real-channel",
  "npm run verify:production-canary",
  "npm run verify:production-deploy-artifacts",
  "npm run verify:production-image-builds",
  "npm run verify:production-container-smoke",
  "npm run verify:production-image-security",
  "npm run verify:production-release-provenance",
  "npm run verify:production-release-evidence",
  "npm run verify:production-change-approval",
  "npm run verify:production-launch-binding",
  "--max-stale-processing=0",
  "--max-oldest-pending-age-seconds=900",
  "npm run verify:production-alerting",
  "npm run verify:provider-adapters",
  "npm run verify:provider-readonly",
  "npm run verify:provider-read-contract",
  "npm run verify:provider-read-audit",
  "npm run verify:provider-read-operations",
  "npm run verify:provider-credential-boundary",
  "npm run verify:provider-credential-store",
  "npm run verify:provider-read-harness",
  "npm run verify:merchant-launch-preflight:safe",
  "npm run generate:launch-evidence:safe",
  "npm run verify:launch-evidence-archive:safe",
  "npm run verify:launch-manifest:safe",
  "SMARTCS_LAUNCH_TENANT",
  "SMARTCS_LAUNCH_CHANNEL",
  "SMARTCS_LAUNCH_EVIDENCE_OUT",
  "SMARTCS_LAUNCH_EVIDENCE_FILE",
  "SMARTCS_LAUNCH_MANIFEST_FILE",
  "SMARTCS_LAUNCH_EVIDENCE_DIR",
  "SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL=true",
  "SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY=true",
  "SMARTCS_LAUNCH_EVIDENCE_REQUIRE_PASS=true",
  "SMARTCS_LAUNCH_MANIFEST_REQUIRE_PASS=true",
  "SMARTCS_RELEASE_PROVENANCE_FILE",
  "SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS=true",
  "SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE",
  "SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS=true",
  "SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE",
  "SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS=true",
  "SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_FILE",
  "SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_FILE",
  "SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_FILE",
  "SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_FILE",
  "SMARTCS_PRODUCTION_LAUNCH_BINDING_REQUIRE_PASS=true",
  "SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE",
  "SMARTCS_PRODUCTION_BRANCH_PROTECTION_REQUIRE_PASS=true",
  "SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE",
  "SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS=true",
  "SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE",
  "SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS=true",
  "SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE",
  "SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_REQUIRE_PASS=true",
  "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE",
  "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS=true",
  "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE",
  "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_REQUIRE_PASS=true",
  "SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_FILE",
  "SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_REQUIRE_PASS=true",
  "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_DRAFT_FILE",
  "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REVIEW_FILE",
  "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_LEDGER_FILE",
  "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REQUIRE_PASS=true",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_FILE",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_FILE",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_DRAFT_FILE",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_REVIEW_FILE",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_LEDGER_FILE",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_REQUIRE_PASS=true",
  "PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED=false",
  "PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256",
  "PROVIDER_WRITE_APPROVAL_SHA256",
  "npm run verify:channel-runbook",
]);

mustContainInOrder(
  "launch runbook provider write approval ordering",
  extractPreflightCommands(content.launchRunbook),
  [
    "npm run verify:provider-write-dry-run-rehearsal:safe",
    "npm run verify:provider-write-kill-switch-rehearsal:safe",
    "npm run verify:production-provider-write-approval:safe",
    "npm run verify:provider-write-live-pilot-preflight:safe",
    "npm run verify:provider-write-live-pilot-run-ledger-draft-export",
    "npm run verify:provider-write-manual-closeout-review",
    "npm run verify:provider-write-manual-closeout-review:safe",
    "npm run verify:provider-write-live-pilot-run-ledger\n",
    "npm run verify:provider-write-live-pilot-run-ledger:safe",
    "npm run verify:provider-write-safe-ledger-assembly",
    "npm run verify:provider-write-safe-ledger-assembly:safe",
    "npm run verify:provider-write-controlled-expansion-approval",
    "npm run verify:provider-write-controlled-expansion-approval:safe",
  ],
);

mustContainAll("launch runbook deploy artifacts", content.launchRunbook, [
  "docs/deploy/production-deployment-artifacts.md",
  "npm run verify:production-deploy-artifacts",
  "Deploy the API and Web artifacts",
]);

mustContainAll("launch runbook image builds", content.launchRunbook, [
  "docs/deploy/production-image-builds.md",
  "docs/deploy/production-image-build.yml.example",
  "npm run verify:production-image-builds",
  "npm run verify:production-image-builds:docker",
]);

mustContainAll("launch runbook container smoke", content.launchRunbook, [
  "docs/deploy/production-container-smoke.md",
  "docs/deploy/production-container-smoke.yml.example",
  "npm run verify:production-container-smoke",
  "npm run verify:production-container-smoke:docker",
]);

mustContainAll("launch runbook image security", content.launchRunbook, [
  "docs/deploy/production-image-security.md",
  "docs/deploy/production-image-security.yml.example",
  "npm run verify:production-image-security",
  "npm run verify:production-image-security:docker",
]);

mustContainAll("launch runbook release provenance", content.launchRunbook, [
  "docs/deploy/production-release-provenance.md",
  "docs/deploy/production-release-provenance.yml.example",
  "npm run verify:production-release-provenance",
  "npm run verify:production-release-provenance:safe",
  "SMARTCS_RELEASE_PROVENANCE_FILE",
  "SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS=true",
]);

mustContainAll("launch runbook release evidence", content.launchRunbook, [
  "docs/deploy/production-release-evidence.md",
  "docs/deploy/production-release-evidence.yml.example",
  "npm run verify:production-release-evidence",
  "npm run verify:production-release-evidence:safe",
  "SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE",
  "SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS=true",
]);

mustContainAll("launch runbook change approval", content.launchRunbook, [
  "docs/deploy/production-change-approval.md",
  "docs/deploy/production-change-approval.yml.example",
  "npm run verify:production-change-approval",
  "npm run verify:production-change-approval:safe",
  "SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE",
  "SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS=true",
]);

mustContainAll("launch runbook rollback controls", content.launchRunbook, [
  "REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true",
  "REAL_CHANNEL_WEBHOOK_ALLOWLIST",
  "REAL_CHANNEL_WEBHOOKS_ENABLED=false",
  "disabled_by_kill_switch",
  "allowlist",
  "artifact reverted",
]);

mustContainAll("launch runbook alert triggers", content.launchRunbook, [
  "SmartCsAgentApiDown",
  "SmartCsAgentDatabaseDown",
  "SmartCsAgentRealChannelMisconfigured",
  "SmartCsAgentRealChannelKillSwitchEnabled",
  "SmartCsAgentChannelQueueDegraded",
  "SmartCsAgentStaleProcessingClaims",
  "SmartCsAgentOldestPendingTooOld",
  "staleProcessingCount",
  "oldestPendingAgeSeconds",
]);

mustContainAll("launch runbook recovery evidence", content.launchRunbook, [
  "/v1/channel-events/recover-stale",
  "/v1/channel-events/metrics",
  "/v1/channel-events/operation-audits",
  "/v1/channel-events/audit-summary",
  "staleProcessingCount=0",
  "sanitized recovery record",
  "bounded totals",
]);

mustContainAll("launch runbook customer-action boundary", content.launchRunbook, [
  "does not prove that real refunds",
  "address changes",
  "coupons",
  "logistics edits",
  "customer-visible replies",
  "must not execute real refunds",
  "Provider adapter contract",
  "real provider network calls",
  "PROVIDER_READONLY_ADAPTERS",
  "POST /v2/provider-reads/execute",
  "providerDataReturned=false",
  "networkExecution=not_implemented",
  "ProviderReadRun",
  "provider read operations",
  "ProviderCredentialResolverService",
  "secretValueReturned=false",
  "ProviderWriteRequest",
  "PROVIDER_WRITE_REVIEW_ADAPTERS",
  "idempotencyKeyHash",
  "providerMutationExecuted=false",
  "customerVisibleMessageSent=false",
  "networkExecution=not_started",
  "requiresHuman=true",
]);

mustContainAll("Provider write live executor startup guard", content.launchRunbook, [
  "Provider write live executor startup guard",
  "PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED",
  "PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256",
  "PROVIDER_WRITE_APPROVAL_SHA256",
  "npm run verify:provider-write-live-executor-startup-guard",
  "does not call provider APIs",
  "does not execute provider writes",
]);

mustContainAll("Provider write live executor control plane", content.launchRunbook, [
  "Provider write live executor control plane",
  "GET /v2/provider-writes/live-executor/status",
  "GET /api/operator/provider-writes/live-executor/status",
  "npm run verify:provider-write-live-executor-control-plane",
  "does not expose evidence hashes",
  "does not expose credential refs",
]);

mustContainAll("Provider write kill switch control plane", content.launchRunbook, [
  "Provider write kill switch control plane",
  "GET /v2/provider-writes/kill-switch/status",
  "POST /v2/provider-writes/kill-switch/status",
  "GET /api/operator/provider-writes/kill-switch/status",
  "POST /api/operator/provider-writes/kill-switch/status",
  "npm run verify:provider-write-kill-switch-control-plane",
  "emergency_stop_engaged",
]);

mustContainAll("Provider write kill switch rehearsal evidence", content.launchRunbook, [
  "Provider write kill-switch rehearsal evidence",
  "smart-cs-agent.provider-write-kill-switch-rehearsal.v1",
  "npm run verify:provider-write-kill-switch-rehearsal",
  "npm run verify:provider-write-kill-switch-rehearsal:safe",
  "providerWriteKillSwitchSha256",
  "emergency_stop_engaged",
]);

mustContainAll("launch runbook no-secret boundary", content.launchRunbook, [
  "Do not put operator API keys",
  "webhook secrets",
  "signatures",
  "raw request bodies",
  "customer messages",
  "provider payloads",
  "tenant IDs",
  "API URLs with query-string secrets",
  "Do not paste response bodies",
  "metric bodies",
  "external conversation IDs",
  "external message IDs",
]);

mustContainAll("production readiness references launch", content.productionReadiness, [
  "PR34 Production Launch And Rollback Runbook",
  "docs/deploy/production-launch-runbook.md",
  "npm run verify:production-launch",
]);

mustContainAll("production readiness references deploy artifacts", content.productionReadiness, [
  "PR47 Production Deployment Artifacts",
  "docs/deploy/production-deployment-artifacts.md",
  "docker-compose.production.yml.example",
  "npm run verify:production-deploy-artifacts",
]);

mustContainAll("production readiness references image builds", content.productionReadiness, [
  "PR48 Production Image Build Gate",
  "docs/deploy/production-image-build.yml.example",
  "npm run verify:production-image-builds",
  "npm run verify:production-image-builds:docker",
]);

mustContainAll("production readiness references container smoke", content.productionReadiness, [
  "PR49 Production Container Runtime Smoke Gate",
  "docs/deploy/production-container-smoke.yml.example",
  "npm run verify:production-container-smoke",
  "npm run verify:production-container-smoke:docker",
]);

mustContainAll("production readiness references image security", content.productionReadiness, [
  "PR50 Production Image Security Evidence Gate",
  "docs/deploy/production-image-security.yml.example",
  "npm run verify:production-image-security",
  "npm run verify:production-image-security:docker",
]);

mustContainAll("production readiness references release provenance", content.productionReadiness, [
  "PR51 Production Release Provenance And Promotion Boundary",
  "docs/deploy/production-release-provenance.yml.example",
  "npm run verify:production-release-provenance",
  "npm run verify:production-release-provenance:safe",
]);

mustContainAll("production readiness references release evidence", content.productionReadiness, [
  "PR52 Production Release Evidence Archive",
  "docs/deploy/production-release-evidence.yml.example",
  "npm run verify:production-release-evidence",
  "npm run verify:production-release-evidence:safe",
]);

mustContainAll("production readiness references change approval", content.productionReadiness, [
  "PR53 Production Change Approval Gate",
  "docs/deploy/production-change-approval.yml.example",
  "npm run verify:production-change-approval",
  "npm run verify:production-change-approval:safe",
]);

mustContainAll("production readiness references launch binding", content.productionReadiness, [
  "PR54 Production Launch Binding Gate",
  "docs/deploy/production-launch-binding.yml.example",
  "npm run verify:production-launch-binding",
  "npm run verify:production-launch-binding:safe",
]);

mustContainAll("production readiness references static CI", content.productionReadiness, [
  "PR55 Production Static CI Gate",
  ".github/workflows/production-static-gates.yml",
  "npm run verify:production-static-ci",
]);

mustContainAll("production readiness references branch protection", content.productionReadiness, [
  "PR56 Production Branch Protection Gate",
  "npm run verify:production-branch-protection",
  "npm run verify:production-branch-protection:safe",
]);

mustContainAll("production readiness references provider write approval", content.productionReadiness, [
  "PR57 Production Provider Write Approval Gate",
  "npm run verify:production-provider-write-approval",
  "npm run verify:production-provider-write-approval:safe",
]);

mustContainAll("production readiness references provider write requests", content.productionReadiness, [
  "PR58 Provider Write Request Queue",
  "ProviderWriteRequest",
  "npm run verify:provider-write-requests",
]);

mustContainAll("production readiness references provider write approval state", content.productionReadiness, [
  "PR59 Provider Write Approval State Machine",
  "npm run verify:provider-write-approval-state",
]);

mustContainAll("production readiness references provider write execution attempts", content.productionReadiness, [
  "PR60 Provider Write Execution Attempt Safety",
  "npm run verify:provider-write-execution-attempts",
]);

mustContainAll("production readiness references provider write execution attempt visibility", content.productionReadiness, [
  "PR61 Provider Write Execution Attempt Invariants And Visibility",
  "npm run verify:provider-write-execution-attempt-visibility",
]);

mustContainAll("production readiness references provider write payload escrow boundary", content.productionReadiness, [
  "PR62 Provider Write Payload Escrow Boundary",
  "npm run verify:provider-write-payload-escrow-boundary",
]);

mustContainAll("production readiness references provider write dry-run rehearsal", content.productionReadiness, [
  "PR63 Provider Write Dry-Run Rehearsal Evidence Gate",
  "npm run verify:provider-write-dry-run-rehearsal",
  "npm run verify:provider-write-dry-run-rehearsal:safe",
]);

mustContainAll("production readiness references provider write kill-switch rehearsal", content.productionReadiness, [
  "PR67 Provider Write Kill Switch Rehearsal Evidence Gate",
  "npm run verify:provider-write-kill-switch-rehearsal",
  "npm run verify:provider-write-kill-switch-rehearsal:safe",
]);

mustContainAll("production readiness references provider write live pilot preflight", content.productionReadiness, [
  "PR68 Provider Write Live Pilot Preflight Gate",
  "npm run verify:provider-write-live-pilot-preflight",
  "npm run verify:provider-write-live-pilot-preflight:safe",
]);

mustContainAll("production readiness references provider write live pilot run ledger", content.productionReadiness, [
  "PR69 Provider Write Live Pilot Run Ledger Gate",
  "npm run verify:provider-write-live-pilot-run-ledger",
  "npm run verify:provider-write-live-pilot-run-ledger:safe",
  "providerWriteManualCloseoutReviewSha256",
]);
mustContainAll("production readiness references provider write live pilot run ledger draft export", content.productionReadiness, [
  "PR70 Provider Write Live Pilot Run Ledger Draft Export",
  "npm run verify:provider-write-live-pilot-run-ledger-draft-export",
  "readyForSafeLedger=false",
  "manual_closeout_review",
]);
mustContainAll("production readiness references provider write manual closeout review", content.productionReadiness, [
  "PR71 Provider Write Manual Closeout Review Gate",
  "npm run verify:provider-write-manual-closeout-review",
  "npm run verify:provider-write-manual-closeout-review:safe",
]);
mustContainAll("production readiness references provider write safe ledger assembly", content.productionReadiness, [
  "PR72 Provider Write Safe Ledger Assembly Gate",
  "npm run verify:provider-write-safe-ledger-assembly",
  "npm run verify:provider-write-safe-ledger-assembly:safe",
  "providerWriteLivePilotRunLedgerDraftSha256",
  "providerWriteManualCloseoutReviewSha256",
  "draftOnly=true",
  "readyForSafeLedger=false",
  "canPassPr69SafeLedger=false",
]);

mustContainAll("production readiness references provider write live executor startup guard", content.productionReadiness, [
  "PR64 Provider Write Live Executor Startup Guard",
  "npm run verify:provider-write-live-executor-startup-guard",
  "PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED",
]);

mustContainAll("production readiness references provider write live executor control plane", content.productionReadiness, [
  "PR65 Provider Write Live Executor Control Plane",
  "npm run verify:provider-write-live-executor-control-plane",
  "ProviderWriteLiveExecutorStatusSchema",
]);

mustContainAll("channel runbook references launch", content.channelRunbook, [
  "Production launch and rollback",
  "docs/deploy/production-launch-runbook.md",
  "npm run verify:production-launch",
]);

mustContainAll("task plan references PR34", content.taskPlan, [
  "PR34 - Production Launch And Rollback Runbook",
  "PR34 production launch and rollback runbook",
  "verify:production-launch",
]);

mustContainAll("task plan references PR46", content.taskPlan, [
  "PR46 - Multi-Merchant Launch Manifest",
  "PR46 multi-merchant launch manifest",
  "smart-cs-agent.launch-manifest.v1",
  "verify:launch-manifest:safe",
]);

mustContainAll("task plan references PR47", content.taskPlan, [
  "PR47 - Production Deployment Artifacts",
  "verify:production-deploy-artifacts",
  "docker-compose.production.yml.example",
]);

mustContainAll("task plan references PR48", content.taskPlan, [
  "PR48 - Production Image Build Gate",
  "verify:production-image-builds",
  "production-image-build.yml.example",
]);

mustContainAll("task plan references PR49", content.taskPlan, [
  "PR49 - Production Container Runtime Smoke Gate",
  "verify:production-container-smoke",
  "production-container-smoke.yml.example",
]);

mustContainAll("task plan references PR50", content.taskPlan, [
  "PR50 - Production Image Security Evidence Gate",
  "verify:production-image-security",
  "production-image-security.yml.example",
]);

mustContainAll("task plan references PR51", content.taskPlan, [
  "PR51 - Production Release Provenance And Promotion Boundary",
  "verify:production-release-provenance",
  "production-release-provenance.yml.example",
]);

mustContainAll("task plan references PR52", content.taskPlan, [
  "PR52 - Production Release Evidence Archive",
  "verify:production-release-evidence",
  "production-release-evidence.yml.example",
]);

mustContainAll("task plan references PR53", content.taskPlan, [
  "PR53 - Production Change Approval Gate",
  "verify:production-change-approval",
  "production-change-approval.yml.example",
]);

mustContainAll("task plan references PR54", content.taskPlan, [
  "PR54 - Production Launch Binding Gate",
  "verify:production-launch-binding",
  "production-launch-binding.yml.example",
]);

mustContainAll("task plan references PR55", content.taskPlan, [
  "PR55 - Production Static CI Gate",
  "verify:production-static-ci",
]);

mustContainAll("task plan references PR56", content.taskPlan, [
  "PR56 - Production Branch Protection Gate",
  "verify:production-branch-protection",
]);

mustContainAll("task plan references PR57", content.taskPlan, [
  "PR57 - Production Provider Write Approval Gate",
  "verify:production-provider-write-approval",
]);

mustContainAll("task plan references PR58", content.taskPlan, [
  "PR58 - Provider Write Request Queue",
  "verify:provider-write-requests",
]);

mustContainAll("task plan references PR59", content.taskPlan, [
  "PR59 - Provider Write Approval State Machine",
  "verify:provider-write-approval-state",
]);

mustContainAll("task plan references PR60", content.taskPlan, [
  "PR60 - Provider Write Execution Attempt Safety",
  "verify:provider-write-execution-attempts",
]);

mustContainAll("task plan references PR61", content.taskPlan, [
  "PR61 - Provider Write Execution Attempt Invariants And Visibility",
  "verify:provider-write-execution-attempt-visibility",
]);

mustContainAll("task plan references PR62", content.taskPlan, [
  "PR62 - Provider Write Payload Escrow Boundary",
  "verify:provider-write-payload-escrow-boundary",
]);
mustContainAll("task plan references PR63", content.taskPlan, [
  "PR63 - Provider Write Dry-Run Rehearsal Evidence Gate",
  "verify:provider-write-dry-run-rehearsal",
]);

mustContainAll("task plan references PR68", content.taskPlan, [
  "PR68 - Provider Write Live Pilot Preflight Gate",
  "verify:provider-write-live-pilot-preflight",
]);

mustContainAll("task plan references PR69", content.taskPlan, [
  "PR69 - Provider Write Live Pilot Run Ledger Gate",
  "verify:provider-write-live-pilot-run-ledger",
]);
mustContainAll("task plan references PR70", content.taskPlan, [
  "PR70 - Provider Write Live Pilot Run Ledger Draft Export",
  "verify:provider-write-live-pilot-run-ledger-draft-export",
]);
mustContainAll("task plan references PR71", content.taskPlan, [
  "PR71 - Provider Write Manual Closeout Review Gate",
  "verify:provider-write-manual-closeout-review",
]);
mustContainAll("task plan references PR72", content.taskPlan, [
  "PR72 - Provider Write Safe Ledger Assembly Gate",
  "verify:provider-write-safe-ledger-assembly",
]);

mustContainAll("cross-verifier references", content.launchRunbook, [
  "verify:production-readiness",
  "verify:production-canary",
  "verify:production-static-ci",
  "verify:production-branch-protection",
  "verify:production-provider-write-approval",
  "verify:provider-write-requests",
  "verify:provider-write-execution-attempts",
  "verify:provider-write-execution-attempt-visibility",
  "verify:provider-write-payload-escrow-boundary",
  "verify:provider-write-live-pilot-preflight",
  "verify:provider-write-live-pilot-run-ledger",
  "verify:provider-write-live-pilot-run-ledger-draft-export",
  "verify:provider-write-manual-closeout-review",
  "verify:provider-write-safe-ledger-assembly",
  "verify:production-deploy-artifacts",
  "verify:production-image-builds",
  "verify:production-container-smoke",
  "verify:production-image-security",
  "verify:production-release-provenance",
  "verify:production-release-evidence",
  "verify:production-change-approval",
  "verify:production-launch-binding",
  "verify:production-alerting",
  "verify:provider-adapters",
  "verify:provider-readonly",
  "verify:provider-read-contract",
  "verify:provider-read-audit",
  "verify:provider-read-operations",
  "verify:provider-credential-boundary",
  "verify:provider-credential-store",
  "verify:provider-read-harness",
  "verify:merchant-launch-preflight:safe",
  "generate:launch-evidence:safe",
  "verify:launch-evidence-archive:safe",
  "verify:launch-manifest:safe",
  "verify:launch-evidence",
  "verify:channel-runbook",
]);
mustContainAll("production launch verifier source", content.productionAlertingVerifier, [
  "verify:production-alerting",
]);
mustContainAll("production static CI verifier source", content.productionStaticCiVerifier, [
  "verify:production-static-ci",
  "production-static-gates.yml",
  "node --test scripts/verify-provider-write-controlled-expansion-approval.test.mjs",
  "npm run verify:provider-write-controlled-expansion-approval",
  "workflow must not use secrets context",
  "workflow must not run environment-bound production commands",
]);
mustContainAll("production branch protection verifier source", content.productionBranchProtectionVerifier, [
  "verify:production-branch-protection",
  "production-branch-protection-artifacts",
  "Static production gates",
  "githubApiCalledByVerifier",
  "branchProtectionMutatedByVerifier",
]);
mustContainAll("production provider write approval verifier source", content.productionProviderWriteApprovalVerifier, [
  "verify:production-provider-write-approval",
  "verify:provider-write-kill-switch-rehearsal",
  "production-provider-write-approval-artifacts",
  "human_review_required",
  "approvalStatus",
  "artifactBindings",
  "providerWriteKillSwitchSha256",
  "providerWriteKillSwitchReady",
  "automaticProviderWritesEnabled",
]);
mustContainAll("provider write dry-run rehearsal verifier source", content.providerWriteDryRunRehearsalVerifier, [
  "verify:provider-write-dry-run-rehearsal",
  "provider-write-dry-run-rehearsal-artifacts",
  "smart-cs-agent.provider-write-dry-run-rehearsal.v1",
  "provider write dry-run rehearsal",
  "providerMutationExecuted",
  "customerVisibleMessageSent",
  "payloadEscrowOpened",
]);
mustContainAll("provider write kill-switch rehearsal verifier source", content.providerWriteKillSwitchRehearsalVerifier, [
  "verify:provider-write-kill-switch-rehearsal",
  "provider-write-kill-switch-rehearsal-artifacts",
  "smart-cs-agent.provider-write-kill-switch-rehearsal.v1",
  "provider write kill switch rehearsal",
  "emergency_stop_engaged",
  "providerMutationExecuted",
  "customerVisibleMessageSent",
  "payloadEscrowOpened",
]);
mustContainAll("provider write live pilot preflight verifier source", content.providerWriteLivePilotPreflightVerifier, [
  "verify:provider-write-live-pilot-preflight",
  "provider-write-live-pilot-preflight-artifacts",
  "smart-cs-agent.provider-write-live-pilot-preflight.v1",
  "provider write live pilot preflight",
  "single_merchant_pilot",
  "liveExecutorEnabledAtVerification",
  "networkExecutedByVerifier",
  "providerWriteExecutedByVerifier",
  "customerVisibleActionsSentByVerifier",
]);
mustContainAll("provider write live pilot run ledger verifier source", content.providerWriteLivePilotRunLedgerVerifier, [
  "verify:provider-write-live-pilot-run-ledger",
  "provider-write-live-pilot-run-ledger-artifacts",
  "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
  "provider write live pilot run ledger",
  "single_merchant_pilot",
  "providerMutationExecuted",
  "customerVisibleMessageSent",
  "networkExecutedByVerifier",
  "providerWriteExecutedByVerifier",
  "customerVisibleActionsSentByVerifier",
]);
mustContainAll("provider write live pilot run ledger draft export verifier source", content.providerWriteLivePilotRunLedgerDraftExportVerifier, [
  "verify:provider-write-live-pilot-run-ledger-draft-export",
  "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1",
  "provider write live pilot run ledger draft export",
  "draftOnly: z.literal(true)",
  "readyForSafeLedger: z.literal(false)",
  "canPassPr69SafeLedger: z.literal(false)",
  "networkExecutedByExporter: z.literal(false)",
  "providerWriteExecutedByExporter: z.literal(false)",
  "customerVisibleActionsSentByExporter: z.literal(false)",
]);
mustContainAll("provider write manual closeout review verifier source", content.providerWriteManualCloseoutReviewVerifier, [
  "verify:provider-write-manual-closeout-review",
  "provider-write-manual-closeout-review-artifacts",
  "smart-cs-agent.provider-write-manual-closeout-review.v1",
  "provider write manual closeout review",
  "approved_for_safe_ledger",
  "networkExecutedByVerifier",
  "providerWriteExecutedByVerifier",
  "customerVisibleActionsSentByVerifier",
]);
mustContainAll("provider write safe ledger assembly verifier source", content.providerWriteSafeLedgerAssemblyVerifier, [
  "verify:provider-write-safe-ledger-assembly",
  "provider-write-live-pilot-run-ledger-draft-artifacts",
  "provider-write-manual-closeout-review-artifacts",
  "provider-write-live-pilot-run-ledger-artifacts",
  "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1",
  "smart-cs-agent.provider-write-manual-closeout-review.v1",
  "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
  "providerWriteLivePilotRunLedgerDraftSha256",
  "providerWriteManualCloseoutReviewSha256",
  "auditExportSha256",
  "productionLaunchSha256",
  "draftOnly",
  "readyForSafeLedger",
  "canPassPr69SafeLedger",
  "approved_for_safe_ledger",
  "networkExecutedByVerifier",
  "providerWriteExecutedByVerifier",
  "customerVisibleActionsSentByVerifier",
]);
mustContainAll("provider write controlled expansion approval verifier source", content.providerWriteControlledExpansionApprovalVerifier, [
  "verify:provider-write-controlled-expansion-approval",
  "provider-write-controlled-expansion-approval-artifacts",
  "provider-write-safe-ledger-assembly-artifacts",
  "provider-write-live-pilot-run-ledger-draft-artifacts",
  "provider-write-manual-closeout-review-artifacts",
  "provider-write-live-pilot-run-ledger-artifacts",
  "smart-cs-agent.provider-write-controlled-expansion-approval.v1",
  "smart-cs-agent.provider-write-safe-ledger-assembly.v1",
  "single_merchant_pilot",
  "controlled_multi_merchant",
  "providerWriteSafeLedgerAssemblyVerifierPassed",
  "providerWriteSafeLedgerAssemblySha256",
  "validateAssemblyBinding",
  "validateAssemblySourceBindings",
  "createHash",
  "maxDailyProviderWritesPerMerchant",
  "noAutomaticCustomerVisibleReplies",
  "customerVisibleActionsSentByVerifier",
  "credentialsReadByVerifier",
]);
mustContainAll("provider write live executor startup guard verifier source", content.providerWriteLiveExecutorStartupGuardVerifier, [
  "verify:provider-write-live-executor-startup-guard",
  "PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED",
  "PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256",
  "PROVIDER_WRITE_APPROVAL_SHA256",
  "execution boundary no live provider writes",
]);
mustContainAll("provider write live executor control-plane verifier source", content.providerWriteLiveExecutorControlPlaneVerifier, [
  "verify:provider-write-live-executor-control-plane",
  "ProviderWriteLiveExecutorStatusSchema",
  "GET /v2/provider-writes/live-executor/status",
  "control-plane execution boundary no live provider writes",
]);
mustContainAll("provider write kill switch control-plane verifier source", content.providerWriteKillSwitchControlPlaneVerifier, [
  "verify:provider-write-kill-switch-control-plane",
  "ProviderWriteKillSwitchStatusSchema",
  "GET /v2/provider-writes/kill-switch/status",
  "POST /v2/provider-writes/kill-switch/status",
  "Provider write kill switch control-plane",
]);
mustContainAll("provider write requests verifier source", content.providerWriteRequestsVerifier, [
  "verify:provider-write-requests",
  "ProviderWriteRequest",
  "PROVIDER_WRITE_REVIEW_ADAPTERS",
  "providerMutationExecuted: false",
  "customerVisibleMessageSent: false",
  "does not call provider APIs",
]);

mustContainAll("provider write approval state verifier source", content.providerWriteApprovalStateVerifier, [
  "verify:provider-write-approval-state",
  "ProviderWriteApprovalRequestSchema",
  "two-person review",
  "provider write approval state",
  "providerMutationExecuted: false",
  "customerVisibleMessageSent: false",
]);

mustContainAll("provider write execution attempts verifier source", content.providerWriteExecutionAttemptsVerifier, [
  "verify:provider-write-execution-attempts",
  "ProviderWriteExecutionAttemptRequestSchema",
  "PROVIDER_WRITE_EXECUTION_KILL_SWITCH",
  "provider write execution attempts",
  "payloadEscrowOpened: false",
  "providerMutationExecuted: false",
  "customerVisibleMessageSent: false",
]);
mustContainAll("provider write execution attempt visibility verifier source", content.providerWriteExecutionAttemptVisibilityVerifier, [
  "verify:provider-write-execution-attempt-visibility",
  "ProviderWriteExecutionAttemptListItemSchema",
  "GET /v2/provider-writes/execution-attempts",
  "GET /api/operator/provider-writes/execution-attempts",
  "provider write execution attempt visibility",
]);
mustContainAll("provider write payload escrow boundary verifier source", content.providerWritePayloadEscrowBoundaryVerifier, [
  "verify:provider-write-payload-escrow-boundary",
  "PROVIDER_WRITE_PAYLOAD_ESCROW_MODE",
  "payloadEscrowEnvelopeFingerprint",
  "provider write payload escrow boundary",
]);
mustContainAll("provider adapter verifier source", content.providerAdapterVerifier, [
  "verify:provider-adapters",
]);
mustContainAll("provider readonly verifier source", content.providerReadonlyVerifier, [
  "verify:provider-readonly",
]);
mustContainAll("provider read contract verifier source", content.providerReadContractVerifier, [
  "verify:provider-read-contract",
]);
mustContainAll("provider read audit verifier source", content.providerReadAuditVerifier, [
  "verify:provider-read-audit",
]);
mustContainAll("provider read operations verifier source", content.providerReadOperationsVerifier, [
  "verify:provider-read-operations",
]);
mustContainAll("provider credential boundary verifier source", content.providerCredentialBoundaryVerifier, [
  "verify:provider-credential-boundary",
]);
mustContainAll("provider credential store verifier source", content.providerCredentialStoreVerifier, [
  "verify:provider-credential-store",
]);
mustContainAll("provider read harness verifier source", content.providerReadHarnessVerifier, [
  "verify:provider-read-harness",
]);
mustContainAll("launch evidence verifier source", content.launchEvidenceVerifier, [
  "verify:launch-evidence",
]);
mustContainAll("launch manifest verifier source", content.launchManifestVerifier, [
  "smart-cs-agent.launch-manifest.v1",
  "verify-launch-manifest",
]);
mustContainAll("production deploy artifacts verifier source", content.productionDeployArtifactsVerifier, [
  "verify:production-deploy-artifacts",
  "apps/api/Dockerfile",
  "apps/web/Dockerfile",
  "docker-compose.production.yml.example",
]);
mustContainAll("production image builds verifier source", content.productionImageBuildsVerifier, [
  "verify:production-image-builds",
  "verify:production-image-builds:docker",
  "apps/api/Dockerfile",
  "apps/web/Dockerfile",
  "docker build",
]);
mustContainAll("production container smoke verifier source", content.productionContainerSmokeVerifier, [
  "verify:production-container-smoke",
  "verify:production-container-smoke:docker",
  "apps/api/Dockerfile",
  "apps/web/Dockerfile",
  "docker",
  "/health",
]);
mustContainAll("production image security verifier source", content.productionImageSecurityVerifier, [
  "verify:production-image-security",
  "verify:production-image-security:docker",
  "anchore/syft:latest",
  "aquasec/trivy:latest",
  "spdx-json",
  "--severity",
]);
mustContainAll("production release provenance verifier source", content.productionReleaseProvenanceVerifier, [
  "verify:production-release-provenance",
  "smart-cs-agent.release-provenance.v1",
  "signatureVerified",
  "provenanceVerified",
  "sbomAttestationVerified",
  "promotion.approval",
]);
mustContainAll("production release evidence verifier source", content.productionReleaseEvidenceVerifier, [
  "verify:production-release-evidence",
  "smart-cs-agent.production-release-evidence.v1",
  "releaseProvenance",
  "launchManifest",
  "deployHealth",
  "rollbackOwnerFingerprint",
]);
mustContainAll("production change approval verifier source", content.productionChangeApprovalVerifier, [
  "verify:production-change-approval",
  "smart-cs-agent.production-change-approval.v1",
  "approvalStatus",
  "rollbackOwnerFingerprint",
  "killSwitchReady",
  "operatorCoverageConfirmed",
]);
mustContainAll("production launch binding verifier source", content.productionLaunchBindingVerifier, [
  "verify:production-launch-binding",
  "production-release-provenance-artifacts",
  "production-release-evidence-artifacts",
  "production-change-approval-artifacts",
  "launch-manifest-artifacts",
  "releaseId binding mismatch",
  "change ticket binding mismatch",
]);
mustContainAll("production image build docs", content.productionImageBuilds, [
  "PR48 Production Image Build Gate",
  "npm run verify:production-image-builds",
  "npm run verify:production-image-builds:docker",
  "does not publish images",
]);
mustContainAll("production image build workflow", content.productionImageBuildWorkflow, [
  "permissions:",
  "contents: read",
  "npm run verify:production-image-builds:docker",
]);
mustContainAll("production container smoke docs", content.productionContainerSmoke, [
  "PR49 Production Container Runtime Smoke Gate",
  "npm run verify:production-container-smoke",
  "npm run verify:production-container-smoke:docker",
  "does not publish images",
]);
mustContainAll("production container smoke workflow", content.productionContainerSmokeWorkflow, [
  "permissions:",
  "contents: read",
  "npm run verify:production-container-smoke:docker",
]);
mustContainAll("production image security docs", content.productionImageSecurity, [
  "PR50 Production Image Security Evidence Gate",
  "npm run verify:production-image-security",
  "npm run verify:production-image-security:docker",
  "does not publish images",
]);
mustContainAll("production image security workflow", content.productionImageSecurityWorkflow, [
  "permissions:",
  "contents: read",
  "npm run verify:production-image-security:docker",
  "actions/upload-artifact@v4",
]);
mustContainAll("production release provenance docs", content.productionReleaseProvenance, [
  "PR51 Production Release Provenance And Promotion Boundary",
  "npm run verify:production-release-provenance",
  "npm run verify:production-release-provenance:safe",
  "smart-cs-agent.release-provenance.v1",
  "does not publish images",
]);
mustContainAll("production release provenance workflow", content.productionReleaseProvenanceWorkflow, [
  "permissions:",
  "contents: read",
  "npm run verify:production-release-provenance",
  "npm run verify:production-release-provenance:safe",
  "actions/upload-artifact@v4",
]);
mustContainAll("production release evidence docs", content.productionReleaseEvidence, [
  "PR52 Production Release Evidence Archive",
  "npm run verify:production-release-evidence",
  "npm run verify:production-release-evidence:safe",
  "smart-cs-agent.production-release-evidence.v1",
  "does not publish images",
]);
mustContainAll("production release evidence workflow", content.productionReleaseEvidenceWorkflow, [
  "permissions:",
  "contents: read",
  "npm run verify:production-release-evidence",
  "npm run verify:production-release-evidence:safe",
  "actions/upload-artifact@v4",
]);
mustContainAll("production change approval docs", content.productionChangeApproval, [
  "PR53 Production Change Approval Gate",
  "npm run verify:production-change-approval",
  "npm run verify:production-change-approval:safe",
  "smart-cs-agent.production-change-approval.v1",
  "does not publish images",
]);
mustContainAll("production change approval workflow", content.productionChangeApprovalWorkflow, [
  "permissions:",
  "contents: read",
  "npm run verify:production-change-approval",
  "npm run verify:production-change-approval:safe",
  "actions/upload-artifact@v4",
]);
mustContainAll("production launch binding docs", content.productionLaunchBinding, [
  "PR54 Production Launch Binding Gate",
  "npm run verify:production-launch-binding",
  "npm run verify:production-launch-binding:safe",
  "artifact SHA-256",
  "does not call the API",
]);
mustContainAll("production launch binding workflow", content.productionLaunchBindingWorkflow, [
  "permissions:",
  "contents: read",
  "npm run verify:production-launch-binding",
  "npm run verify:production-launch-binding:safe",
  "SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_FILE",
]);
mustContainAll("production static CI docs", content.productionStaticCi, [
  "PR55 Production Static CI Gate",
  ".github/workflows/production-static-gates.yml",
  "npm run verify:production-static-ci",
  "npm run verify:production-branch-protection",
  "docs/deploy/production-branch-protection.md",
  "does not call production APIs",
]);
mustContainAll("production branch protection docs", content.productionBranchProtection, [
  "PR56 Production Branch Protection Gate",
  "npm run verify:production-branch-protection",
  "npm run verify:production-branch-protection:safe",
  "smart-cs-agent.production-branch-protection.v1",
  "Static production gates",
  "does not call the GitHub API",
  "does not mutate branch protection",
]);
mustContainAll("production provider write approval docs", content.productionProviderWriteApproval, [
  "PR57 Production Provider Write Approval Gate",
  "npm run verify:production-provider-write-approval",
  "npm run verify:production-provider-write-approval:safe",
  "npm run verify:provider-write-kill-switch-rehearsal:safe",
  "smart-cs-agent.production-provider-write-approval.v1",
  "human_review_required",
  "approvalStatus",
  "artifactBindings",
  "providerWriteKillSwitchSha256",
  "does not call provider APIs",
  "does not execute provider writes",
]);
mustContainAll("provider write dry-run rehearsal docs", content.providerWriteDryRunRehearsal, [
  "PR63 Provider Write Dry-Run Rehearsal Evidence Gate",
  "npm run verify:provider-write-dry-run-rehearsal",
  "npm run verify:provider-write-dry-run-rehearsal:safe",
  "smart-cs-agent.provider-write-dry-run-rehearsal.v1",
  "SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE",
  "does not call provider APIs",
  "does not execute provider writes",
]);
mustContainAll("provider write kill-switch rehearsal docs", content.providerWriteKillSwitchRehearsal, [
  "PR67 Provider Write Kill Switch Rehearsal Evidence Gate",
  "npm run verify:provider-write-kill-switch-rehearsal",
  "npm run verify:provider-write-kill-switch-rehearsal:safe",
  "smart-cs-agent.provider-write-kill-switch-rehearsal.v1",
  "SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE",
  "providerWriteKillSwitchSha256",
  "does not call provider APIs",
  "does not execute provider writes",
]);
mustContainAll("provider write live pilot preflight docs", content.providerWriteLivePilotPreflight, [
  "PR68 Provider Write Live Pilot Preflight Gate",
  "npm run verify:provider-write-live-pilot-preflight",
  "npm run verify:provider-write-live-pilot-preflight:safe",
  "smart-cs-agent.provider-write-live-pilot-preflight.v1",
  "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE",
  "single_merchant_pilot",
  "does not call provider APIs",
  "does not execute provider writes",
  "does not read provider credentials",
  "does not open payload escrow",
  "does not send customer-visible replies",
]);
mustContainAll("provider write live pilot run ledger docs", content.providerWriteLivePilotRunLedger, [
  "PR69 Provider Write Live Pilot Run Ledger Gate",
  "npm run verify:provider-write-live-pilot-run-ledger",
  "npm run verify:provider-write-live-pilot-run-ledger:safe",
  "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
  "SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE",
  "single_merchant_pilot",
  "does not call provider APIs",
  "does not execute provider writes",
  "does not read provider credentials",
  "does not open payload escrow",
  "does not send customer-visible replies",
]);
mustContainAll("provider write live pilot run ledger draft export docs", content.providerWriteLivePilotRunLedger, [
  "PR70 Provider Write Live Pilot Run Ledger Draft Export",
  "npm run verify:provider-write-live-pilot-run-ledger-draft-export",
  "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1",
  "GET /v2/provider-writes/live-pilot-run-ledger/draft",
  "GET /api/operator/provider-writes/live-pilot-run-ledger/draft",
  "draftOnly=true",
  "readyForSafeLedger=false",
  "canPassPr69SafeLedger=false",
  "does not call provider APIs",
  "does not execute provider writes",
]);
mustContainAll("provider write manual closeout review docs", content.providerWriteManualCloseoutReview, [
  "PR71 Provider Write Manual Closeout Review Gate",
  "npm run verify:provider-write-manual-closeout-review",
  "npm run verify:provider-write-manual-closeout-review:safe",
  "smart-cs-agent.provider-write-manual-closeout-review.v1",
  "SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_FILE",
  "SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_REQUIRE_PASS=true",
  "approved_for_safe_ledger",
  "providerWriteManualCloseoutReviewSha256",
  "does not call provider APIs",
  "does not execute provider writes",
  "does not read provider credentials",
  "does not open payload escrow",
  "does not send customer-visible replies",
]);
mustContainAll("provider write safe ledger assembly docs", content.providerWriteSafeLedgerAssembly, [
  "PR72 Provider Write Safe Ledger Assembly Gate",
  "npm run verify:provider-write-safe-ledger-assembly",
  "npm run verify:provider-write-safe-ledger-assembly:safe",
  "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_DRAFT_FILE",
  "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REVIEW_FILE",
  "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_LEDGER_FILE",
  "SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REQUIRE_PASS=true",
  "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1",
  "smart-cs-agent.provider-write-manual-closeout-review.v1",
  "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
  "providerWriteLivePilotRunLedgerDraftSha256",
  "providerWriteManualCloseoutReviewSha256",
  "auditExportSha256",
  "productionLaunchSha256",
  "draftOnly=true",
  "readyForSafeLedger=false",
  "canPassPr69SafeLedger=false",
  "approved_for_safe_ledger",
  "does not call provider APIs",
  "does not execute provider writes",
  "does not read provider credentials",
  "does not open payload escrow",
  "does not send customer-visible replies",
]);
mustContainAll("provider write controlled expansion approval docs", content.providerWriteControlledExpansionApproval, [
  "PR73 Provider Write Controlled Expansion Approval Gate",
  "npm run verify:provider-write-controlled-expansion-approval",
  "npm run verify:provider-write-controlled-expansion-approval:safe",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_FILE",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_FILE",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_DRAFT_FILE",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_REVIEW_FILE",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_LEDGER_FILE",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_REQUIRE_PASS=true",
  "smart-cs-agent.provider-write-controlled-expansion-approval.v1",
  "smart-cs-agent.provider-write-safe-ledger-assembly.v1",
  "provider-write-controlled-expansion-approval-artifacts/",
  "provider-write-safe-ledger-assembly-artifacts/",
  "provider-write-live-pilot-run-ledger-draft-artifacts/",
  "provider-write-manual-closeout-review-artifacts/",
  "provider-write-live-pilot-run-ledger-artifacts/",
  "single_merchant_pilot",
  "controlled_multi_merchant",
  "providerWriteSafeLedgerAssemblyVerifierPassed=true",
  "providerWriteSafeLedgerAssemblySha256",
  "providerWriteLivePilotRunLedgerDraftSha256",
  "providerWriteManualCloseoutReviewSha256",
  "providerWriteLivePilotRunLedgerSha256",
  "does not call provider APIs",
  "does not execute provider writes",
  "does not read provider credentials",
  "does not read production databases",
  "does not open payload escrow",
  "does not send customer-visible replies",
]);
mustContainAll("provider write requests docs", content.providerWriteRequests, [
  "PR58 Provider Write Request Queue",
  "ProviderWriteRequest",
  "PROVIDER_WRITE_REVIEW_ADAPTERS",
  "idempotencyKeyHash",
  "POST /v2/provider-writes/request",
  "GET /v2/provider-writes/requests",
  "does not call provider APIs",
  "does not execute provider writes",
  "does not send customer-visible replies",
  "npm run verify:provider-write-requests",
]);
mustContainAll("provider write approval state docs", content.providerWriteRequests, [
  "PR59 Provider Write Approval State Machine",
  "POST /v2/provider-writes/requests/:id/approve",
  "POST /v2/provider-writes/requests/:id/reject",
  "two-person review",
  "payloadEscrowStatus",
  "npm run verify:provider-write-approval-state",
]);
mustContainAll("provider write execution attempts docs", content.providerWriteRequests, [
  "PR60 Provider Write Execution Attempt Safety",
  "POST /v2/provider-writes/requests/:id/execution-attempts",
  "POST /api/operator/provider-writes/requests/:id/execution-attempts",
  "PROVIDER_WRITE_EXECUTION_KILL_SWITCH",
  "dry_run_recorded",
  "npm run verify:provider-write-execution-attempts",
]);
mustContainAll("provider write execution attempt visibility docs", content.providerWriteRequests, [
  "PR61 Provider Write Execution Attempt Invariants And Visibility",
  "GET /v2/provider-writes/execution-attempts",
  "GET /api/operator/provider-writes/execution-attempts",
  "ProviderWriteExecutionAttemptListItem",
  "npm run verify:provider-write-execution-attempt-visibility",
]);
mustContainAll("provider write payload escrow boundary docs", content.providerWriteRequests, [
  "PR62 Provider Write Payload Escrow Boundary",
  "PROVIDER_WRITE_PAYLOAD_ESCROW_MODE",
  "sealed_metadata",
  "payloadEscrowEnvelopeFingerprint",
  "npm run verify:provider-write-payload-escrow-boundary",
]);
mustContainAll("provider write dry-run rehearsal docs reference", content.providerWriteRequests, [
  "PR63 Provider Write Dry-Run Rehearsal Evidence Gate",
  "npm run verify:provider-write-dry-run-rehearsal",
  "smart-cs-agent.provider-write-dry-run-rehearsal.v1",
]);
mustContainAll("provider write kill-switch rehearsal docs reference", content.providerWriteRequests, [
  "PR67 Provider Write Kill Switch Rehearsal Evidence Gate",
  "npm run verify:provider-write-kill-switch-rehearsal",
  "smart-cs-agent.provider-write-kill-switch-rehearsal.v1",
]);
mustContainAll("provider write live pilot preflight docs reference", content.providerWriteRequests, [
  "PR68 Provider Write Live Pilot Preflight Gate",
  "npm run verify:provider-write-live-pilot-preflight",
  "smart-cs-agent.provider-write-live-pilot-preflight.v1",
]);
mustContainAll("provider write live pilot run ledger docs reference", content.providerWriteRequests, [
  "PR69 Provider Write Live Pilot Run Ledger Gate",
  "npm run verify:provider-write-live-pilot-run-ledger",
  "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
]);
mustContainAll("provider write live pilot run ledger draft export docs reference", content.providerWriteRequests, [
  "PR70 Provider Write Live Pilot Run Ledger Draft Export",
  "npm run verify:provider-write-live-pilot-run-ledger-draft-export",
  "ProviderWriteLivePilotRunLedgerDraftSchema",
  "manual_closeout_review",
  "providerWriteManualCloseoutReviewSha256",
]);
mustContainAll("provider write manual closeout review docs reference", content.providerWriteRequests, [
  "PR71 Provider Write Manual Closeout Review Gate",
  "npm run verify:provider-write-manual-closeout-review",
  "smart-cs-agent.provider-write-manual-closeout-review.v1",
  "providerWriteManualCloseoutReviewSha256",
]);
mustContainAll("provider write safe ledger assembly docs reference", content.providerWriteRequests, [
  "PR72 Provider Write Safe Ledger Assembly Gate",
  "npm run verify:provider-write-safe-ledger-assembly",
  "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1",
  "smart-cs-agent.provider-write-manual-closeout-review.v1",
  "smart-cs-agent.provider-write-live-pilot-run-ledger.v1",
  "providerWriteLivePilotRunLedgerDraftSha256",
  "providerWriteManualCloseoutReviewSha256",
  "draftOnly=true",
  "readyForSafeLedger=false",
  "canPassPr69SafeLedger=false",
]);
mustContainAll("provider write controlled expansion approval docs reference", content.providerWriteRequests, [
  "PR73 Provider Write Controlled Expansion Approval Gate",
  "npm run verify:provider-write-controlled-expansion-approval",
  "smart-cs-agent.provider-write-controlled-expansion-approval.v1",
  "controlled_multi_merchant",
  "providerWriteSafeLedgerAssemblySha256",
  "SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_DRAFT_FILE",
]);
mustContainAll("provider write live executor startup guard docs reference", content.providerWriteRequests, [
  "PR64 Provider Write Live Executor Startup Guard",
  "PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED",
  "npm run verify:provider-write-live-executor-startup-guard",
]);
mustContainAll("provider write live executor control-plane docs reference", content.providerWriteRequests, [
  "PR65 Provider Write Live Executor Control Plane",
  "GET /v2/provider-writes/live-executor/status",
  "GET /api/operator/provider-writes/live-executor/status",
  "npm run verify:provider-write-live-executor-control-plane",
]);
mustContainAll("provider write kill switch control-plane docs reference", content.providerWriteRequests, [
  "PR66 Provider Write Kill Switch Control Plane",
  "GET /v2/provider-writes/kill-switch/status",
  "POST /v2/provider-writes/kill-switch/status",
  "GET /api/operator/provider-writes/kill-switch/status",
  "POST /api/operator/provider-writes/kill-switch/status",
  "npm run verify:provider-write-kill-switch-control-plane",
]);
mustContainAll("public API provider write routes", content.publicApiSurface, [
  "POST /v2/provider-writes/request",
  "GET /v2/provider-writes/requests",
  "POST /v2/provider-writes/requests/:id/approve",
  "POST /v2/provider-writes/requests/:id/reject",
  "POST /v2/provider-writes/requests/:id/execution-attempts",
  "GET /v2/provider-writes/execution-attempts",
  "GET /v2/provider-writes/live-pilot-run-ledger/draft",
  "GET /v2/provider-writes/live-executor/status",
  "GET /v2/provider-writes/kill-switch/status",
  "POST /v2/provider-writes/kill-switch/status",
  "POST /api/operator/provider-writes/requests",
  "GET /api/operator/provider-writes/requests",
  "POST /api/operator/provider-writes/requests/:id/approve",
  "POST /api/operator/provider-writes/requests/:id/reject",
  "POST /api/operator/provider-writes/requests/:id/execution-attempts",
  "GET /api/operator/provider-writes/execution-attempts",
  "GET /api/operator/provider-writes/live-pilot-run-ledger/draft",
  "GET /api/operator/provider-writes/live-executor/status",
  "GET /api/operator/provider-writes/kill-switch/status",
  "POST /api/operator/provider-writes/kill-switch/status",
  "ProviderWriteRequest",
  "ProviderWriteExecutionAttempt",
  "ProviderWriteExecutionAttemptListItem",
  "ProviderWriteLivePilotRunLedgerDraftSchema",
  "ProviderWriteLiveExecutorStatusSchema",
  "ProviderWriteKillSwitchStatusSchema",
  "idempotencyKeyHash",
  "payloadEscrowOpened=false",
  "providerMutationExecuted=false",
  "customerVisibleMessageSent=false",
  "networkExecution=not_started",
  "canPassPr69SafeLedger=false",
]);
mustContainAll("production static CI workflow", content.productionStaticCiWorkflow, [
  "permissions:",
  "contents: read",
  "pull_request:",
  "push:",
  "workflow_dispatch:",
  "npm ci",
  "node --test scripts/verify-provider-write-safe-ledger-assembly.test.mjs",
  "node --test scripts/verify-provider-write-controlled-expansion-approval.test.mjs",
  "npm run verify:production-static-ci",
  "npm run verify:production-launch",
  "npm run verify:provider-write-requests",
  "npm run verify:provider-write-approval-state",
  "npm run verify:provider-write-execution-attempts",
  "npm run verify:provider-write-execution-attempt-visibility",
  "npm run verify:provider-write-payload-escrow-boundary",
  "npm run verify:provider-write-dry-run-rehearsal",
  "npm run verify:provider-write-live-executor-startup-guard",
  "npm run verify:provider-write-live-executor-control-plane",
  "npm run verify:provider-write-kill-switch-control-plane",
  "npm run verify:provider-write-kill-switch-rehearsal",
  "npm run verify:provider-write-live-pilot-preflight",
  "npm run verify:provider-write-live-pilot-run-ledger",
  "npm run verify:provider-write-live-pilot-run-ledger-draft-export",
  "npm run verify:provider-write-manual-closeout-review",
  "npm run verify:provider-write-safe-ledger-assembly",
  "npm run verify:provider-write-controlled-expansion-approval",
]);
mustContainAll("api dockerfile source", content.apiDockerfile, [
  "NODE_ENV=production",
  "WECOM_SANDBOX_ENABLED=false",
  'CMD ["node", "apps/api/dist/main.js"]',
]);
mustContainAll("web dockerfile source", content.webDockerfile, [
  "NODE_ENV=production",
  'CMD ["node", "apps/web/server.js"]',
]);
mustContainAll("production compose source", content.composeProductionExample, [
  "dockerfile: apps/api/Dockerfile",
  "dockerfile: apps/web/Dockerfile",
  "OPERATOR_IDENTITY_PROVIDER: database",
]);
mustContainAll("production canary source", content.productionCanary, [
  "/health/ready",
  "/metrics",
  "--require-real-channel",
  "--allow-degraded",
]);
mustContainAll("production readiness verifier source", content.productionReadinessVerifier, [
  "--env-file",
  "--require-real-channel",
  "REAL_CHANNEL_WEBHOOK_KILL_SWITCH",
]);
mustContainAll("channel runbook verifier source", content.channelRunbookVerifier, [
  "verify:production-canary",
  "verify:production-alerting",
]);

mustContainAll("task plan tracks provider write controlled expansion approval", content.taskPlan, [
  "PR73 - Provider Write Controlled Expansion Approval Gate",
  "verify:provider-write-controlled-expansion-approval",
]);

mustContainAll("progress tracks provider write controlled expansion approval", content.progress, [
  "Started PR73 provider write controlled expansion approval gate",
]);

mustNotContainUnsafeExamples({
  launchRunbook: content.launchRunbook,
  productionReadiness: content.productionReadiness,
  productionStaticCi: content.productionStaticCi,
  productionBranchProtection: content.productionBranchProtection,
  productionProviderWriteApproval: content.productionProviderWriteApproval,
  providerWriteDryRunRehearsal: content.providerWriteDryRunRehearsal,
  providerWriteKillSwitchRehearsal: content.providerWriteKillSwitchRehearsal,
  providerWriteLivePilotPreflight: content.providerWriteLivePilotPreflight,
  providerWriteLivePilotRunLedger: content.providerWriteLivePilotRunLedger,
  providerWriteManualCloseoutReview: content.providerWriteManualCloseoutReview,
  providerWriteSafeLedgerAssembly: content.providerWriteSafeLedgerAssembly,
  providerWriteControlledExpansionApproval: content.providerWriteControlledExpansionApproval,
  providerWriteRequests: content.providerWriteRequests,
  publicApiSurface: content.publicApiSurface,
  productionStaticCiWorkflow: content.productionStaticCiWorkflow,
  productionDeploymentArtifacts: content.productionDeploymentArtifacts,
  productionImageBuilds: content.productionImageBuilds,
  productionImageBuildWorkflow: content.productionImageBuildWorkflow,
  productionContainerSmoke: content.productionContainerSmoke,
  productionContainerSmokeWorkflow: content.productionContainerSmokeWorkflow,
  productionImageSecurity: content.productionImageSecurity,
  productionImageSecurityWorkflow: content.productionImageSecurityWorkflow,
  productionReleaseProvenance: content.productionReleaseProvenance,
  productionReleaseProvenanceWorkflow: content.productionReleaseProvenanceWorkflow,
  productionReleaseEvidence: content.productionReleaseEvidence,
  productionReleaseEvidenceWorkflow: content.productionReleaseEvidenceWorkflow,
  productionChangeApproval: content.productionChangeApproval,
  productionChangeApprovalWorkflow: content.productionChangeApprovalWorkflow,
  productionLaunchBinding: content.productionLaunchBinding,
  productionLaunchBindingWorkflow: content.productionLaunchBindingWorkflow,
  channelRunbook: content.channelRunbook,
  composeProductionExample: content.composeProductionExample,
  taskPlan: content.taskPlan,
  progress: content.progress,
});

if (failures.length > 0) {
  console.error("Production launch verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Production launch verification passed.");

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

function mustContainInOrder(label, haystack, needles) {
  const positions = needles.map((needle) => [needle, haystack.indexOf(needle)]);

  for (const [needle, position] of positions) {
    if (position === -1) {
      failures.push(`${label}: missing ${needle}`);
    }
  }

  for (let index = 1; index < positions.length; index += 1) {
    const [previousNeedle, previousPosition] = positions[index - 1];
    const [currentNeedle, currentPosition] = positions[index];
    if (
      previousPosition !== -1 &&
      currentPosition !== -1 &&
      currentPosition <= previousPosition
    ) {
      failures.push(`${label}: expected ${previousNeedle} before ${currentNeedle}`);
    }
  }
}

function extractPreflightCommands(markdown) {
  const match = markdown.match(/## Preflight Commands[\s\S]*?```bash\n([\s\S]*?)\n```/);
  if (!match) {
    failures.push("launch runbook preflight commands: missing bash command block");
    return "";
  }
  return match[1];
}

function mustNotContainUnsafeExamples(items) {
  for (const [label, haystack] of Object.entries(items)) {
    mustNotContainAny(label, haystack, [
      "dev_operator_key",
      "tenant_1",
      "real_channel_secret_123",
      "tenant_1_operator_key",
    ]);
    mustNotContainSensitiveExample(label, haystack);
  }
}

function mustNotContainAny(label, haystack, needles) {
  for (const needle of needles) {
    if (haystack.includes(needle)) {
      failures.push(`${label}: unexpectedly contains ${needle}`);
    }
  }
}

function mustNotContainSensitiveExample(label, haystack) {
  const patterns = [
    /--operator-api-key=(?!<operator-key>|<admin-operator-key>)[^\s`"']+/i,
    /Authorization:\s*Bearer\s+(?!<operator-key>|<admin-operator-key>)[^\s`"']+/i,
    /--secret=(?!<matching-secret>)[^\s`"']+/i,
    /https?:\/\/[^\s`"']*[?&][^\s`"']*(?:token|api[_-]?key|key|secret|signature|password|credential|auth)[^=\s`"']*=/i,
    /https?:\/\/[^@\s`"']+@[^ \n`"']+/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(haystack)) {
      failures.push(`${label}: contains unsafe concrete example ${pattern.source}`);
    }
  }
}
