import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const files = {
  alertingGuide: "docs/deploy/production-alerting.md",
  prometheusRules: "docs/deploy/production-alerts.prometheus.yml.example",
  canarySchedule: "docs/deploy/production-canary-schedule.yml.example",
  productionReadiness: "docs/deploy/production-readiness.md",
  channelRunbook: "docs/deploy/channel-queue-runbook.md",
  packageJson: "package.json",
};

const content = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => [
    label,
    readRequired(label, relativePath),
  ]),
);

mustContainAll("package scripts", content.packageJson, [
  "verify:production-alerting",
  "scripts/verify-production-alerting.mjs",
]);

mustContainAll("alerting guide", content.alertingGuide, [
  "PR33 Production Alerting Pack",
  "Prometheus alert rules",
  "Canary schedule",
  'job="smart-cs-agent"',
  "npm run verify:production-canary",
  "--require-real-channel",
  "--max-stale-processing=0",
  "--max-oldest-pending-age-seconds=900",
  "No operator API key",
  "Do not page on customer-visible automation from these alerts alone",
  "must not include tenant IDs",
  "must not include customer messages",
  "must not include provider payloads",
  "must not include operator API keys",
  "must not include webhook secrets",
]);

mustContainAll("prometheus alert rules file", content.prometheusRules, [
  "groups:",
  "smart-cs-agent-production",
]);
mustDefinePrometheusAlert("SmartCsAgentApiDown", {
  expr:
    'up{job="smart-cs-agent"} == 0 or absent(smart_cs_agent_api_up{job="smart-cs-agent"})',
  duration: "1m",
  severity: "critical",
  runbook: "docs/deploy/channel-queue-runbook.md",
});
mustDefinePrometheusAlert("SmartCsAgentDatabaseDown", {
  expr: "smart_cs_agent_database_ready != 1",
  duration: "1m",
  severity: "critical",
  runbook: "docs/deploy/channel-queue-runbook.md",
});
mustDefinePrometheusAlert("SmartCsAgentRealChannelMisconfigured", {
  expr: 'smart_cs_agent_real_channel_webhook_status{status="misconfigured"} == 1',
  duration: "1m",
  severity: "critical",
  runbook: "docs/deploy/production-alerting.md",
});
mustDefinePrometheusAlert("SmartCsAgentRealChannelKillSwitchEnabled", {
  expr: "smart_cs_agent_real_channel_webhook_kill_switch_enabled == 1",
  duration: "1m",
  severity: "warning",
  runbook: "docs/deploy/production-alerting.md",
});
mustDefinePrometheusAlert("SmartCsAgentChannelQueueDegraded", {
  expr: "smart_cs_agent_channel_queue_degraded == 1",
  duration: "5m",
  severity: "warning",
  runbook: "docs/deploy/channel-queue-runbook.md",
});
mustDefinePrometheusAlert("SmartCsAgentStaleProcessingClaims", {
  expr: "smart_cs_agent_channel_queue_stale_processing_total > 0",
  duration: "5m",
  severity: "warning",
  runbook: "docs/deploy/channel-queue-runbook.md",
});
mustDefinePrometheusAlert("SmartCsAgentOldestPendingTooOld", {
  expr: "smart_cs_agent_channel_queue_oldest_pending_age_seconds > 900",
  duration: "5m",
  severity: "warning",
  runbook: "docs/deploy/channel-queue-runbook.md",
});
mustNotContainSensitiveMarkers("prometheus alert rules", content.prometheusRules);

mustContainAll("canary schedule", content.canarySchedule, [
  "name: smart-cs-agent production canary",
  "schedule:",
  "*/5 * * * *",
  "workflow_dispatch:",
  "SMART_CS_API_URL",
  "npm ci",
  "npm run verify:production-canary",
  '--api="$SMART_CS_API_URL"',
  "--require-real-channel",
  "--timeout-ms=5000",
  "--max-stale-processing=0",
  "--max-oldest-pending-age-seconds=900",
]);
mustUseSecretBackedCanaryApiUrl("canary schedule", content.canarySchedule);
mustNotContainSensitiveMarkers("canary schedule", content.canarySchedule);

mustContainAll("production readiness", content.productionReadiness, [
  "PR33 Production Alerting Pack",
  "docs/deploy/production-alerting.md",
  "docs/deploy/production-alerts.prometheus.yml.example",
  "docs/deploy/production-canary-schedule.yml.example",
  "npm run verify:production-alerting",
]);

mustContainAll("channel runbook", content.channelRunbook, [
  "Production alerting",
  "docs/deploy/production-alerting.md",
  "SmartCsAgentApiDown",
  "SmartCsAgentDatabaseDown",
  "SmartCsAgentRealChannelMisconfigured",
  "SmartCsAgentStaleProcessingClaims",
]);

if (failures.length > 0) {
  console.error("Production alerting verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Production alerting verification passed.");

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

function mustDefinePrometheusAlert(alertName, expected) {
  const block = findPrometheusAlertBlock(content.prometheusRules, alertName);
  const label = `prometheus alert ${alertName}`;

  if (!block) {
    failures.push(`${label}: missing enabled alert block`);
    return;
  }

  mustContainYamlLine(label, block, `- alert: ${alertName}`);
  mustContainYamlLine(label, block, `expr: ${expected.expr}`);
  mustContainYamlLine(label, block, `for: ${expected.duration}`);
  mustContainYamlLine(label, block, `severity: ${expected.severity}`);
  mustContainYamlLine(label, block, `runbook: ${expected.runbook}`);
}

function findPrometheusAlertBlock(yaml, alertName) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `- alert: ${alertName}`);
  if (start === -1) {
    return "";
  }

  const next = lines.findIndex(
    (line, index) => index > start && /^\s*-\s+alert:\s+\S+/.test(line),
  );
  return lines.slice(start, next === -1 ? undefined : next).join("\n");
}

function mustContainYamlLine(label, block, expectedLine) {
  const lines = block.split(/\r?\n/).map((line) => line.trim());
  if (!lines.includes(expectedLine)) {
    failures.push(`${label}: missing enabled YAML line ${expectedLine}`);
  }
}

function mustUseSecretBackedCanaryApiUrl(label, yaml) {
  const apiArgs = [...yaml.matchAll(/--api=(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s\\\r\n]+)/g)];
  if (apiArgs.length === 0) {
    failures.push(`${label}: missing --api argument`);
    return;
  }

  for (const match of apiArgs) {
    const rawValue = match[0].replace(/^--api=/, "");
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (value !== "$SMART_CS_API_URL") {
      failures.push(`${label}: --api must use SMART_CS_API_URL instead of a hardcoded value`);
      continue;
    }

    if (/^https?:\/\//i.test(value) || value.includes("?") || value.includes("@")) {
      failures.push(`${label}: --api must not hardcode URLs, credentials, or query strings`);
    }
  }
}

function mustNotContainSensitiveMarkers(label, haystack) {
  const normalized = haystack.toLowerCase();
  const patterns = [
    /tenant[_-]?id/,
    /tenant_/,
    /merchant[_-]?id/,
    /customer[_-]?message/,
    /provider[_-]?payload/,
    /operator[_-]?api[_-]?keys?/,
    /webhook[_-]?secrets?/,
    /x[_-]?smartcs[_-]?signature/,
    /signature/,
    /raw[_-]?(request[_-]?)?body/,
    /full[_-]?metric[_-]?body/,
    /external[_-]?conversation[_-]?id/,
    /external[_-]?message[_-]?id/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(normalized)) {
      failures.push(`${label}: unexpectedly contains sensitive marker ${pattern.source}`);
    }
  }
}
