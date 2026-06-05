import { describe, it } from "node:test";
import assert from "node:assert";
import { PrismaService } from "../prisma/prisma.service";
import { AgentService } from "../agent/agent.service";
import { ActionService } from "../actions/action.service";
import { WecomSandboxProvider } from "./wecom-sandbox.provider";
import { WecomController } from "./wecom.controller";
import type { AfterSalesAction } from "@smart-cs-agent/shared";
import type { NormalizedChannelEvent } from "../channels/channels.interface";

type CaseRecord = {
  id: string;
  merchantId: string;
  channel: string;
  customerName: string;
  orderId: string | null;
  category: string;
  riskLevel: string;
  automationMode: string;
  customerMessage: string;
  customerReply: string | null;
  actions: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type AuditRecord = {
  id: string;
  caseId: string | null;
  action: string;
  details: unknown;
  createdAt: Date;
};

type MessageRecord = {
  id: string;
  caseId: string;
  senderType: string;
  text: string;
  createdAt: Date;
};

type ActionRecord = {
  id: string;
  caseId: string;
  type: string;
  status: string;
  params: unknown;
  createdAt: Date;
  updatedAt: Date;
};

class InMemoryPrisma {
  cases = new Map<string, CaseRecord>();
  auditLogs: AuditRecord[] = [];
  caseMessages: MessageRecord[] = [];
  caseActions: ActionRecord[] = [];
  normalizedEvents: unknown[] = [];

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }

  normalizedChannelEvent = {
    create: async ({ data }: { data: unknown }) => {
      this.normalizedEvents.push(data);
      return data;
    },
  };

  afterSalesCase = {
    create: async ({ data }: { data: Partial<CaseRecord> & { id: string } }) => {
      if (this.cases.has(data.id)) {
        throw new Error(`Duplicate case id ${data.id}`);
      }
      const now = new Date();
      const record: CaseRecord = {
        id: data.id,
        merchantId: data.merchantId ?? "",
        channel: data.channel ?? "",
        customerName: data.customerName ?? "",
        orderId: data.orderId ?? null,
        category: data.category ?? "unknown",
        riskLevel: data.riskLevel ?? "high",
        automationMode: data.automationMode ?? "human_takeover",
        customerMessage: data.customerMessage ?? "",
        customerReply: data.customerReply ?? null,
        actions: data.actions ?? [],
        createdAt: now,
        updatedAt: now,
      };
      this.cases.set(data.id, record);
      return record;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { id: string };
      create: Partial<CaseRecord> & { id: string };
      update: Partial<CaseRecord>;
    }) => {
      const existing = this.cases.get(where.id);
      if (!existing) {
        return this.afterSalesCase.create({ data: create });
      }
      const updated = { ...existing, ...update, updatedAt: new Date() };
      this.cases.set(where.id, updated);
      return updated;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<CaseRecord>;
    }) => {
      const existing = this.cases.get(where.id);
      if (!existing) throw new Error(`Missing case id ${where.id}`);
      const updated = { ...existing, ...data, updatedAt: new Date() };
      this.cases.set(where.id, updated);
      return updated;
    },
  };

  auditLog = {
    create: async ({
      data,
    }: {
      data: { caseId: string | null; action: string; details?: unknown };
    }) => {
      if (data.caseId && !this.cases.has(data.caseId)) {
        throw new Error(`Foreign key failed for ${data.caseId}`);
      }
      const record = {
        id: `audit_${this.auditLogs.length + 1}`,
        caseId: data.caseId,
        action: data.action,
        details: data.details ?? {},
        createdAt: new Date(),
      };
      this.auditLogs.push(record);
      return record;
    },
    deleteMany: async ({ where }: { where: { caseId: string } }) => {
      this.auditLogs = this.auditLogs.filter((item) => item.caseId !== where.caseId);
      return { count: 0 };
    },
  };

  caseMessage = {
    create: async ({
      data,
    }: {
      data: { caseId: string; senderType: string; text: string; createdAt?: Date };
    }) => {
      const record = {
        id: `message_${this.caseMessages.length + 1}`,
        caseId: data.caseId,
        senderType: data.senderType,
        text: data.text,
        createdAt: data.createdAt ?? new Date(),
      };
      this.caseMessages.push(record);
      return record;
    },
    deleteMany: async ({ where }: { where: { caseId: string } }) => {
      this.caseMessages = this.caseMessages.filter((item) => item.caseId !== where.caseId);
      return { count: 0 };
    },
  };

  caseAction = {
    create: async ({
      data,
    }: {
      data: { caseId: string; type: string; status: string; params?: unknown };
    }) => {
      const now = new Date();
      const record = {
        id: `action_${this.caseActions.length + 1}`,
        caseId: data.caseId,
        type: data.type,
        status: data.status,
        params: data.params ?? {},
        createdAt: now,
        updatedAt: now,
      };
      this.caseActions.push(record);
      return record;
    },
    deleteMany: async ({ where }: { where: { caseId: string } }) => {
      this.caseActions = this.caseActions.filter((item) => item.caseId !== where.caseId);
      return { count: 0 };
    },
  };
}

describe("WecomController", () => {
  it("replays the same externalMessageId without duplicating case details or losing audit logs", async () => {
    const prisma = new InMemoryPrisma();
    const provider = {
      normalizeIncoming: async (input: unknown) => input as NormalizedChannelEvent,
      sendMessage: async () => ({ success: true, messageId: "reply_1" }),
    } as unknown as WecomSandboxProvider;
    const agentService = {
      decide: async (_text: string, context?: { tenantId?: string }) => {
        assert.strictEqual(context?.tenantId, "demo");
        return {
          category: "address_change",
          riskLevel: "low",
          automationMode: "auto_execute",
          replyText: "address updated",
          suggestedActions: [{ type: "change_address", status: "pending" }],
        };
      },
    } as unknown as AgentService;
    const actionService = {
      executeMockAction: async (action: AfterSalesAction) =>
        ({ ...action, status: "success" }) as AfterSalesAction,
    } as unknown as ActionService;
    const controller = new WecomController(
      provider,
      agentService,
      actionService,
      prisma as unknown as PrismaService,
    );
    const payload = {
      source: "wecom_sandbox",
      merchantId: "demo",
      channel: "taobao",
      externalConversationId: "conv_1",
      externalMessageId: "msg_1",
      senderName: "Ada",
      text: "change my address",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };

    await controller.handleEvent(payload);
    const second = await controller.handleEvent(payload);

    assert.strictEqual(second.afterSalesCase.caseId, "case_msg_1");
    assert.strictEqual(prisma.cases.size, 1);
    assert.deepStrictEqual(
      prisma.caseMessages.map((message) => message.senderType),
      ["customer", "agent"],
    );
    assert.deepStrictEqual(
      prisma.caseActions.map((action) => action.type),
      ["change_address", "send_channel_reply"],
    );
    assert.deepStrictEqual(
      prisma.auditLogs.map((log) => log.action),
      [
        "event_received",
        "category_decision",
        "risk_decision",
        "action_executed",
        "reply_sent",
      ],
    );
  });

  it("keeps the previous case details when replay processing fails before persistence", async () => {
    const prisma = new InMemoryPrisma();
    const existing = await prisma.afterSalesCase.create({
      data: {
        id: "case_msg_1",
        merchantId: "demo",
        channel: "taobao",
        customerName: "Ada",
        category: "address_change",
        riskLevel: "low",
        automationMode: "auto_execute",
        customerMessage: "old message",
        customerReply: "old reply",
        actions: [{ type: "change_address", status: "success" }],
      },
    });
    await prisma.caseMessage.create({
      data: {
        caseId: existing.id,
        senderType: "customer",
        text: "old message",
      },
    });
    await prisma.caseAction.create({
      data: {
        caseId: existing.id,
        type: "change_address",
        status: "success",
      },
    });
    await prisma.auditLog.create({
      data: {
        caseId: existing.id,
        action: "event_received",
        details: { text: "old message" },
      },
    });
    const provider = {
      normalizeIncoming: async (input: unknown) => input as NormalizedChannelEvent,
      sendMessage: async () => ({ success: true, messageId: "reply_1" }),
    } as unknown as WecomSandboxProvider;
    const agentService = {
      decide: async (_text: string, context?: { tenantId?: string }) => {
        assert.strictEqual(context?.tenantId, "demo");
        return {
          category: "address_change",
          riskLevel: "low",
          automationMode: "auto_execute",
          replyText: "new reply",
          suggestedActions: [{ type: "change_address", status: "pending" }],
        };
      },
    } as unknown as AgentService;
    const actionService = {
      executeMockAction: async () => {
        throw new Error("adapter failed");
      },
    } as unknown as ActionService;
    const controller = new WecomController(
      provider,
      agentService,
      actionService,
      prisma as unknown as PrismaService,
    );
    const payload = {
      source: "wecom_sandbox",
      merchantId: "demo",
      channel: "taobao",
      externalConversationId: "conv_1",
      externalMessageId: "msg_1",
      senderName: "Ada",
      text: "change my address",
      receivedAt: "2026-06-05T12:00:00.000Z",
    };

    await assert.rejects(() => controller.handleEvent(payload), /adapter failed/);

    assert.strictEqual(prisma.cases.get("case_msg_1")?.customerMessage, "old message");
    assert.deepStrictEqual(
      prisma.caseMessages.map((message) => message.text),
      ["old message"],
    );
    assert.deepStrictEqual(
      prisma.caseActions.map((action) => action.type),
      ["change_address"],
    );
    assert.deepStrictEqual(
      prisma.auditLogs.map((log) => log.action),
      ["event_received"],
    );
    assert.strictEqual(prisma.normalizedEvents.length, 0);
  });
});
