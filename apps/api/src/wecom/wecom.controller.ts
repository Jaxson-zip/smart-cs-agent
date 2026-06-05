import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  afterSalesCaseSchema,
  type AfterSalesAction,
} from "@smart-cs-agent/shared";
import { ActionService } from "../actions/action.service";
import { AgentService } from "../agent/agent.service";
import { WecomSandboxProvider } from "./wecom-sandbox.provider";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const sendMessageBodySchema = z.object({
  merchantId: z.string(),
  channel: z.string(),
  externalConversationId: z.string(),
  text: z.string(),
});

const toJsonInput = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Controller("v1/wecom")
export class WecomController {
  constructor(
    private readonly wecomProvider: WecomSandboxProvider,
    private readonly agentService: AgentService,
    private readonly actionService: ActionService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Post("events")
  @HttpCode(HttpStatus.OK)
  async handleEvent(@Body() body: unknown) {
    const normalizedEvent = await this.wecomProvider.normalizeIncoming(body);
    
    // 1. Persist NormalizedChannelEvent
    await this.prisma.normalizedChannelEvent.create({
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

    const caseId = `case_${normalizedEvent.externalMessageId}`;
    await this.auditService.log(caseId, "event_received", { text: normalizedEvent.text });

    const decision = await this.agentService.decide(normalizedEvent.text, { amount: undefined }, caseId);

    const executedActions: AfterSalesAction[] = [];
    if (decision.automationMode === "auto_execute") {
      for (const action of (decision.suggestedActions ?? [])) {
        const result = await this.actionService.executeMockAction(action, caseId);
        executedActions.push(result);
      }
    } else {
      executedActions.push(...(decision.suggestedActions ?? []));
    }

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
      await this.auditService.log(caseId, "reply_sent", { text: decision.replyText, success: sendResult.success });
    }

    // 2. Persist AfterSalesCase
    const createdCase = await this.prisma.afterSalesCase.create({
      data: {
        id: caseId,
        merchantId: normalizedEvent.merchantId,
        channel: normalizedEvent.channel,
        customerName: normalizedEvent.senderName,
        category: decision.category,
        riskLevel: decision.riskLevel,
        automationMode: decision.automationMode,
        customerMessage: normalizedEvent.text,
        customerReply: decision.replyText,
        actions: executedActions, // Legacy
      },
    });

    // 3. Persist CaseMessage
    await this.prisma.caseMessage.create({
      data: {
        caseId: createdCase.id,
        senderType: "customer",
        text: normalizedEvent.text,
        createdAt: new Date(normalizedEvent.receivedAt),
      },
    });

    if (decision.replyText && decision.automationMode === "auto_execute") {
      await this.prisma.caseMessage.create({
        data: {
          caseId: createdCase.id,
          senderType: "agent",
          text: decision.replyText,
        },
      });
    }

    // 4. Persist CaseAction
    for (const action of executedActions) {
      await this.prisma.caseAction.create({
        data: {
          caseId: createdCase.id,
          type: action.type,
          status: action.status || "pending",
          params: toJsonInput(action),
        },
      });
    }

    const afterSalesCase = afterSalesCaseSchema.parse({
      caseId: createdCase.id,
      merchantId: createdCase.merchantId,
      channel: createdCase.channel,
      customerName: createdCase.customerName,
      category: createdCase.category,
      riskLevel: createdCase.riskLevel,
      automationMode: createdCase.automationMode,
      customerMessage: createdCase.customerMessage,
      customerReply: createdCase.customerReply || undefined,
      actions: executedActions,
      createdAt: createdCase.createdAt.toISOString(),
      updatedAt: createdCase.updatedAt.toISOString(),
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
