import { z } from "zod";

export const wecomSandboxEventSchema = z.object({
  source: z.literal("wecom_sandbox"),
  merchantId: z.string(),
  channel: z.string(),
  externalConversationId: z.string(),
  externalMessageId: z.string(),
  senderName: z.string(),
  text: z.string(),
  receivedAt: z.string().datetime(),
});

export type WecomSandboxEvent = z.infer<typeof wecomSandboxEventSchema>;
