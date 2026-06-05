import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const payloadDir = path.join(repoRoot, "docs/demo/wecom-sandbox-payloads");

const scenarios = [
  {
    file: "01-address-change-low.json",
    expected: {
      category: "address_change",
      riskLevel: "low",
      automationMode: "auto_execute",
    },
  },
  {
    file: "02-logistics-inquiry-low.json",
    expected: {
      category: "logistics",
      riskLevel: "low",
      automationMode: "auto_execute",
    },
  },
  {
    file: "03-damage-compensation-low.json",
    expected: {
      category: "damage_compensation",
      riskLevel: "low",
      automationMode: "auto_execute",
    },
  },
  {
    file: "04-compensation-rejected-medium.json",
    expected: {
      category: "compensation_rejected",
      riskLevel: "medium",
      automationMode: "human_confirm",
    },
  },
  {
    file: "05-complaint-escalation-high.json",
    expected: {
      category: "complaint_escalation",
      riskLevel: "high",
      automationMode: "human_takeover",
    },
  },
];

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split("=");
  args.set(key, value ?? true);
}

const apiBase = String(args.get("--api") ?? process.env.API_URL ?? "http://localhost:4100").replace(/\/$/, "");
const tenantId = String(args.get("--tenant") ?? "demo_tenant");
const operatorId = String(args.get("--operator") ?? "sandbox_operator");
const operatorApiKey = args.get("--operator-api-key") ?? process.env.OPERATOR_API_KEY;
const keepIds = args.has("--keep-ids");
const timeoutMs = Number(args.get("--timeout-ms") ?? 5000);
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "x-tenant-id": tenantId,
        "x-operator-id": operatorId,
        ...(operatorApiKey ? { authorization: `Bearer ${operatorApiKey}` } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const rawBody = await response.text();
    let body;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      body = rawBody;
    }

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} ${response.statusText} from ${url}`);
      error.body = body;
      throw error;
    }

    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Timed out after ${timeoutMs}ms while calling ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function addRunSuffix(payload, index) {
  if (keepIds) return payload;

  const suffix = `${runId}_${String(index + 1).padStart(2, "0")}`;
  return {
    ...payload,
    externalConversationId: `${payload.externalConversationId}_${suffix}`,
    externalMessageId: `${payload.externalMessageId}_${suffix}`,
  };
}

function compare(actual, expected) {
  return {
    category: actual.category === expected.category,
    riskLevel: actual.riskLevel === expected.riskLevel,
    automationMode: actual.automationMode === expected.automationMode,
  };
}

async function main() {
  console.log(`WeCom sandbox smoke: ${apiBase}`);

  try {
    const health = await requestJson(`${apiBase}/health`);
    if (health?.status !== "ok") {
      throw new Error(`Unexpected /health response: ${formatJson(health)}`);
    }
    console.log(`Health ok: ${health.service ?? "api"}`);
  } catch (error) {
    console.error(`API is not reachable at ${apiBase}.`);
    console.error("Start it with: npm.cmd run dev:api");
    console.error(`Health check failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  try {
    const rules = await requestJson(`${apiBase}/v1/rules/${tenantId}`);
    console.log(
      `Rules ok: tenant=${tenantId}, couponCompensationLimit=${rules?.couponCompensationLimit ?? "unknown"}`,
    );
  } catch (error) {
    console.error(`Rules API failed for tenant ${tenantId}.`);
    console.error("Check Postgres, DATABASE_URL, migrations, and seed data:");
    console.error("  docker compose up -d postgres");
    console.error("  npm.cmd run db:migrate");
    console.error("  npm.cmd run db:seed");
    console.error(`Rules check failed: ${error.message}`);
    if (error.body) console.error(formatJson(error.body));
    process.exitCode = 1;
    return;
  }

  const rows = [];
  let failures = 0;

  for (const [index, scenario] of scenarios.entries()) {
    const payloadPath = path.join(payloadDir, scenario.file);
    const payload = addRunSuffix(JSON.parse(await fs.readFile(payloadPath, "utf8")), index);

    try {
      const result = await requestJson(`${apiBase}/v1/wecom/events`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const actual = result?.afterSalesCase;
      const matches = actual ? compare(actual, scenario.expected) : {};
      const passed = Boolean(matches.category && matches.riskLevel && matches.automationMode);
      if (!passed) failures += 1;

      rows.push({
        scenario: scenario.file,
        category: `${actual?.category ?? "missing"} ${matches.category ? "OK" : "FAIL"}`,
        riskLevel: `${actual?.riskLevel ?? "missing"} ${matches.riskLevel ? "OK" : "FAIL"}`,
        automationMode: `${actual?.automationMode ?? "missing"} ${matches.automationMode ? "OK" : "FAIL"}`,
        expected: `${scenario.expected.category}/${scenario.expected.riskLevel}/${scenario.expected.automationMode}`,
      });
    } catch (error) {
      failures += 1;
      rows.push({
        scenario: scenario.file,
        category: "request failed",
        riskLevel: "request failed",
        automationMode: "request failed",
        expected: `${scenario.expected.category}/${scenario.expected.riskLevel}/${scenario.expected.automationMode}`,
      });
      console.error(`Scenario ${scenario.file} failed: ${error.message}`);
      if (error.body) console.error(formatJson(error.body));
    }
  }

  console.table(rows);

  if (failures > 0) {
    console.error(`${failures} scenario(s) failed. Check API logs, Postgres, migrations, and seed state.`);
    process.exitCode = 1;
    return;
  }

  console.log("All five sandbox scenarios matched expected category/riskLevel/automationMode.");
}

main().catch((error) => {
  console.error("Smoke script failed before scenarios could run.");
  console.error(error.message);
  process.exitCode = 1;
});
