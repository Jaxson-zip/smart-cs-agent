import { ServiceUnavailableException } from "@nestjs/common";
import assert from "node:assert";
import { describe, it } from "node:test";
import { ChannelWebhookSecurityService } from "../channels/channel-webhook-security.service";
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
});

function receiptStore() {
  return {
    channelWebhookReceipt: {
      create: async () => ({}),
    },
  } as unknown as PrismaService;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
