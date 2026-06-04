import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ChannelProvider, NormalizedChannelEvent, SendChannelMessageInput, SendChannelMessageResult } from "../channels/channels.interface";
import { wecomSandboxEventSchema } from "@smart-cs-agent/shared";

@Injectable()
export class WecomSandboxProvider implements ChannelProvider {
  private readonly logger = new Logger(WecomSandboxProvider.name);

  async normalizeIncoming(input: unknown): Promise<NormalizedChannelEvent> {
    const parsed = wecomSandboxEventSchema.safeParse(input);
    
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    return {
      source: parsed.data.source,
      merchantId: parsed.data.merchantId,
      channel: parsed.data.channel,
      externalConversationId: parsed.data.externalConversationId,
      externalMessageId: parsed.data.externalMessageId,
      senderName: parsed.data.senderName,
      text: parsed.data.text,
      receivedAt: parsed.data.receivedAt,
    };
  }

  async sendMessage(input: SendChannelMessageInput): Promise<SendChannelMessageResult> {
    this.logger.log(`[WecomSandboxProvider] Mock sending message to ${input.channel}/${input.externalConversationId}: ${input.text}`);
    return {
      success: true,
      messageId: `sim-msg-${Date.now()}`,
    };
  }
}
