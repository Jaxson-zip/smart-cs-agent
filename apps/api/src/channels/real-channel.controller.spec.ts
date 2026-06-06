import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  ChannelWebhookSecurityService,
  sha256Hex,
  signWebhook,
} from "./channel-webhook-security.service";
import { RealChannelNormalizerService } from "./real-channel-normalizer.service";
import { RealChannelController } from "./real-channel.controller";
import type { PrismaService } from "../prisma/prisma.service";

const originalEnabled = process.env.REAL_CHANNEL_WEBHOOKS_ENABLED;
const originalSecrets = process.env.REAL_CHANNEL_WEBHOOK_SECRETS;

describe("RealChannelController", () => {
  afterEach(() => {
    restoreEnv("REAL_CHANNEL_WEBHOOKS_ENABLED", originalEnabled);
    restoreEnv("REAL_CHANNEL_WEBHOOK_SECRETS", originalSecrets);
  });

  it("normalizes signed real-channel webhooks without processing customer-visible actions", async () => {
    process.env.REAL_CHANNEL_WEBHOOKS_ENABLED = "true";
    process.env.REAL_CHANNEL_WEBHOOK_SECRETS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        secret: "real_channel_secret_123",
      },
    ]);
    const receipts: unknown[] = [];
    const normalizedEvents: unknown[] = [];
    const afterSalesCases: unknown[] = [];
    const caseMessages: unknown[] = [];
    const caseActions: unknown[] = [];
    const body = {
      seller_id: "tenant_1",
      buyer_nick: "Lin",
      conversation_id: "tb_conv_1",
      message_id: "tb_msg_1",
      content: "When will my order ship?",
      send_time: "2026-06-06T05:00:00.000Z",
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const controller = new RealChannelController(
      new ChannelWebhookSecurityService({} as PrismaService),
      new RealChannelNormalizerService(),
      persistenceStore({
        receipts,
        normalizedEvents,
        afterSalesCases,
        caseMessages,
        caseActions,
      }),
    );

    const result = await controller.handleEvent(
      "taobao",
      signedHeaders(rawBody),
      body,
      { rawBody },
    );

    assert.strictEqual(result.status, "sandbox_queued");
    assert.strictEqual(result.mode, "normalized_only");
    assert.strictEqual(result.channel, "taobao");
    assert.strictEqual(result.tenantId, "tenant_1");
    assert.strictEqual(result.eventId, "event_1");
    assert.strictEqual(result.normalizedEventId, "normalized_1");
    assert.ok(!JSON.stringify(result).includes("When will my order ship?"));
    assert.strictEqual(receipts.length, 1);
    assert.deepStrictEqual(normalizedEvents, [
      {
        source: "real_channel_webhook",
        merchantId: "tenant_1",
        channel: "taobao",
        externalConversationId: "tb_conv_1",
        externalMessageId: "tb_msg_1",
        senderName: "Lin",
        text: "When will my order ship?",
        receivedAt: new Date("2026-06-06T05:00:00.000Z"),
      },
    ]);
    assert.strictEqual(afterSalesCases.length, 0);
    assert.strictEqual(caseMessages.length, 0);
    assert.strictEqual(caseActions.length, 0);
  });

  it("does not write a replay receipt when normalization fails", async () => {
    process.env.REAL_CHANNEL_WEBHOOKS_ENABLED = "true";
    process.env.REAL_CHANNEL_WEBHOOK_SECRETS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        secret: "real_channel_secret_123",
      },
    ]);
    const receipts: unknown[] = [];
    const normalizedEvents: unknown[] = [];
    const body = {
      seller_id: "tenant_2",
      conversation_id: "tb_conv_1",
      message_id: "tb_msg_1",
      content: "hello",
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const controller = new RealChannelController(
      new ChannelWebhookSecurityService({} as PrismaService),
      new RealChannelNormalizerService(),
      persistenceStore({
        receipts,
        normalizedEvents,
        afterSalesCases: [],
        caseMessages: [],
        caseActions: [],
      }),
    );

    await assert.rejects(
      () => controller.handleEvent("taobao", signedHeaders(rawBody), body, { rawBody }),
      /payload tenant does not match/,
    );
    assert.strictEqual(receipts.length, 0);
    assert.strictEqual(normalizedEvents.length, 0);
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

function persistenceStore({
  receipts,
  normalizedEvents,
  afterSalesCases,
  caseMessages,
  caseActions,
}: {
  receipts: unknown[];
  normalizedEvents: unknown[];
  afterSalesCases: unknown[];
  caseMessages: unknown[];
  caseActions: unknown[];
}) {
  type Store = {
    $transaction<T>(callback: (tx: Store) => Promise<T>): Promise<T>;
    channelWebhookReceipt: { create(args: { data: unknown }): Promise<unknown> };
    normalizedChannelEvent: { create(args: { data: unknown }): Promise<{ id: string }> };
    afterSalesCase: {
      create(args: { data: unknown }): Promise<unknown>;
      upsert(args: { create: unknown }): Promise<unknown>;
    };
    caseMessage: { create(args: { data: unknown }): Promise<unknown> };
    caseAction: { create(args: { data: unknown }): Promise<unknown> };
  };
  const store: Store = {
    $transaction: async <T>(callback: (tx: Store) => Promise<T>) => callback(store),
    channelWebhookReceipt: {
      create: async ({ data }: { data: unknown }) => {
        receipts.push(data);
        return data;
      },
    },
    normalizedChannelEvent: {
      create: async ({ data }: { data: unknown }) => {
        normalizedEvents.push(data);
        return { id: "normalized_1" };
      },
    },
    afterSalesCase: {
      create: async ({ data }: { data: unknown }) => {
        afterSalesCases.push(data);
        return data;
      },
      upsert: async ({ create }: { create: unknown }) => {
        afterSalesCases.push(create);
        return create;
      },
    },
    caseMessage: {
      create: async ({ data }: { data: unknown }) => {
        caseMessages.push(data);
        return data;
      },
    },
    caseAction: {
      create: async ({ data }: { data: unknown }) => {
        caseActions.push(data);
        return data;
      },
    },
  };

  return store as unknown as PrismaService;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
