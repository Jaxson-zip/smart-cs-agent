import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import type { NormalizedChannelEvent } from "./channels.interface";

type NormalizeRealChannelInput = {
  channel: string;
  tenantId: string;
  eventId: string;
  receivedAt: string;
  body: unknown;
};

const taobaoPayloadSchema = z
  .object({
    seller_id: z.string().optional(),
    sellerId: z.string().optional(),
    buyer_nick: z.string().optional(),
    buyerNick: z.string().optional(),
    tid: z.string().optional(),
    order_id: z.string().optional(),
    conversation_id: z.string().optional(),
    conversationId: z.string().optional(),
    message_id: z.string().optional(),
    messageId: z.string().optional(),
    content: z.string().optional(),
    text: z.string().optional(),
    send_time: z.union([z.string(), z.number()]).optional(),
    sendTime: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const douyinPayloadSchema = z
  .object({
    shop_id: z.string().optional(),
    shopId: z.string().optional(),
    order_id: z.string().optional(),
    orderId: z.string().optional(),
    conversation_id: z.string().optional(),
    conversationId: z.string().optional(),
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    message_id: z.string().optional(),
    messageId: z.string().optional(),
    user_nickname: z.string().optional(),
    userNickname: z.string().optional(),
    nickname: z.string().optional(),
    text: z.string().optional(),
    content: z.string().optional(),
    create_time: z.union([z.string(), z.number()]).optional(),
    createTime: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

@Injectable()
export class RealChannelNormalizerService {
  normalizeIncoming(input: NormalizeRealChannelInput): NormalizedChannelEvent {
    if (input.channel === "taobao") {
      return normalizeTaobao(input);
    }
    if (input.channel === "douyin") {
      return normalizeDouyin(input);
    }

    throw new BadRequestException("Unsupported real channel");
  }
}

function normalizeTaobao(input: NormalizeRealChannelInput): NormalizedChannelEvent {
  const parsed = taobaoPayloadSchema.safeParse(input.body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.format());
  }

  const merchantId = parsed.data.seller_id ?? parsed.data.sellerId;
  assertTenantMatches(input.tenantId, merchantId);

  return {
    source: "real_channel_webhook",
    merchantId: input.tenantId,
    channel: input.channel,
    externalConversationId: requireText(
      parsed.data.conversation_id ?? parsed.data.conversationId ?? parsed.data.tid ?? parsed.data.order_id,
      "conversation_id",
    ),
    externalMessageId: requireText(
      parsed.data.message_id ?? parsed.data.messageId ?? input.eventId,
      "message_id",
    ),
    senderName: parsed.data.buyer_nick ?? parsed.data.buyerNick ?? "customer",
    text: requireText(parsed.data.content ?? parsed.data.text, "content"),
    receivedAt: normalizeTimestamp(parsed.data.send_time ?? parsed.data.sendTime, input.receivedAt),
  };
}

function normalizeDouyin(input: NormalizeRealChannelInput): NormalizedChannelEvent {
  const parsed = douyinPayloadSchema.safeParse(input.body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.format());
  }

  const merchantId = parsed.data.shop_id ?? parsed.data.shopId;
  assertTenantMatches(input.tenantId, merchantId);

  return {
    source: "real_channel_webhook",
    merchantId: input.tenantId,
    channel: input.channel,
    externalConversationId: requireText(
      parsed.data.conversation_id ??
        parsed.data.conversationId ??
        parsed.data.session_id ??
        parsed.data.sessionId ??
        parsed.data.order_id ??
        parsed.data.orderId,
      "conversation_id",
    ),
    externalMessageId: requireText(
      parsed.data.message_id ?? parsed.data.messageId ?? input.eventId,
      "message_id",
    ),
    senderName:
      parsed.data.user_nickname ??
      parsed.data.userNickname ??
      parsed.data.nickname ??
      "customer",
    text: requireText(parsed.data.text ?? parsed.data.content, "text"),
    receivedAt: normalizeTimestamp(
      parsed.data.create_time ?? parsed.data.createTime,
      input.receivedAt,
    ),
  };
}

function assertTenantMatches(signedTenantId: string, payloadTenantId?: string) {
  if (payloadTenantId && payloadTenantId !== signedTenantId) {
    throw new BadRequestException("Real channel payload tenant does not match signature tenant");
  }
}

function requireText(value: string | undefined, fieldName: string) {
  if (!value?.trim()) {
    throw new BadRequestException(`Real channel payload is missing ${fieldName}`);
  }

  return value;
}

function normalizeTimestamp(value: string | number | undefined, fallback: string) {
  if (value === undefined) return fallback;

  const date =
    typeof value === "number"
      ? new Date(value > 10_000_000_000 ? value : value * 1000)
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Real channel payload timestamp is invalid");
  }

  return date.toISOString();
}
