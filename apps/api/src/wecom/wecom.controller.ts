import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  afterSalesCaseSchema,
  type AfterSalesAction,
} from "@smart-cs-agent/shared";
import { ActionService } from "../actions/action.service";
import { AgentService } from "../agent/agent.service";
import {
  requireRequestContext,
  requireTenantParamAccess,
  type RequestHeaders,
} from "../auth/request-context";
import { WecomSandboxProvider } from "./wecom-sandbox.provider";
import { PrismaService } from "../prisma/prisma.service";

const sendMessageBodySchema = z.object({
  merchantId: z.string(),
  channel: z.string(),
  externalConversationId: z.string(),
  text: z.string(),
});

const toJsonInput = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type AuditEntry = {
  action: string;
  details: Prisma.InputJsonValue;
};

@Controller("v1/wecom")
export class WecomController {
  constructor(
    private readonly wecomProvider: WecomSandboxProvider,
    private readonly agentService: AgentService,
    private readonly actionService: ActionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("events")
  @HttpCode(HttpStatus.OK)
  async handleEvent(@Body() body: unknown) {
    assertWecomSandboxEnabled();

    const normalizedEvent = await this.wecomProvider.normalizeIncoming(body);
    const caseId = `case_${normalizedEvent.externalMessageId}`;
    const auditEntries: AuditEntry[] = [
      { action: "event_received", details: { text: normalizedEvent.text } },
    ];

    const decision = await this.agentService.decide(normalizedEvent.text, {
      amount: undefined,
      tenantId: normalizedEvent.merchantId,
    });
    auditEntries.push(
      { action: "category_decision", details: { category: decision.category } },
      {
        action: "risk_decision",
        details: {
          riskLevel: decision.riskLevel,
          automationMode: decision.automationMode,
        },
      },
    );

    const executedActions: AfterSalesAction[] = [];
    if (decision.automationMode === "auto_execute") {
      for (const action of (decision.suggestedActions ?? [])) {
        const result = await this.actionService.executeMockAction(action);
        executedActions.push(result);
        auditEntries.push({
          action: "action_executed",
          details: { action: toJsonInput(result) },
        });
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
      auditEntries.push({
        action: "reply_sent",
        details: { text: decision.replyText, success: sendResult.success },
      });
    }

    const createdCase = await this.prisma.$transaction(async (tx) => {
      await tx.normalizedChannelEvent.create({
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

      const caseItem = await tx.afterSalesCase.upsert({
        where: { id: caseId },
        create: {
          id: caseId,
          merchantId: normalizedEvent.merchantId,
          channel: normalizedEvent.channel,
          customerName: normalizedEvent.senderName,
          category: decision.category,
          riskLevel: decision.riskLevel,
          automationMode: decision.automationMode,
          customerMessage: normalizedEvent.text,
          customerReply: decision.replyText,
          actions: toJsonInput(executedActions),
        },
        update: {
          merchantId: normalizedEvent.merchantId,
          channel: normalizedEvent.channel,
          customerName: normalizedEvent.senderName,
          category: decision.category,
          riskLevel: decision.riskLevel,
          automationMode: decision.automationMode,
          customerMessage: normalizedEvent.text,
          customerReply: decision.replyText,
          actions: toJsonInput(executedActions),
        },
      });

      await tx.caseMessage.deleteMany({ where: { caseId } });
      await tx.caseAction.deleteMany({ where: { caseId } });
      await tx.auditLog.deleteMany({ where: { caseId } });

      await tx.caseMessage.create({
        data: {
          caseId: caseItem.id,
          senderType: "customer",
          text: normalizedEvent.text,
          createdAt: new Date(normalizedEvent.receivedAt),
        },
      });

      if (decision.replyText && decision.automationMode === "auto_execute") {
        await tx.caseMessage.create({
          data: {
            caseId: caseItem.id,
            senderType: "agent",
            text: decision.replyText,
          },
        });
      }

      for (const action of executedActions) {
        await tx.caseAction.create({
          data: {
            caseId: caseItem.id,
            type: action.type,
            status: action.status || "pending",
            params: toJsonInput(action),
          },
        });
      }

      for (const entry of auditEntries) {
        await tx.auditLog.create({
          data: {
            caseId: caseItem.id,
            action: entry.action,
            details: entry.details,
          },
        });
      }

      return caseItem;
    });

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
  async handleSend(
    @Headers() headers: RequestHeaders,
    @Body() body: unknown,
  ) {
    const context = requireRequestContext(headers);
    const parsed = sendMessageBodySchema.parse(body);
    requireTenantParamAccess(context, parsed.merchantId);

    return this.wecomProvider.sendMessage({
      merchantId: parsed.merchantId,
      channel: parsed.channel,
      externalConversationId: parsed.externalConversationId,
      text: parsed.text,
    });
  }
}

function assertWecomSandboxEnabled(env: NodeJS.ProcessEnv = process.env) {
  const explicitlyEnabled = env.WECOM_SANDBOX_ENABLED === "true";
  const explicitlyDisabled = env.WECOM_SANDBOX_ENABLED === "false";
  const productionDefaultDisabled =
    env.NODE_ENV === "production" && !explicitlyEnabled;

  if (explicitlyDisabled || productionDefaultDisabled) {
    throw new ForbiddenException("WeCom sandbox endpoint is disabled");
  }
}
