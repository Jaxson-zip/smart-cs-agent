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
  productionAlertingVerifier: "scripts/verify-production-alerting.mjs",
  productionCanary: "scripts/verify-production-canary.mjs",
  productionReadinessVerifier: "scripts/verify-production-readiness.mjs",
  channelRunbookVerifier: "scripts/verify-channel-queue-runbook.mjs",
  packageJson: "package.json",
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
  "verify:production-alerting",
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
  "npm run verify:production-readiness",
  "--env-file=<secure-production-env>",
  "--require-real-channel",
  "npm run verify:production-canary",
  "--max-stale-processing=0",
  "--max-oldest-pending-age-seconds=900",
  "npm run verify:production-alerting",
  "npm run verify:channel-runbook",
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

mustContainAll("cross-verifier references", content.launchRunbook, [
  "verify:production-readiness",
  "verify:production-canary",
  "verify:production-alerting",
  "verify:channel-runbook",
]);
mustContainAll("production launch verifier source", content.productionAlertingVerifier, [
  "verify:production-alerting",
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
  channelRunbook: content.channelRunbook,
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
