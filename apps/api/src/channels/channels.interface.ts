export interface NormalizedChannelEvent {
  source: string;
  merchantId: string;
  channel: string;
  externalConversationId: string;
  externalMessageId: string;
  senderName: string;
  text: string;
  receivedAt: string;
}

export interface SendChannelMessageInput {
  merchantId: string;
  channel: string;
  externalConversationId: string;
  text: string;
}

export interface SendChannelMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ChannelProvider {
  normalizeIncoming(input: unknown): Promise<NormalizedChannelEvent>;
  sendMessage(input: SendChannelMessageInput): Promise<SendChannelMessageResult>;
}
