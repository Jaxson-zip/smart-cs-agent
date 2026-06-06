import { ServiceUnavailableException } from "@nestjs/common";
import assert from "node:assert";
import { describe, it } from "node:test";
import { ChannelWebhookSecurityService } from "../channels/channel-webhook-security.service";
import type { ChannelEventReviewService } from "../channels/channel-event-review.service";
import { PrismaService } from "../prisma/prisma.service";
import { HealthController, HealthReadinessController } from "./health.controller";

describe("HealthController", () => {
  it("keeps liveness lightweight", () => {
    const controller = new HealthController();

    const response = controller.getHealth();

    assert.strictEqual(response.status, "ok");
    assert.strictEqual(response.service, "smart-cs-agent-api");
  });

  it("reports readiness when the database responds", async () => {
    let queryCount = 0;
    const prisma = {
      $queryRaw: async () => {
        queryCount += 1;
        return [{ "?column?": 1 }];
      },
    } as unknown as PrismaService;
    const controller = new HealthReadinessController(
      prisma,
      new ChannelWebhookSecurityService(receiptStore()),
      queueHealthService(),
    );

    const response = await controller.getReadiness();

    assert.strictEqual(queryCount, 1);
    assert.strictEqual(response.status, "ok");
    assert.deepStrictEqual(response.checks.database, { status: "ok" });
    assert.strictEqual(response.checks.channelWebhooks?.status, "disabled");
  });

  it("returns a 503 readiness failure when the database is unavailable", async () => {
    const prisma = {
      $queryRaw: async () => {
        throw new Error("connection refused");
      },
    } as unknown as PrismaService;
    const controller = new HealthReadinessController(
      prisma,
      new ChannelWebhookSecurityService(receiptStore()),
      queueHealthService(),
    );

    await assert.rejects(
      () => controller.getReadiness(),
      (error: unknown) => {
        assert.ok(error instanceof ServiceUnavailableException);
        assert.strictEqual(error.getStatus(), 503);
        const response = error.getResponse() as {
          status: string;
          service: string;
          timestamp: string;
          checks: {
            database: {
              status: string;
              message: string;
            };
          };
        };
        assert.match(response.timestamp, /^\d{4}-\d{2}-\d{2}T/);
        assert.deepStrictEqual(response, {
          status: "unhealthy",
          service: "smart-cs-agent-api",
          timestamp: response.timestamp,
          checks: {
            database: {
              status: "unhealthy",
              message: "Database readiness check failed",
            },
            channelWebhooks: {
              status: "disabled",
              enabled: false,
              configuredChannels: [],
              message: "Real channel webhooks are disabled",
            },
          },
        });
        return true;
      },
    );
  });

  it("reports real channel webhook readiness without leaking secrets", async () => {
    const previousEnabled = process.env.REAL_CHANNEL_WEBHOOKS_ENABLED;
    const previousSecrets = process.env.REAL_CHANNEL_WEBHOOK_SECRETS;
    process.env.REAL_CHANNEL_WEBHOOKS_ENABLED = "true";
    process.env.REAL_CHANNEL_WEBHOOK_SECRETS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        secret: "must_not_leak",
      },
    ]);
    try {
      const prisma = {
        $queryRaw: async () => [{ "?column?": 1 }],
      } as unknown as PrismaService;
      const controller = new HealthReadinessController(
        prisma,
        new ChannelWebhookSecurityService(receiptStore()),
        queueHealthService(),
      );

      const response = await controller.getReadiness();

      assert.deepStrictEqual(response.checks.channelWebhooks, {
        status: "ok",
        enabled: true,
        configuredChannels: ["taobao"],
      });
      assert.ok(!JSON.stringify(response).includes("must_not_leak"));
    } finally {
      restoreEnv("REAL_CHANNEL_WEBHOOKS_ENABLED", previousEnabled);
      restoreEnv("REAL_CHANNEL_WEBHOOK_SECRETS", previousSecrets);
    }
  });

  it("reports degraded readiness when channel queue thresholds are exceeded", async () => {
    const previousPending = process.env.CHANNEL_QUEUE_PENDING_WARN_THRESHOLD;
    const previousOldest = process.env.CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS;
    const previousStale = process.env.CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD;
    const previousStaleAfter = process.env.CHANNEL_QUEUE_STALE_AFTER_MINUTES;
    process.env.CHANNEL_QUEUE_PENDING_WARN_THRESHOLD = "10";
    process.env.CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS = "900";
    process.env.CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD = "0";
    process.env.CHANNEL_QUEUE_STALE_AFTER_MINUTES = "15";
    try {
      const prisma = {
        $queryRaw: async () => [{ "?column?": 1 }],
      } as unknown as PrismaService;
      const controller = new HealthReadinessController(
        prisma,
        new ChannelWebhookSecurityService(receiptStore()),
        {
          getQueueHealth: async (input: unknown) => {
            assert.deepStrictEqual(input, {
              pendingWarnThreshold: 10,
              oldestPendingWarnSeconds: 900,
              staleProcessingWarnThreshold: 0,
              staleAfterMinutes: 15,
            });
            return {
              status: "degraded",
              pendingCount: 12,
              processingCount: 2,
              staleProcessingCount: 1,
              oldestPendingAgeSeconds: 1800,
              thresholds: {
                pendingWarnThreshold: 10,
                oldestPendingWarnSeconds: 900,
                staleProcessingWarnThreshold: 0,
                staleAfterMinutes: 15,
              },
              reasons: [
                "pending_count_above_threshold",
                "oldest_pending_age_above_threshold",
                "stale_processing_above_threshold",
              ],
            };
          },
        } as unknown as ChannelEventReviewService,
      );

      const response = await controller.getReadiness();

      assert.strictEqual(response.status, "degraded");
      assert.deepStrictEqual(response.checks.channelQueue, {
        status: "degraded",
        pendingCount: 12,
        processingCount: 2,
        staleProcessingCount: 1,
        oldestPendingAgeSeconds: 1800,
        thresholds: {
          pendingWarnThreshold: 10,
          oldestPendingWarnSeconds: 900,
          staleProcessingWarnThreshold: 0,
          staleAfterMinutes: 15,
        },
        reasons: [
          "pending_count_above_threshold",
          "oldest_pending_age_above_threshold",
          "stale_processing_above_threshold",
        ],
      });
      assert.ok(!JSON.stringify(response).includes("tenant_"));
    } finally {
      restoreEnv("CHANNEL_QUEUE_PENDING_WARN_THRESHOLD", previousPending);
      restoreEnv("CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS", previousOldest);
      restoreEnv("CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD", previousStale);
      restoreEnv("CHANNEL_QUEUE_STALE_AFTER_MINUTES", previousStaleAfter);
    }
  });
});

function receiptStore() {
  return {
    channelWebhookReceipt: {
      create: async () => ({}),
    },
  } as unknown as PrismaService;
}

function queueHealthService() {
  return {
    getQueueHealth: async () => ({
      status: "ok",
      pendingCount: 0,
      processingCount: 0,
      staleProcessingCount: 0,
      oldestPendingAgeSeconds: null,
      thresholds: {},
      reasons: [],
    }),
  } as unknown as ChannelEventReviewService;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
