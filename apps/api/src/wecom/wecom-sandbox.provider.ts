import { Injectable, Logger } from "@nestjs/common";
import { ChannelProvider, NormalizedChannelEvent, SendChannelMessageInput, SendChannelMessageResult } from "../channels/channels.interface";
import { wecomSandboxEventSchema } from "@smart-cs-agent/shared";

@Injectable()
export class WecomSandboxProvider implements ChannelProvider {
  private readonly logger = new Logger(WecomSandboxProvider.name);

  async normalizeIncoming(input: unknown): Promise<NormalizedChannelEvent> {
    const parsed = wecomSandboxEventSchema.parse(input);
    
    return {
      source: parsed.source,
      merchantId: parsed.merchantId,
      channel: parsed.channel,
      externalConversationId: parsed.externalConversationId,
      externalMessageId: parsed.externalMessageId,
      senderName: parsed.senderName,
      text: parsed.text,
      receivedAt: parsed.receivedAt,
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
