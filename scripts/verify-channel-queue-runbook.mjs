import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const files = {
  runbook: "docs/deploy/channel-queue-runbook.md",
  envExample: ".env.example",
  publicApi: "docs/deploy/public-api-surface.md",
  productionReadiness: "docs/deploy/production-readiness.md",
  sandboxCiExample: "docs/deploy/sandbox-ci.yml.example",
  healthController: "apps/api/src/health/health.controller.ts",
  channelController: "apps/api/src/channels/channel-events.controller.ts",
  channelService: "apps/api/src/channels/channel-event-review.service.ts",
  webMetricsRoute: "apps/web/src/app/api/operator/channel-events/metrics/route.ts",
  webOperationAuditsRoute: "apps/web/src/app/api/operator/channel-events/operation-audits/route.ts",
  webAuditSummaryRoute: "apps/web/src/app/api/operator/channel-events/audit-summary/route.ts",
  webRecoverRoute: "apps/web/src/app/api/operator/channel-events/recover-stale/route.ts",
  realChannelController: "apps/api/src/channels/real-channel.controller.ts",
  realChannelRateLimitService: "apps/api/src/channels/real-channel-rate-limit.service.ts",
  apiConfig: "apps/api/src/config/api-config.ts",
};

const required = [];

function readRequired(label, relativePath) {
  const absolutePath = join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    required.push(`${label}: missing file ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

function mustContain(label, haystack, needle) {
  if (!haystack.includes(needle)) {
    required.push(`${label}: missing ${needle}`);
  }
}

function mustContainAll(label, haystack, needles) {
  for (const needle of needles) {
    mustContain(label, haystack, needle);
  }
}

function mustNotContain(label, haystack, needle) {
  if (haystack.includes(needle)) {
    required.push(`${label}: unexpectedly contains ${needle}`);
  }
}

function sliceBetween(label, haystack, startNeedle, endNeedle) {
  const start = haystack.indexOf(startNeedle);
  if (start === -1) {
    required.push(`${label}: missing start marker ${startNeedle}`);
    return "";
  }

  const end = haystack.indexOf(endNeedle, start + startNeedle.length);
  if (end === -1) {
    required.push(`${label}: missing end marker ${endNeedle}`);
    return haystack.slice(start);
  }

  return haystack.slice(start, end);
}

const endpoints = [
  "/health/ready",
  "/v1/channel-events/metrics",
  "/v1/channel-events/operation-audits",
  "/v1/channel-events/audit-summary",
  "/v1/channel-events/recover-stale",
  "/api/operator/channel-events/metrics",
  "/api/operator/channel-events/operation-audits",
  "/api/operator/channel-events/audit-summary",
  "/api/operator/channel-events/recover-stale",
  "/v1/channels/:channel/webhook/events",
];

const queueEnvVars = [
  "CHANNEL_QUEUE_PENDING_WARN_THRESHOLD",
  "CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS",
  "CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD",
  "CHANNEL_QUEUE_STALE_AFTER_MINUTES",
];

const envVars = [
  ...queueEnvVars,
  "REAL_CHANNEL_WEBHOOKS_ENABLED",
  "REAL_CHANNEL_WEBHOOK_SECRETS",
  "REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS",
  "REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE",
];

const degradedReasons = [
  "pending_count_above_threshold",
  "oldest_pending_age_above_threshold",
  "stale_processing_above_threshold",
];

const safetyBoundaries = [
  "must not call AgentService",
  "must not create cases",
  "must not execute actions",
  "must not send customer-visible replies",
  "must not expose tenant IDs",
  "must not expose customer messages",
  "must not expose provider payloads",
  "must not expose external conversation IDs",
  "must not expose external message IDs",
  "must not expose operator API keys",
  "must not expose secrets",
  "HTTP 429",
  "must not write replay receipts",
  "must not write normalized channel events",
];

mustContainAll("runbook endpoints", content.runbook, endpoints);
mustContainAll("runbook env vars", content.runbook, envVars);
mustContainAll("runbook degraded reasons", content.runbook, degradedReasons);
mustContainAll("runbook safety boundaries", content.runbook, safetyBoundaries);
mustContainAll("runbook response states", content.runbook, [
  "ok",
  "degraded",
  "unhealthy",
  "source-wide aggregate",
  "tenant-scoped",
  "pending",
  "processing",
  "replayed",
  "ignored",
]);
mustContainAll("runbook operations", content.runbook, [
  "Check readiness",
  "Check queue metrics",
  "Recover stale processing claims",
  "Review recent recovery records",
  "Recheck readiness",
  "Review queue audit summary",
  "no longer than 24 hours",
  "Intake Rate Limit",
  "Production Intake Gates",
  "fail closed",
  "per-process",
]);

mustContainAll(".env.example", content.envExample, envVars);
mustContainAll("sandbox CI example", content.sandboxCiExample, envVars);
mustContainAll("public API surface endpoints", content.publicApi, endpoints);
mustContainAll("public API surface safety", content.publicApi, [
  "Real-channel metrics are read-only",
  "Real-channel stale recovery is admin-only",
  "Real-channel queue operation audits are admin-only",
  "Real-channel queue audit summaries are admin-only",
  "Readiness may include aggregate real-channel queue health",
  "bounded windows up to 24 hours",
  "REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE",
  "HTTP 429 responses must not write replay receipts",
  "Production real-channel webhook intake fails closed",
  "per process",
]);
mustContainAll("production readiness intake gates", content.productionReadiness, [
  "PR26 Production Real-Channel Intake Gates",
  "NODE_ENV=production",
  "REAL_CHANNEL_WEBHOOKS_ENABLED=true",
  "REAL_CHANNEL_WEBHOOK_SECRETS",
  "REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE",
  "REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS",
  "CHANNEL_QUEUE_PENDING_WARN_THRESHOLD",
  "CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS",
  "CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD",
  "CHANNEL_QUEUE_STALE_AFTER_MINUTES",
]);

mustContainAll("api config rate limit", content.apiConfig, [
  "REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE",
  "REAL_CHANNEL_WEBHOOKS_ENABLED",
  "REAL_CHANNEL_WEBHOOK_SECRETS",
  "REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS",
  "CHANNEL_QUEUE_PENDING_WARN_THRESHOLD",
  "productionRealChannelIntakeIssues",
  "realChannelWebhookRateLimitPerMinute",
  "realChannelWebhooksEnabled",
  ".min(0)",
]);
mustContainAll("real channel controller rate limit", content.realChannelController, [
  "RealChannelRateLimitService",
  "this.rateLimit.assertAllowed",
  "channel: verified.channel",
  "tenantId: verified.tenantId",
]);
mustContainAll("real channel rate limit service", content.realChannelRateLimitService, [
  "REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE",
  "HttpStatus.TOO_MANY_REQUESTS",
  "JSON.stringify([input.channel, input.tenantId])",
  "cleanupExpiredBuckets",
]);

mustContainAll("health controller env vars", content.healthController, queueEnvVars);
mustContainAll("channel controller routes", content.channelController, [
  '@Controller("v1/channel-events")',
  '@Get("metrics")',
  '@Get("operation-audits")',
  '@Get("audit-summary")',
  '@Post("recover-stale")',
]);
mustContainAll("channel service degraded reasons", content.channelService, degradedReasons);
mustContainAll("channel service recovery scope", content.channelService, [
  "recoverStaleProcessing",
  "listQueueOperationAudits",
  "getQueueAuditSummary",
  "real_channel_event_processing_recovered",
  "reviewStatus: PROCESSING_REVIEW_STATUS",
  "reviewStatus: PENDING_REVIEW_STATUS",
]);

const recoveryBody = sliceBetween(
  "channel service recovery body",
  content.channelService,
  "async recoverStaleProcessing",
  "async getQueueMetrics",
);
mustContainAll("channel service recovery body", recoveryBody, [
  "reviewedBy: null",
  "reviewedAt: null",
  "action: RECOVERY_AUDIT_ACTION",
]);
for (const forbidden of [
  "agentService.decide",
  "afterSalesCase.create",
  "caseMessage.create",
  "caseAction.create",
  "sendMessage",
]) {
  mustNotContain("channel service recovery body", recoveryBody, forbidden);
}

mustContainAll("web metrics BFF", content.webMetricsRoute, [
  "/v1/channel-events/metrics",
  "pendingCount",
  "processingCount",
  "staleProcessingCount",
  "oldestPendingAgeSeconds",
]);
mustContainAll("web operation audits BFF", content.webOperationAuditsRoute, [
  "sessionResult.session.role !== \"admin\"",
  "/v1/channel-events/operation-audits",
  "Channel event operation audits require admin permission",
  "recoveredCount",
  "queueHealthyAfter",
]);
mustContainAll("web audit summary BFF", content.webAuditSummaryRoute, [
  "sessionResult.session.role !== \"admin\"",
  "/v1/channel-events/audit-summary",
  "Channel event audit summary requires admin permission",
  "replayedCount",
  "ignoredCount",
  "recoveryRunCount",
  "recoveredEventCount",
]);
mustContainAll("web recover BFF", content.webRecoverRoute, [
  "sessionResult.session.role !== \"admin\"",
  "/v1/channel-events/recover-stale",
  "Channel event recovery requires admin permission",
]);

if (required.length > 0) {
  console.error("Channel queue runbook verification failed:");
  for (const item of required) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log("Channel queue runbook verification passed.");
