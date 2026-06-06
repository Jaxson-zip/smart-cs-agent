import {
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import {
  ChannelWebhookSecurityService,
} from "./channel-webhook-security.service";
import { RealChannelNormalizerService } from "./real-channel-normalizer.service";
import { RealChannelRateLimitService } from "./real-channel-rate-limit.service";
import { PrismaService } from "../prisma/prisma.service";

export type QueuedRealChannelWebhook = {
  status: "sandbox_queued";
  channel: string;
  tenantId: string;
  eventId: string;
  normalizedEventId: string;
  receivedAt: string;
  mode: "normalized_only";
};

@Controller("v1/channels")
export class RealChannelController {
  constructor(
    private readonly security: ChannelWebhookSecurityService,
    private readonly normalizer: RealChannelNormalizerService,
    private readonly rateLimit: RealChannelRateLimitService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(":channel/webhook/events")
  @HttpCode(HttpStatus.ACCEPTED)
  async handleEvent(
    @Param("channel") channel: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Req() request?: { rawBody?: Buffer },
  ): Promise<QueuedRealChannelWebhook> {
    const verified = this.security.verifyIncomingWebhook({
      channel,
      headers,
      body,
      rawBody: request?.rawBody,
    });
    this.rateLimit.assertAllowed({
      channel: verified.channel,
      tenantId: verified.tenantId,
    });

    const normalizedEvent = this.normalizer.normalizeIncoming({
      channel: verified.channel,
      tenantId: verified.tenantId,
      eventId: verified.eventId,
      receivedAt: verified.receivedAt,
      body,
    });
    const created = await this.persistVerifiedEvent({
      verified,
      normalizedEvent,
    });

    return {
      status: "sandbox_queued",
      channel: verified.channel,
      tenantId: verified.tenantId,
      eventId: verified.eventId,
      normalizedEventId: created.id,
      receivedAt: verified.receivedAt,
      mode: "normalized_only",
    };
  }

  private async persistVerifiedEvent({
    verified,
    normalizedEvent,
  }: {
    verified: {
      channel: string;
      tenantId: string;
      eventId: string;
      bodySha256: string;
      eventTime: Date;
      receivedAt: string;
    };
    normalizedEvent: {
      source: string;
      merchantId: string;
      channel: string;
      externalConversationId: string;
      externalMessageId: string;
      senderName: string;
      text: string;
      receivedAt: string;
    };
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.channelWebhookReceipt.create({
          data: {
            channel: verified.channel,
            tenantId: verified.tenantId,
            eventId: verified.eventId,
            bodySha256: verified.bodySha256,
            eventTime: verified.eventTime,
            receivedAt: new Date(verified.receivedAt),
          },
        });

        return tx.normalizedChannelEvent.create({
          data: {
            source: normalizedEvent.source,
            merchantId: normalizedEvent.merchantId,
            channel: normalizedEvent.channel,
            externalConversationId: normalizedEvent.externalConversationId,
            externalMessageId: normalizedEvent.externalMessageId,
            senderName: normalizedEvent.senderName,
            text: normalizedEvent.text,
            receivedAt: new Date(normalizedEvent.receivedAt),
          },
        });
      });
    } catch (error) {
      if (isPrismaUniqueConflict(error)) {
        throw new ConflictException("Real channel webhook event was already accepted");
      }

      throw error;
    }
  }
}

function isPrismaUniqueConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
