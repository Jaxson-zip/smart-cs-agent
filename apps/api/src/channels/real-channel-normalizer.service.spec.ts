import assert from "node:assert";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { RealChannelNormalizerService } from "./real-channel-normalizer.service";

describe("RealChannelNormalizerService", () => {
  const service = new RealChannelNormalizerService();

  it("normalizes a Taobao-shaped sandbox webhook into the shared channel event", () => {
    const result = service.normalizeIncoming({
      channel: "taobao",
      tenantId: "tenant_1",
      eventId: "event_1",
      receivedAt: "2026-06-06T05:00:30.000Z",
      body: {
        topic: "taobao.im.message.received",
        seller_id: "tenant_1",
        buyer_nick: "Lin",
        tid: "tb_order_1",
        conversation_id: "tb_conv_1",
        message_id: "tb_msg_1",
        content: "The shoe box was crushed.",
        send_time: "2026-06-06T05:00:00.000Z",
      },
    });

    assert.deepStrictEqual(result, {
      source: "real_channel_webhook",
      merchantId: "tenant_1",
      channel: "taobao",
      externalConversationId: "tb_conv_1",
      externalMessageId: "tb_msg_1",
      senderName: "Lin",
      text: "The shoe box was crushed.",
      receivedAt: "2026-06-06T05:00:00.000Z",
    });
  });

  it("normalizes a Douyin-shaped sandbox webhook into the shared channel event", () => {
    const result = service.normalizeIncoming({
      channel: "douyin",
      tenantId: "tenant_1",
      eventId: "event_2",
      receivedAt: "2026-06-06T05:02:00.000Z",
      body: {
        event: "im.message.receive",
        shop_id: "tenant_1",
        order_id: "dy_order_1",
        conversation_id: "dy_conv_1",
        message_id: "dy_msg_1",
        user_nickname: "Zhang",
        text: "Please check my logistics.",
        create_time: 1780722000,
      },
    });

    assert.deepStrictEqual(result, {
      source: "real_channel_webhook",
      merchantId: "tenant_1",
      channel: "douyin",
      externalConversationId: "dy_conv_1",
      externalMessageId: "dy_msg_1",
      senderName: "Zhang",
      text: "Please check my logistics.",
      receivedAt: "2026-06-06T05:00:00.000Z",
    });
  });

  it("rejects payloads whose merchant identity conflicts with the signed tenant", () => {
    assert.throws(
      () =>
        service.normalizeIncoming({
          channel: "taobao",
          tenantId: "tenant_1",
          eventId: "event_1",
          receivedAt: "2026-06-06T05:00:30.000Z",
          body: {
            seller_id: "tenant_2",
            conversation_id: "tb_conv_1",
            message_id: "tb_msg_1",
            content: "hello",
          },
        }),
      BadRequestException,
    );
  });
});
