import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  ChannelWebhookSecurityService,
  sha256Hex,
  signWebhook,
} from "./channel-webhook-security.service";
import { RealChannelController } from "./real-channel.controller";
import type { PrismaService } from "../prisma/prisma.service";

const originalEnabled = process.env.REAL_CHANNEL_WEBHOOKS_ENABLED;
const originalSecrets = process.env.REAL_CHANNEL_WEBHOOK_SECRETS;

describe("RealChannelController", () => {
  afterEach(() => {
    restoreEnv("REAL_CHANNEL_WEBHOOKS_ENABLED", originalEnabled);
    restoreEnv("REAL_CHANNEL_WEBHOOK_SECRETS", originalSecrets);
  });

  it("accepts signed real-channel webhooks without processing customer-visible actions", async () => {
    process.env.REAL_CHANNEL_WEBHOOKS_ENABLED = "true";
    process.env.REAL_CHANNEL_WEBHOOK_SECRETS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        secret: "real_channel_secret_123",
      },
    ]);
    const receipts: unknown[] = [];
    const rawBody = Buffer.from('{"text":"我的订单什么时候发货？"}');
    const controller = new RealChannelController(
      new ChannelWebhookSecurityService(receiptStore(receipts)),
    );

    const result = await controller.handleEvent(
      "taobao",
      signedHeaders(rawBody),
      { text: "我的订单什么时候发货？" },
      { rawBody },
    );

    assert.strictEqual(result.status, "accepted");
    assert.strictEqual(result.mode, "security_only");
    assert.strictEqual(result.channel, "taobao");
    assert.strictEqual(result.tenantId, "tenant_1");
    assert.strictEqual(result.eventId, "event_1");
    assert.strictEqual(receipts.length, 1);
  });
});

function signedHeaders(rawBody: Buffer) {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  return {
    "x-smartcs-signature-version": "v1",
    "x-smartcs-tenant-id": "tenant_1",
    "x-smartcs-event-id": "event_1",
    "x-smartcs-timestamp": timestamp,
    "x-smartcs-signature": signWebhook({
      secret: "real_channel_secret_123",
      version: "v1",
      channel: "taobao",
      tenantId: "tenant_1",
      timestamp,
      eventId: "event_1",
      bodySha256: sha256Hex(rawBody),
    }),
  };
}

function receiptStore(receipts: unknown[]) {
  return {
    channelWebhookReceipt: {
      create: async ({ data }: { data: unknown }) => {
        receipts.push(data);
        return data;
      },
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
