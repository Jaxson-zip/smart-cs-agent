import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { z } from "zod";
import {
  afterSalesCaseSchema,
  type AfterSalesAction,
} from "@smart-cs-agent/shared";
import { ActionService } from "../actions/action.service";
import { AgentService } from "../agent/agent.service";
import { WecomSandboxProvider } from "./wecom-sandbox.provider";

const sendMessageBodySchema = z.object({
  merchantId: z.string(),
  channel: z.string(),
  externalConversationId: z.string(),
  text: z.string(),
});

@Controller("v1/wecom")
export class WecomController {
  constructor(
    private readonly wecomProvider: WecomSandboxProvider,
    private readonly agentService: AgentService,
    private readonly actionService: ActionService,
  ) {}

  @Post("events")
  @HttpCode(HttpStatus.OK)
  async handleEvent(@Body() body: unknown) {
    const normalizedEvent = await this.wecomProvider.normalizeIncoming(body);
    const decision = await this.agentService.decide(normalizedEvent.text);

    const executedActions: AfterSalesAction[] =
      decision.automationMode === "auto_execute"
        ? (decision.suggestedActions ?? []).map((action) =>
            this.actionService.executeMockAction(action),
          )
        : (decision.suggestedActions ?? []);

    if (decision.automationMode === "auto_execute" && decision.replyText) {
      const sendResult = await this.wecomProvider.sendMessage({
        merchantId: normalizedEvent.merchantId,
        channel: normalizedEvent.channel,
        externalConversationId: normalizedEvent.externalConversationId,
        text: decision.replyText,
      });

      executedActions.push({
        type: "send_channel_reply",
        status: sendResult.success ? "success" : "failed",
        replyText: decision.replyText,
      });
    }

    const afterSalesCase = afterSalesCaseSchema.parse({
      caseId: `case_${normalizedEvent.externalMessageId}`,
      merchantId: normalizedEvent.merchantId,
      channel: normalizedEvent.channel,
      customerName: normalizedEvent.senderName,
      category: decision.category,
      riskLevel: decision.riskLevel,
      automationMode: decision.automationMode,
      customerMessage: normalizedEvent.text,
      customerReply: decision.replyText,
      actions: executedActions,
      createdAt: normalizedEvent.receivedAt,
      updatedAt: new Date().toISOString(),
    });

    return {
      status: "received",
      normalizedEvent,
      afterSalesCase,
    };
  }

  @Post("webhook/send")
  @HttpCode(HttpStatus.OK)
  async handleSend(@Body() body: unknown) {
    const parsed = sendMessageBodySchema.parse(body);

    return this.wecomProvider.sendMessage({
      merchantId: parsed.merchantId,
      channel: parsed.channel,
      externalConversationId: parsed.externalConversationId,
      text: parsed.text,
    });
  }
}
