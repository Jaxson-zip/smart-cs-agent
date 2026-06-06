import assert from "node:assert";
import { describe, it } from "node:test";
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ChannelWebhookSecurityService,
  realChannelSignaturePayload,
  sha256Hex,
  signWebhook,
} from "./channel-webhook-security.service";
import type { PrismaService } from "../prisma/prisma.service";

describe("ChannelWebhookSecurityService", () => {
  it("fails closed when real channel webhooks are not enabled", async () => {
    const service = new ChannelWebhookSecurityService(receiptStore());

    await assert.rejects(
      () =>
        service.acceptIncomingWebhook({
          channel: "taobao",
          headers: {},
          body: { text: "hello" },
          rawBody: Buffer.from("{}"),
          env: {},
        }),
      ForbiddenException,
    );
  });

  it("accepts a signed webhook and writes only a replay receipt", async () => {
    const receipts: unknown[] = [];
    const service = new ChannelWebhookSecurityService(receiptStore(receipts));
    const rawBody = Buffer.from('{"text":"hello","orderId":"order_1"}');
    const headers = signedHeaders({
      eventId: "event_1",
      timestamp: "1780718400",
      rawBody,
    });

    const result = await service.acceptIncomingWebhook({
      channel: "taobao",
      headers,
      body: { text: "hello", orderId: "order_1" },
      rawBody,
      now: new Date("2026-06-06T04:01:00.000Z"),
      env: enabledEnv(),
    });

    assert.deepStrictEqual(result, {
      status: "accepted",
      channel: "taobao",
      tenantId: "tenant_1",
      eventId: "event_1",
      receivedAt: "2026-06-06T04:01:00.000Z",
      mode: "security_only",
    });
    assert.deepStrictEqual(receipts, [
      {
        channel: "taobao",
        tenantId: "tenant_1",
        eventId: "event_1",
        bodySha256: sha256Hex(rawBody),
        eventTime: new Date("2026-06-06T04:00:00.000Z"),
        receivedAt: new Date("2026-06-06T04:01:00.000Z"),
      },
    ]);
  });

  it("rejects webhooks with invalid signatures", async () => {
    const service = new ChannelWebhookSecurityService(receiptStore());

    await assert.rejects(
      () =>
        service.acceptIncomingWebhook({
          channel: "taobao",
          headers: signedHeaders({
            eventId: "event_1",
            timestamp: "1780718400",
            secret: "wrong_secret",
            rawBody: Buffer.from('{"text":"hello"}'),
          }),
          body: { text: "hello" },
          rawBody: Buffer.from('{"text":"hello"}'),
          now: new Date("2026-06-06T04:00:30.000Z"),
          env: enabledEnv(),
        }),
      UnauthorizedException,
    );
  });

  it("rejects expired webhook timestamps", async () => {
    const service = new ChannelWebhookSecurityService(receiptStore());
    const rawBody = Buffer.from('{"text":"hello"}');

    await assert.rejects(
      () =>
        service.acceptIncomingWebhook({
          channel: "taobao",
          headers: signedHeaders({
            eventId: "event_1",
            timestamp: "1780718400",
            rawBody,
          }),
          body: { text: "hello" },
          rawBody,
          now: new Date("2026-06-06T04:10:01.000Z"),
          env: {
            ...enabledEnv(),
            REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS: "300",
          },
        }),
      UnauthorizedException,
    );
  });

  it("rejects replayed event ids through the receipt unique constraint", async () => {
    const service = new ChannelWebhookSecurityService(receiptStore([], true));
    const rawBody = Buffer.from('{"text":"hello"}');

    await assert.rejects(
      () =>
        service.acceptIncomingWebhook({
          channel: "taobao",
          headers: signedHeaders({
            eventId: "event_1",
            timestamp: "1780718400",
            rawBody,
          }),
          body: { text: "hello" },
          rawBody,
          now: new Date("2026-06-06T04:00:40.000Z"),
          env: enabledEnv(),
        }),
      ConflictException,
    );
  });

  it("reports channel readiness without leaking secrets", () => {
    const service = new ChannelWebhookSecurityService(receiptStore());

    assert.deepStrictEqual(service.getReadiness({}), {
      status: "disabled",
      enabled: false,
      configuredChannels: [],
      message: "Real channel webhooks are disabled",
    });
    assert.deepStrictEqual(service.getReadiness({
      REAL_CHANNEL_WEBHOOKS_ENABLED: "true",
    }), {
      status: "misconfigured",
      enabled: true,
      configuredChannels: [],
      message: "No real channel webhook secrets are configured",
    });
    assert.deepStrictEqual(service.getReadiness(enabledEnv()), {
      status: "ok",
      enabled: true,
      configuredChannels: ["taobao"],
    });
  });

  it("does not let signatures for equivalent JSON with different raw bytes pass", async () => {
    const service = new ChannelWebhookSecurityService(receiptStore());
    const signedRawBody = Buffer.from('{"text":"hello"}');
    const receivedRawBody = Buffer.from('{\n  "text": "hello"\n}');

    await assert.rejects(
      () =>
        service.acceptIncomingWebhook({
          channel: "taobao",
          headers: signedHeaders({
            eventId: "event_1",
            timestamp: "1780718400",
            rawBody: signedRawBody,
          }),
          body: { text: "hello" },
          rawBody: receivedRawBody,
          now: new Date("2026-06-06T04:00:30.000Z"),
          env: enabledEnv(),
        }),
      UnauthorizedException,
    );
  });

  it("binds signatures to the channel and tenant boundary", async () => {
    const service = new ChannelWebhookSecurityService(receiptStore());
    const rawBody = Buffer.from('{"text":"hello"}');

    await assert.rejects(
      () =>
        service.acceptIncomingWebhook({
          channel: "douyin",
          headers: signedHeaders({
            eventId: "event_1",
            timestamp: "1780718400",
            rawBody,
          }),
          body: { text: "hello" },
          rawBody,
          now: new Date("2026-06-06T04:00:30.000Z"),
          env: {
            REAL_CHANNEL_WEBHOOKS_ENABLED: "true",
            REAL_CHANNEL_WEBHOOK_SECRETS: JSON.stringify([
              {
                channel: "douyin",
                tenantId: "tenant_1",
                secret: "real_channel_secret_123",
              },
            ]),
          },
        }),
      UnauthorizedException,
    );
  });

  it("rejects oversized or unsafe event ids before writing receipts", async () => {
    const receipts: unknown[] = [];
    const service = new ChannelWebhookSecurityService(receiptStore(receipts));
    const rawBody = Buffer.from('{"text":"hello"}');

    await assert.rejects(
      () =>
        service.acceptIncomingWebhook({
          channel: "taobao",
          headers: signedHeaders({
            eventId: "event id with spaces",
            timestamp: "1780718400",
            rawBody,
          }),
          body: { text: "hello" },
          rawBody,
          now: new Date("2026-06-06T04:00:30.000Z"),
          env: enabledEnv(),
        }),
      UnauthorizedException,
    );
    assert.strictEqual(receipts.length, 0);
  });

  it("requires the raw request body for real-channel signature verification", async () => {
    const service = new ChannelWebhookSecurityService(receiptStore());
    const rawBody = Buffer.from('{"text":"hello"}');

    await assert.rejects(
      () =>
        service.acceptIncomingWebhook({
          channel: "taobao",
          headers: signedHeaders({
            eventId: "event_1",
            timestamp: "1780718400",
            rawBody,
          }),
          body: { text: "hello" },
          now: new Date("2026-06-06T04:00:30.000Z"),
          env: enabledEnv(),
        }),
      UnauthorizedException,
    );
  });

  it("fails closed when real-channel secrets are malformed", async () => {
    const service = new ChannelWebhookSecurityService(receiptStore());
    const rawBody = Buffer.from('{"text":"hello"}');

    await assert.rejects(
      () =>
        service.acceptIncomingWebhook({
          channel: "taobao",
          headers: signedHeaders({
            eventId: "event_1",
            timestamp: "1780718400",
            rawBody,
          }),
          body: { text: "hello" },
          rawBody,
          now: new Date("2026-06-06T04:00:30.000Z"),
          env: {
            REAL_CHANNEL_WEBHOOKS_ENABLED: "true",
            REAL_CHANNEL_WEBHOOK_SECRETS: "{not-json",
          },
        }),
      UnauthorizedException,
    );
  });

  it("builds the v1 signature payload from raw-body hash", () => {
    assert.strictEqual(
      realChannelSignaturePayload({
        version: "v1",
        channel: "taobao",
        tenantId: "tenant_1",
        timestamp: "1780718400",
        eventId: "event_1",
        bodySha256: "abc123",
      }),
      "v1\ntaobao\ntenant_1\n1780718400\nevent_1\nabc123",
    );
  });
});

function enabledEnv(): NodeJS.ProcessEnv {
  return {
    REAL_CHANNEL_WEBHOOKS_ENABLED: "true",
    REAL_CHANNEL_WEBHOOK_SECRETS: JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        secret: "real_channel_secret_123",
      },
    ]),
  };
}

function signedHeaders({
  eventId,
  timestamp,
  secret = "real_channel_secret_123",
  rawBody,
}: {
  eventId: string;
  timestamp: string;
  secret?: string;
  rawBody: Buffer;
}) {
  return {
    "x-smartcs-signature-version": "v1",
    "x-smartcs-tenant-id": "tenant_1",
    "x-smartcs-event-id": eventId,
    "x-smartcs-timestamp": timestamp,
    "x-smartcs-signature": signWebhook({
      secret,
      version: "v1",
      channel: "taobao",
      tenantId: "tenant_1",
      timestamp,
      eventId,
      bodySha256: sha256Hex(rawBody),
    }),
  };
}

function receiptStore(receipts: unknown[] = [], failUnique = false) {
  return {
    channelWebhookReceipt: {
      create: async ({ data }: { data: unknown }) => {
        if (failUnique) {
          throw { code: "P2002" };
        }
        receipts.push(data);
        return data;
      },
    },
  } as unknown as PrismaService;
}
