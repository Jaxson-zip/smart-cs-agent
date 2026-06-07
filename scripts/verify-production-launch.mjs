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
  "SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE",
  "SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_REQUIRE_PASS=true",
  "npm run verify:channel-runbook",
]);

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
  "production-provider-write-approval-artifacts",
  "human_review_required",
  "approvalStatus",
  "artifactBindings",
  "providerWriteKillSwitchReady",
  "automaticProviderWritesEnabled",
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
  "smart-cs-agent.production-provider-write-approval.v1",
  "human_review_required",
  "approvalStatus",
  "artifactBindings",
  "does not call provider APIs",
  "does not execute provider writes",
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
mustContainAll("public API provider write routes", content.publicApiSurface, [
  "POST /v2/provider-writes/request",
  "GET /v2/provider-writes/requests",
  "POST /v2/provider-writes/requests/:id/approve",
  "POST /v2/provider-writes/requests/:id/reject",
  "POST /v2/provider-writes/requests/:id/execution-attempts",
  "GET /v2/provider-writes/execution-attempts",
  "POST /api/operator/provider-writes/requests",
  "GET /api/operator/provider-writes/requests",
  "POST /api/operator/provider-writes/requests/:id/approve",
  "POST /api/operator/provider-writes/requests/:id/reject",
  "POST /api/operator/provider-writes/requests/:id/execution-attempts",
  "GET /api/operator/provider-writes/execution-attempts",
  "ProviderWriteRequest",
  "ProviderWriteExecutionAttempt",
  "ProviderWriteExecutionAttemptListItem",
  "idempotencyKeyHash",
  "payloadEscrowOpened=false",
  "providerMutationExecuted=false",
  "customerVisibleMessageSent=false",
  "networkExecution=not_started",
]);
mustContainAll("production static CI workflow", content.productionStaticCiWorkflow, [
  "permissions:",
  "contents: read",
  "pull_request:",
  "push:",
  "workflow_dispatch:",
  "npm ci",
  "npm run verify:production-static-ci",
  "npm run verify:production-launch",
  "npm run verify:provider-write-requests",
  "npm run verify:provider-write-approval-state",
  "npm run verify:provider-write-execution-attempts",
  "npm run verify:provider-write-execution-attempt-visibility",
  "npm run verify:provider-write-payload-escrow-boundary",
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

mustNotContainUnsafeExamples({
  launchRunbook: content.launchRunbook,
  productionReadiness: content.productionReadiness,
  productionStaticCi: content.productionStaticCi,
  productionBranchProtection: content.productionBranchProtection,
  productionProviderWriteApproval: content.productionProviderWriteApproval,
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
