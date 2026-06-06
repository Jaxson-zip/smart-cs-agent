const failures = [];
const warnings = [];
const args = parseArgs(process.argv.slice(2));

if (!args.api) {
  failures.push("--api=<url> is required");
}

if (failures.length === 0) {
  await verifyCanary(args);
}

if (failures.length > 0) {
  console.error("Production canary verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  printWarnings("error");
  process.exit(1);
}

console.log("Production canary verification passed.");
printWarnings("log");

async function verifyCanary(options) {
  const baseUrl = trimTrailingSlash(options.api);
  const readiness = await fetchJson(`${baseUrl}/health/ready`, "GET /health/ready", {
    timeoutMs: options.timeoutMs,
  });
  const metricsText = await fetchText(`${baseUrl}/metrics`, "GET /metrics", {
    timeoutMs: options.timeoutMs,
  });
  if (!readiness || metricsText === undefined) return;

  assertReadiness(readiness, options);
  assertMetrics(metricsText, options);
}

function assertReadiness(payload, options) {
  const status = payload?.status;
  if (status === "ok") {
    return;
  }

  if (status === "degraded" && options.allowDegraded) {
    warnings.push("GET /health/ready is degraded but --allow-degraded was set");
    return;
  }

  failures.push(
    `GET /health/ready must return status=ok${options.allowDegraded ? " or degraded" : ""}`,
  );
}

function assertMetrics(metricsText, options) {
  assertNoSensitiveMetricValues(metricsText);

  const metrics = parsePrometheusMetrics(metricsText);
  mustMetricEqual(metrics, "smart_cs_agent_api_up", {}, 1);
  mustMetricEqual(metrics, "smart_cs_agent_database_ready", {}, 1);

  if (metricValue(metrics, "smart_cs_agent_real_channel_webhook_status", {
    status: "misconfigured",
  }) === 1) {
    failures.push(
      'Metric smart_cs_agent_real_channel_webhook_status{status="misconfigured"} must be 0',
    );
  }

  const queueDegraded = metricValue(
    metrics,
    "smart_cs_agent_channel_queue_degraded",
    {},
  );
  if (queueDegraded === 1 && options.allowDegraded) {
    warnings.push(
      "Metric smart_cs_agent_channel_queue_degraded is 1 but --allow-degraded was set",
    );
  } else if (queueDegraded !== undefined) {
    mustMetricEqual(metrics, "smart_cs_agent_channel_queue_degraded", {}, 0);
  } else {
    failures.push("Metric smart_cs_agent_channel_queue_degraded is required");
  }

  mustMetricAtMost(
    metrics,
    "smart_cs_agent_channel_queue_stale_processing_total",
    {},
    options.maxStaleProcessing,
  );
  mustMetricAtMost(
    metrics,
    "smart_cs_agent_channel_queue_oldest_pending_age_seconds",
    {},
    options.maxOldestPendingAgeSeconds,
  );

  if (options.requireRealChannel) {
    mustMetricEqual(metrics, "smart_cs_agent_real_channel_webhook_status", {
      status: "ok",
    }, 1);
    mustMetricEqual(
      metrics,
      "smart_cs_agent_real_channel_webhook_kill_switch_enabled",
      {},
      0,
    );
  }
}

async function fetchJson(url, label, options) {
  const response = await fetchCanary(url, label, options);
  if (!response) return undefined;

  let payload;
  try {
    payload = await response.json();
  } catch {
    failures.push(`${label} returned non-JSON HTTP ${response.status}`);
    return undefined;
  }

  if (!response.ok) {
    failures.push(`${label} returned HTTP ${response.status}`);
    return undefined;
  }

  return payload;
}

async function fetchText(url, label, options) {
  const response = await fetchCanary(url, label, options);
  if (!response) return undefined;

  let text;
  try {
    text = await response.text();
  } catch {
    failures.push(`${label} returned unreadable HTTP ${response.status}`);
    return undefined;
  }

  if (!response.ok) {
    failures.push(`${label} returned HTTP ${response.status}`);
    return undefined;
  }

  return text;
}

async function fetchCanary(url, label, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    return await fetch(url, {
      headers: { Accept: "*/*" },
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error?.name === "AbortError" ? "timed out" : "failed";
    failures.push(`${label} ${reason}`);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function parsePrometheusMetrics(input) {
  const metrics = new Map();
  const metricLinePattern =
    /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = metricLinePattern.exec(line);
    if (!match) continue;
    const [, name, rawLabels = "", rawValue] = match;
    metrics.set(metricKey(name, parseLabels(rawLabels)), Number(rawValue));
  }

  return metrics;
}

function parseLabels(input) {
  if (!input) return {};

  const labels = {};
  const labelPattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = labelPattern.exec(input)) !== null) {
    labels[match[1]] = match[2]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return labels;
}

function mustMetricEqual(metrics, name, labels, expected) {
  const actual = metricValue(metrics, name, labels);
  const rendered = renderMetric(name, labels);
  if (actual === undefined) {
    failures.push(`Metric ${rendered} is required`);
    return;
  }
  if (actual !== expected) {
    failures.push(`Metric ${rendered} must be ${expected}`);
  }
}

function mustMetricAtMost(metrics, name, labels, max) {
  const actual = metricValue(metrics, name, labels);
  const rendered = renderMetric(name, labels);
  if (actual === undefined) {
    failures.push(`Metric ${rendered} is required`);
    return;
  }
  if (actual > max) {
    failures.push(`Metric ${rendered} must be <= ${max}`);
  }
}

function metricValue(metrics, name, labels) {
  return metrics.get(metricKey(name, labels));
}

function metricKey(name, labels) {
  return JSON.stringify([name, Object.entries(labels).sort()]);
}

function renderMetric(name, labels) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return name;
  return `${name}{${entries.map(([key, value]) => `${key}="${value}"`).join(",")}}`;
}

function assertNoSensitiveMetricValues(metricsText) {
  const forbiddenPatterns = [
    /tenant_/i,
    /merchant_/i,
    /must_not_leak/i,
    /real_channel_secret/i,
    /dev_operator_key/i,
    /operator[_-]?api[_-]?key/i,
    /x-smartcs-signature/i,
    /externalConversationId/i,
    /externalMessageId/i,
    /providerPayload/i,
    /rawBody/i,
    /\btaobao\b/i,
    /\bdouyin\b/i,
  ];
  const metricLinePattern =
    /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/;
  const allowedPublicLabelKeys = new Set(["reason", "status"]);

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(metricsText)) {
      failures.push("GET /metrics exposes a forbidden tenant, channel, payload, or secret marker");
      return;
    }
  }

  for (const rawLine of metricsText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = metricLinePattern.exec(line);
    if (!match) continue;

    const labels = parseLabels(match[2] ?? "");
    for (const [key, value] of Object.entries(labels)) {
      if (!allowedPublicLabelKeys.has(key) || hasForbiddenMetricMarker(key) || hasForbiddenMetricMarker(value)) {
        failures.push("GET /metrics exposes a forbidden tenant, channel, payload, or secret marker");
        return;
      }
    }
  }
}

function hasForbiddenMetricMarker(value) {
  return /tenant|merchant|channel|source|customer|message|payload|provider|secret|signature|rawBody|external/i.test(
    value,
  );
}

function parseArgs(values) {
  const parsed = {
    allowDegraded: false,
    api: undefined,
    requireRealChannel: false,
    timeoutMs: 5000,
    maxStaleProcessing: 0,
    maxOldestPendingAgeSeconds: 900,
  };

  for (const value of values) {
    if (value === "--allow-degraded") {
      parsed.allowDegraded = true;
    } else if (value === "--require-real-channel") {
      parsed.requireRealChannel = true;
    } else if (value.startsWith("--api=")) {
      parsed.api = value.slice("--api=".length);
      mustBeUrl(parsed.api, "--api");
    } else if (value.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = parsePositiveInt(value, "--timeout-ms");
    } else if (value.startsWith("--max-stale-processing=")) {
      parsed.maxStaleProcessing = parseNonNegativeInt(
        value,
        "--max-stale-processing",
      );
    } else if (value.startsWith("--max-oldest-pending-age-seconds=")) {
      parsed.maxOldestPendingAgeSeconds = parseNonNegativeInt(
        value,
        "--max-oldest-pending-age-seconds",
      );
    } else {
      failures.push(`Unknown argument: ${redactArgument(value)}`);
    }
  }

  return parsed;
}

function mustBeUrl(value, label) {
  try {
    new URL(value);
  } catch {
    failures.push(`${label} must be a valid URL`);
  }
}

function parsePositiveInt(argument, label) {
  const value = argumentValue(argument);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    failures.push(`${label} must be a positive integer`);
    return 1;
  }
  return parsed;
}

function parseNonNegativeInt(argument, label) {
  const value = argumentValue(argument);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    failures.push(`${label} must be a non-negative integer`);
    return 0;
  }
  return parsed;
}

function argumentValue(argument) {
  return argument.slice(argument.indexOf("=") + 1);
}

function redactArgument(value) {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) {
    if (!value.startsWith("--") || value.includes("://") || value.includes("@")) {
      return "<redacted>";
    }
    return value;
  }
  return `${value.slice(0, separatorIndex)}=<redacted>`;
}

function trimTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

function printWarnings(method) {
  if (warnings.length === 0) return;
  console[method]("Warnings:");
  for (const warning of warnings) {
    console[method](`- ${warning}`);
  }
}
