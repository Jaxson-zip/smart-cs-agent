import assert from "node:assert";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("production canary passes when readiness and public metrics are healthy", async () => {
  await withCanaryServer(
    {
      readiness: {
        status: "ok",
        service: "smart-cs-agent-api",
        timestamp: "2026-06-06T08:00:00.000Z",
        checks: {
          database: { status: "ok" },
          channelWebhooks: {
            status: "ok",
            enabled: true,
            allowlistedPairCount: 1,
          },
          channelQueue: {
            status: "ok",
            pendingCount: 0,
            processingCount: 0,
            staleProcessingCount: 0,
            oldestPendingAgeSeconds: null,
            reasons: [],
          },
        },
      },
      metrics: [
        "smart_cs_agent_api_up 1",
        "smart_cs_agent_database_ready 1",
        "smart_cs_agent_real_channel_webhook_status{status=\"ok\"} 1",
        "smart_cs_agent_real_channel_webhook_status{status=\"misconfigured\"} 0",
        "smart_cs_agent_real_channel_webhook_kill_switch_enabled 0",
        "smart_cs_agent_channel_queue_degraded 0",
        "smart_cs_agent_channel_queue_stale_processing_total 0",
        "smart_cs_agent_channel_queue_oldest_pending_age_seconds 0",
      ].join("\n"),
    },
    async (apiUrl) => {
      const result = await execCanary([
        `--api=${apiUrl}`,
        "--require-real-channel",
      ]);

      assert.match(result.stdout, /Production canary verification passed\./);
      assert.strictEqual(result.stderr, "");
    },
  );
});

test("production canary fails on degraded queue unless explicitly allowed", async () => {
  await withCanaryServer(
    {
      readiness: {
        status: "degraded",
        checks: {
          database: { status: "ok" },
          channelQueue: {
            status: "degraded",
            reasons: ["pending_count_above_threshold"],
          },
        },
      },
      metrics: [
        "smart_cs_agent_api_up 1",
        "smart_cs_agent_database_ready 1",
        "smart_cs_agent_real_channel_webhook_status{status=\"misconfigured\"} 0",
        "smart_cs_agent_channel_queue_degraded 1",
        "smart_cs_agent_channel_queue_stale_processing_total 0",
        "smart_cs_agent_channel_queue_oldest_pending_age_seconds 0",
      ].join("\n"),
    },
    async (apiUrl) => {
      const failed = await execCanaryFailure([`--api=${apiUrl}`]);
      assert.match(
        failed.stderr,
        /GET \/health\/ready must return status=ok/,
      );
      assert.match(
        failed.stderr,
        /Metric smart_cs_agent_channel_queue_degraded must be 0/,
      );

      const allowed = await execCanary([`--api=${apiUrl}`, "--allow-degraded"]);
      assert.match(allowed.stdout, /Production canary verification passed\./);
      assert.match(allowed.stdout, /Warnings:/);
      assert.match(allowed.stdout, /GET \/health\/ready is degraded/);
      assert.match(allowed.stdout, /smart_cs_agent_channel_queue_degraded is 1/);
    },
  );
});

test("production canary requires real-channel intake to be open when requested", async () => {
  await withCanaryServer(
    {
      readiness: {
        status: "ok",
        checks: {
          database: { status: "ok" },
          channelWebhooks: {
            status: "disabled_by_kill_switch",
            enabled: false,
          },
        },
      },
      metrics: [
        "smart_cs_agent_api_up 1",
        "smart_cs_agent_database_ready 1",
        "smart_cs_agent_real_channel_webhook_status{status=\"ok\"} 0",
        "smart_cs_agent_real_channel_webhook_status{status=\"misconfigured\"} 0",
        "smart_cs_agent_real_channel_webhook_kill_switch_enabled 1",
        "smart_cs_agent_channel_queue_degraded 0",
        "smart_cs_agent_channel_queue_stale_processing_total 0",
        "smart_cs_agent_channel_queue_oldest_pending_age_seconds 0",
      ].join("\n"),
    },
    async (apiUrl) => {
      const failed = await execCanaryFailure([
        `--api=${apiUrl}`,
        "--require-real-channel",
      ]);

      assert.match(
        failed.stderr,
        /smart_cs_agent_real_channel_webhook_status\{status="ok"\} must be 1/,
      );
      assert.match(
        failed.stderr,
        /smart_cs_agent_real_channel_webhook_kill_switch_enabled must be 0/,
      );
    },
  );
});

test("production canary fails closed without echoing sensitive metric values", async () => {
  await withCanaryServer(
    {
      readiness: {
        status: "ok",
        checks: {
          database: { status: "ok" },
        },
      },
      metrics: [
        "smart_cs_agent_api_up 1",
        "smart_cs_agent_database_ready 1",
        "smart_cs_agent_real_channel_webhook_status{status=\"misconfigured\"} 0",
        "smart_cs_agent_channel_queue_degraded 0",
        "smart_cs_agent_channel_queue_stale_processing_total 0",
        "smart_cs_agent_channel_queue_oldest_pending_age_seconds 0",
        "leaky_metric{tenantId=\"acme\",channel=\"wecom\",secret=\"plain\"} 1",
      ].join("\n"),
    },
    async (apiUrl) => {
      const failed = await execCanaryFailure([`--api=${apiUrl}`]);

      assert.match(
        failed.stderr,
        /GET \/metrics exposes a forbidden tenant, channel, payload, or secret marker/,
      );
      assert.ok(!failed.stderr.includes("acme"));
      assert.ok(!failed.stderr.includes("wecom"));
      assert.ok(!failed.stderr.includes("plain"));
    },
  );
});

test("production canary redacts unknown argument values", async () => {
  const failed = await execCanaryFailure([
    "--unknown=must_not_leak",
    "https://user:secret@example.com",
  ]);

  assert.match(failed.stderr, /Unknown argument: --unknown=<redacted>/);
  assert.match(failed.stderr, /Unknown argument: <redacted>/);
  assert.ok(!failed.stderr.includes("must_not_leak"));
  assert.ok(!failed.stderr.includes("user:secret"));
  assert.ok(!failed.stderr.includes("example.com"));
});

async function withCanaryServer({ readiness, metrics }, callback) {
  const server = createServer((req, res) => {
    if (req.url === "/health/ready") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(readiness));
      return;
    }

    if (req.url === "/metrics") {
      res.setHeader("Content-Type", "text/plain; version=0.0.4");
      res.end(`${metrics}\n`);
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function execCanary(args) {
  return execFileAsync(process.execPath, [
    "scripts/verify-production-canary.mjs",
    ...args,
  ]);
}

async function execCanaryFailure(args) {
  try {
    const result = await execCanary(args);
    assert.fail(`Expected canary to fail, got stdout: ${result.stdout}`);
  } catch (error) {
    assert.notStrictEqual(error.code, 0);
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}
