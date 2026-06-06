import assert from "node:assert";
import { describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { ChannelEventReviewService } from "./channel-event-review.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AgentService } from "../agent/agent.service";

describe("ChannelEventReviewService", () => {
  it("lists pending normalized events for one tenant without leaking other tenants", async () => {
    const createdAt = new Date("2026-06-06T05:00:00.000Z");
    const receivedAt = new Date("2026-06-06T04:59:00.000Z");
    const prisma = {
      normalizedChannelEvent: {
        findMany: async (query: unknown) => {
          assert.deepStrictEqual(query, {
            where: {
              merchantId: "tenant_1",
              source: "real_channel_webhook",
              reviewStatus: "pending",
            },
            orderBy: { createdAt: "desc" },
            take: 50,
          });
          return [
            {
              id: "event_1",
              source: "real_channel_webhook",
              merchantId: "tenant_1",
              channel: "taobao",
              externalConversationId: "conv_1",
              externalMessageId: "msg_1",
              senderName: "Lin",
              text: "Where is my order?",
              receivedAt,
              createdAt,
              reviewStatus: "pending",
              reviewedBy: null,
              reviewedAt: null,
              replayedCaseId: null,
              reviewNote: null,
            },
          ];
        },
      },
    };
    const service = new ChannelEventReviewService(
      prisma as unknown as PrismaService,
      fakeAgent(),
    );

    const events = await service.listPending("tenant_1");

    assert.deepStrictEqual(events, [
      {
        id: "event_1",
        merchantId: "tenant_1",
        channel: "taobao",
        externalConversationId: "conv_1",
        externalMessageId: "msg_1",
        senderName: "Lin",
        text: "Where is my order?",
        receivedAt: "2026-06-06T04:59:00.000Z",
        createdAt: "2026-06-06T05:00:00.000Z",
        reviewStatus: "pending",
      },
    ]);
  });

  it("ignores a pending event for the request tenant", async () => {
    const updates: unknown[] = [];
    const service = new ChannelEventReviewService(
      {
        normalizedChannelEvent: {
          updateMany: async (query: unknown) => {
            updates.push(query);
            return { count: 1 };
          },
        },
      } as unknown as PrismaService,
      fakeAgent(),
    );

    const result = await service.ignore("event_1", {
      tenantId: "tenant_1",
      operatorId: "operator_1",
      note: "duplicate",
    });

    assert.deepStrictEqual(result, {
      status: "ignored",
      eventId: "event_1",
      reviewedAt: result.reviewedAt,
    });
    assert.deepStrictEqual(updates, [
      {
        where: {
          id: "event_1",
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "pending",
        },
        data: {
          reviewStatus: "ignored",
          reviewedBy: "operator_1",
          reviewedAt: result.reviewedAt,
          reviewNote: "duplicate",
        },
      },
    ]);
  });

  it("replays a pending real-channel event into a human-confirm case without executing actions", async () => {
    const createdCases: unknown[] = [];
    const createdMessages: unknown[] = [];
    const createdActions: unknown[] = [];
    const auditLogs: unknown[] = [];
    const updates: unknown[] = [];
    const findFirstQueries: unknown[] = [];
    const event = normalizedEvent();
    const service = new ChannelEventReviewService(
      transactionStore({
        event,
        createdCases,
        createdMessages,
        createdActions,
        auditLogs,
        updates,
        findFirstQueries,
      }),
      fakeAgent({
        category: "logistics",
        riskLevel: "low",
        automationMode: "auto_execute",
        replyText: "I checked the shipment.",
        suggestedActions: [{ type: "query_logistics", status: "pending" }],
      }),
    );

    const result = await service.replay("event_1", {
      tenantId: "tenant_1",
      operatorId: "operator_1",
    });

    assert.strictEqual(result.status, "replayed");
    assert.strictEqual(result.eventId, "event_1");
    assert.strictEqual(result.caseId, "case_replay_event_1");
    assert.strictEqual(result.automationMode, "human_confirm");
    assert.deepStrictEqual(findFirstQueries, [
      {
        where: {
          id: "event_1",
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "pending",
        },
      },
    ]);
    assert.deepStrictEqual(createdCases, [
      {
        id: "case_replay_event_1",
        merchantId: "tenant_1",
        channel: "taobao",
        customerName: "Lin",
        category: "logistics",
        riskLevel: "low",
        automationMode: "human_confirm",
        customerMessage: "Where is my order?",
        customerReply: "I checked the shipment.",
        actions: [{ type: "query_logistics", status: "pending" }],
      },
    ]);
    assert.deepStrictEqual(createdMessages, [
      {
        caseId: "case_replay_event_1",
        senderType: "customer",
        text: "Where is my order?",
        createdAt: event.receivedAt,
      },
    ]);
    assert.deepStrictEqual(createdActions, [
      {
        caseId: "case_replay_event_1",
        type: "query_logistics",
        status: "pending",
        params: { type: "query_logistics", status: "pending" },
      },
    ]);
    assert.strictEqual(
      auditLogs.some((entry) => JSON.stringify(entry).includes("real_channel_event_replayed")),
      true,
    );
    assert.deepStrictEqual(updates, [
      {
        where: { id: "event_1" },
        data: {
          reviewStatus: "replayed",
          reviewedBy: "operator_1",
          reviewedAt: result.reviewedAt,
          replayedCaseId: "case_replay_event_1",
        },
      },
    ]);
  });

  it("does not ignore events outside the tenant, source, or pending review state", async () => {
    const updates: unknown[] = [];
    const service = new ChannelEventReviewService(
      {
        normalizedChannelEvent: {
          updateMany: async (query: unknown) => {
            updates.push(query);
            return { count: 0 };
          },
        },
      } as unknown as PrismaService,
      fakeAgent(),
    );

    await assert.rejects(
      () =>
        service.ignore("event_1", {
          tenantId: "tenant_2",
          operatorId: "operator_1",
        }),
      NotFoundException,
    );
    assert.deepStrictEqual(updates, [
      {
        where: {
          id: "event_1",
          merchantId: "tenant_2",
          source: "real_channel_webhook",
          reviewStatus: "pending",
        },
        data: {
          reviewStatus: "ignored",
          reviewedBy: "operator_1",
          reviewedAt: (updates[0] as { data: { reviewedAt: Date } }).data.reviewedAt,
          reviewNote: undefined,
        },
      },
    ]);
  });

  it("does not replay events outside the request tenant", async () => {
    const service = new ChannelEventReviewService(
      transactionStore({
        event: null,
        createdCases: [],
        createdMessages: [],
        createdActions: [],
        auditLogs: [],
        updates: [],
        findFirstQueries: [],
      }),
      fakeAgent(),
    );

    await assert.rejects(
      () =>
        service.replay("event_1", {
          tenantId: "tenant_2",
          operatorId: "operator_1",
        }),
      NotFoundException,
    );
  });
});

function normalizedEvent() {
  return {
    id: "event_1",
    source: "real_channel_webhook",
    merchantId: "tenant_1",
    channel: "taobao",
    externalConversationId: "conv_1",
    externalMessageId: "msg_1",
    senderName: "Lin",
    text: "Where is my order?",
    receivedAt: new Date("2026-06-06T05:00:00.000Z"),
    createdAt: new Date("2026-06-06T05:01:00.000Z"),
    reviewStatus: "pending",
    reviewedBy: null,
    reviewedAt: null,
    replayedCaseId: null,
    reviewNote: null,
  };
}

function fakeAgent(decision = {
  category: "unknown",
  riskLevel: "high",
  automationMode: "human_takeover",
  replyText: "Please wait.",
  suggestedActions: [{ type: "create_handoff", status: "pending" }],
}) {
  return {
    decide: async () => decision,
  } as unknown as AgentService;
}

function transactionStore({
  event,
  createdCases,
  createdMessages,
  createdActions,
  auditLogs,
  updates,
  findFirstQueries = [],
}: {
  event: ReturnType<typeof normalizedEvent> | null;
  createdCases: unknown[];
  createdMessages: unknown[];
  createdActions: unknown[];
  auditLogs: unknown[];
  updates: unknown[];
  findFirstQueries?: unknown[];
}) {
  type Store = {
    $transaction<T>(callback: (tx: Store) => Promise<T>): Promise<T>;
    normalizedChannelEvent: {
      findFirst(args: unknown): Promise<typeof event>;
      update(args: unknown): Promise<unknown>;
    };
    afterSalesCase: { create(args: { data: unknown }): Promise<{ id: string }> };
    caseMessage: { create(args: { data: unknown }): Promise<unknown> };
    caseAction: { create(args: { data: unknown }): Promise<unknown> };
    auditLog: { create(args: { data: unknown }): Promise<unknown> };
  };
  const store: Store = {
    $transaction: async <T>(callback: (tx: Store) => Promise<T>) => callback(store),
    normalizedChannelEvent: {
      findFirst: async (args: unknown) => {
        findFirstQueries.push(args);
        return event;
      },
      update: async (args: unknown) => {
        updates.push(args);
        return args;
      },
    },
    afterSalesCase: {
      create: async ({ data }: { data: unknown }) => {
        createdCases.push(data);
        return { id: "case_replay_event_1" };
      },
    },
    caseMessage: {
      create: async ({ data }: { data: unknown }) => {
        createdMessages.push(data);
        return data;
      },
    },
    caseAction: {
      create: async ({ data }: { data: unknown }) => {
        createdActions.push(data);
        return data;
      },
    },
    auditLog: {
      create: async ({ data }: { data: unknown }) => {
        auditLogs.push(data);
        return data;
      },
    },
  };

  return store as unknown as PrismaService;
}
