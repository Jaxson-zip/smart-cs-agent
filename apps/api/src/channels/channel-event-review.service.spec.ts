import assert from "node:assert";
import { describe, it } from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
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
    const updateManyQueries: unknown[] = [];
    const findFirstQueries: unknown[] = [];
    const event = normalizedEvent({ reviewStatus: "processing" });
    const service = new ChannelEventReviewService(
      transactionStore({
        event,
        createdCases,
        createdMessages,
        createdActions,
        auditLogs,
        updates,
        updateManyQueries,
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
    assert.deepStrictEqual(updateManyQueries, [
      {
        where: {
          id: "event_1",
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "pending",
        },
        data: {
          reviewStatus: "processing",
          reviewedBy: "operator_1",
          reviewedAt: result.reviewedAt,
        },
      },
    ]);
    assert.deepStrictEqual(findFirstQueries, [
      {
        where: {
          id: "event_1",
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "processing",
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
          findFirst: async () => null,
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

  it("returns a conflict when ignoring an event that was already reviewed", async () => {
    const service = new ChannelEventReviewService(
      {
        normalizedChannelEvent: {
          updateMany: async () => ({ count: 0 }),
          findFirst: async () => ({ id: "event_1", reviewStatus: "replayed" }),
        },
      } as unknown as PrismaService,
      fakeAgent(),
    );

    await assert.rejects(
      () =>
        service.ignore("event_1", {
          tenantId: "tenant_1",
          operatorId: "operator_1",
        }),
      ConflictException,
    );
  });

  it("does not replay events outside the request tenant", async () => {
    const service = new ChannelEventReviewService(
      transactionStore({
        event: null,
        claimCount: 0,
        createdCases: [],
        createdMessages: [],
        createdActions: [],
        auditLogs: [],
        updates: [],
        updateManyQueries: [],
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

  it("returns a conflict without calling the agent when replaying an already reviewed event", async () => {
    let agentCalled = false;
    const service = new ChannelEventReviewService(
      transactionStore({
        event: normalizedEvent({ reviewStatus: "ignored" }),
        claimCount: 0,
        createdCases: [],
        createdMessages: [],
        createdActions: [],
        auditLogs: [],
        updates: [],
        updateManyQueries: [],
        findFirstQueries: [],
      }),
      {
        decide: async () => {
          agentCalled = true;
          return fakeAgentDecision();
        },
      } as unknown as AgentService,
    );

    await assert.rejects(
      () =>
        service.replay("event_1", {
          tenantId: "tenant_1",
          operatorId: "operator_1",
        }),
      ConflictException,
    );
    assert.strictEqual(agentCalled, false);
  });

  it("recovers stale processing events for the request tenant and audits the operation", async () => {
    const findManyQueries: unknown[] = [];
    const updateManyQueries: unknown[] = [];
    const countQueries: unknown[] = [];
    const auditLogs: unknown[] = [];
    const service = new ChannelEventReviewService(
      {
        $transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
          callback({
            normalizedChannelEvent: {
              findMany: async (query: unknown) => {
                findManyQueries.push(query);
                return [{ id: "event_1" }, { id: "event_2" }];
              },
              updateMany: async (query: unknown) => {
                updateManyQueries.push(query);
                return { count: 2 };
              },
              count: async (query: unknown) => {
                countQueries.push(query);
                return [4, 0][countQueries.length - 1] ?? 0;
              },
            },
            auditLog: {
              create: async ({ data }: { data: unknown }) => {
                auditLogs.push(data);
                return data;
              },
            },
          }),
      } as unknown as PrismaService,
      fakeAgent(),
    );
    const now = new Date("2026-06-06T07:30:00.000Z");

    const result = await service.recoverStaleProcessing({
      tenantId: "tenant_1",
      operatorId: "admin_1",
      olderThanMinutes: 15,
      limit: 50,
      now,
    });

    const recoveredBefore = new Date("2026-06-06T07:15:00.000Z");
    assert.deepStrictEqual(result, {
      status: "recovered",
      recoveredCount: 2,
      recoveredBefore,
      eventIds: ["event_1", "event_2"],
    });
    assert.deepStrictEqual(findManyQueries, [
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "processing",
          reviewedAt: { lt: recoveredBefore },
        },
        select: { id: true },
        take: 50,
        orderBy: { reviewedAt: "asc" },
      },
    ]);
    assert.deepStrictEqual(updateManyQueries, [
      {
        where: {
          id: { in: ["event_1", "event_2"] },
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "processing",
          reviewedAt: { lt: recoveredBefore },
        },
        data: {
          reviewStatus: "pending",
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: "Recovered stale processing claim by admin_1",
        },
      },
    ]);
    assert.deepStrictEqual(countQueries, [
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "pending",
        },
      },
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "processing",
          reviewedAt: { lt: recoveredBefore },
        },
      },
    ]);
    assert.strictEqual(
      auditLogs.some((entry) =>
        JSON.stringify(entry).includes("real_channel_event_processing_recovered"),
      ),
      true,
    );
    assert.deepStrictEqual(auditLogs[0], {
      caseId: null,
      action: "real_channel_event_processing_recovered",
      details: {
        tenantId: "tenant_1",
        operatorId: "admin_1",
        recoveredBefore: "2026-06-06T07:15:00.000Z",
        recoveredCount: 2,
        eventIds: ["event_1", "event_2"],
        queueAfter: {
          pendingCount: 4,
          staleProcessingCount: 0,
        },
        queueHealthyAfter: true,
      },
    });
  });

  it("lists sanitized queue operation audits for the request tenant", async () => {
    const findManyQueries: unknown[] = [];
    const service = new ChannelEventReviewService(
      {
        auditLog: {
          findMany: async (query: unknown) => {
            findManyQueries.push(query);
            return [
              {
                id: "audit_1",
                action: "real_channel_event_processing_recovered",
                createdAt: new Date("2026-06-06T07:31:00.000Z"),
                details: {
                  tenantId: "tenant_1",
                  operatorId: "admin_1",
                  recoveredBefore: "2026-06-06T07:15:00.000Z",
                  recoveredCount: 2,
                  eventIds: ["event_1", "event_2"],
                  source: "real_channel_webhook",
                  queueAfter: {
                    pendingCount: 4,
                    staleProcessingCount: 0,
                  },
                  queueHealthyAfter: true,
                },
              },
            ];
          },
        },
      } as unknown as PrismaService,
      fakeAgent(),
    );

    const audits = await service.listQueueOperationAudits({
      tenantId: "tenant_1",
      limit: 10,
    });

    assert.deepStrictEqual(findManyQueries, [
      {
        where: {
          action: { in: ["real_channel_event_processing_recovered"] },
          details: { path: ["tenantId"], equals: "tenant_1" },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    ]);
    assert.deepStrictEqual(audits, [
      {
        id: "audit_1",
        type: "stale_processing_recovered",
        operatorId: "admin_1",
        recoveredCount: 2,
        recoveredBefore: "2026-06-06T07:15:00.000Z",
        queueHealthyAfter: true,
        queueAfter: {
          pendingCount: 4,
          staleProcessingCount: 0,
        },
        createdAt: "2026-06-06T07:31:00.000Z",
      },
    ]);
    assert.ok(!JSON.stringify(audits).includes("tenant_1"));
    assert.ok(!JSON.stringify(audits).includes("event_1"));
    assert.ok(!JSON.stringify(audits).includes("real_channel_webhook"));
  });

  it("summarizes queue review operations for the request tenant without leaking raw details", async () => {
    const countQueries: unknown[] = [];
    const findManyQueries: unknown[] = [];
    const service = new ChannelEventReviewService(
      {
        normalizedChannelEvent: {
          count: async (query: unknown) => {
            countQueries.push(query);
            return [5, 3][countQueries.length - 1] ?? 0;
          },
          findMany: async (query: unknown) => {
            findManyQueries.push(query);
            return [
              {
                reviewedBy: "agent_1",
                reviewStatus: "replayed",
                reviewedAt: new Date("2026-06-06T07:10:00.000Z"),
                merchantId: "tenant_1",
                source: "real_channel_webhook",
                externalMessageId: "must_not_leak",
                text: "must_not_leak",
              },
              {
                reviewedBy: "agent_1",
                reviewStatus: "ignored",
                reviewedAt: new Date("2026-06-06T07:20:00.000Z"),
                merchantId: "tenant_1",
                source: "real_channel_webhook",
              },
              {
                reviewedBy: "agent_2",
                reviewStatus: "replayed",
                reviewedAt: new Date("2026-06-06T07:30:00.000Z"),
                merchantId: "tenant_1",
                source: "real_channel_webhook",
              },
            ];
          },
        },
        auditLog: {
          findMany: async (query: unknown) => {
            findManyQueries.push(query);
            return [
              {
                id: "audit_1",
                action: "real_channel_event_processing_recovered",
                createdAt: new Date("2026-06-06T07:40:00.000Z"),
                details: {
                  tenantId: "tenant_1",
                  operatorId: "agent_2",
                  recoveredCount: 4,
                  recoveredBefore: "2026-06-06T07:15:00.000Z",
                  eventIds: ["must_not_leak"],
                  payload: "must_not_leak",
                },
              },
              {
                id: "audit_2",
                action: "real_channel_event_processing_recovered",
                createdAt: new Date("2026-06-06T07:45:00.000Z"),
                details: {
                  tenantId: "tenant_1",
                  operatorId: "agent_1",
                  recoveredCount: 1,
                },
              },
            ];
          },
        },
      } as unknown as PrismaService,
      fakeAgent(),
    );
    const from = new Date("2026-06-06T07:00:00.000Z");
    const to = new Date("2026-06-06T08:00:00.000Z");

    const summary = await service.getQueueAuditSummary({
      tenantId: "tenant_1",
      from,
      to,
      now: to,
    });

    assert.deepStrictEqual(countQueries, [
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "replayed",
          reviewedAt: { gte: from, lte: to },
        },
      },
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "ignored",
          reviewedAt: { gte: from, lte: to },
        },
      },
    ]);
    assert.deepStrictEqual(findManyQueries, [
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: { in: ["replayed", "ignored"] },
          reviewedAt: { gte: from, lte: to },
        },
        select: {
          reviewedBy: true,
          reviewStatus: true,
          reviewedAt: true,
        },
      },
      {
        where: {
          action: { in: ["real_channel_event_processing_recovered"] },
          createdAt: { gte: from, lte: to },
          details: { path: ["tenantId"], equals: "tenant_1" },
        },
        select: {
          createdAt: true,
          details: true,
        },
      },
    ]);
    assert.deepStrictEqual(summary, {
      measuredAt: "2026-06-06T08:00:00.000Z",
      window: {
        from: "2026-06-06T07:00:00.000Z",
        to: "2026-06-06T08:00:00.000Z",
      },
      totals: {
        replayedCount: 5,
        ignoredCount: 3,
        recoveryRunCount: 2,
        recoveredEventCount: 5,
      },
      byOperator: [
        {
          operatorId: "agent_1",
          replayedCount: 1,
          ignoredCount: 1,
          recoveryRunCount: 1,
          recoveredEventCount: 1,
          lastActivityAt: "2026-06-06T07:45:00.000Z",
        },
        {
          operatorId: "agent_2",
          replayedCount: 1,
          ignoredCount: 0,
          recoveryRunCount: 1,
          recoveredEventCount: 4,
          lastActivityAt: "2026-06-06T07:40:00.000Z",
        },
      ],
    });
    assert.ok(!JSON.stringify(summary).includes("tenant_1"));
    assert.ok(!JSON.stringify(summary).includes("must_not_leak"));
    assert.ok(!JSON.stringify(summary).includes("real_channel_webhook"));
  });

  it("reports queue metrics without exposing customer event details", async () => {
    const countQueries: unknown[] = [];
    const findFirstQueries: unknown[] = [];
    const service = new ChannelEventReviewService(
      {
        normalizedChannelEvent: {
          count: async (query: unknown) => {
            countQueries.push(query);
            return [3, 2, 1, 8, 5][countQueries.length - 1] ?? 0;
          },
          findFirst: async (query: unknown) => {
            findFirstQueries.push(query);
            return { receivedAt: new Date("2026-06-06T07:00:00.000Z") };
          },
        },
      } as unknown as PrismaService,
      fakeAgent(),
    );
    const now = new Date("2026-06-06T07:30:00.000Z");

    const result = await service.getQueueMetrics({
      tenantId: "tenant_1",
      staleAfterMinutes: 15,
      now,
    });

    const staleBefore = new Date("2026-06-06T07:15:00.000Z");
    assert.deepStrictEqual(result, {
      measuredAt: now,
      staleAfterMinutes: 15,
      pendingCount: 3,
      processingCount: 2,
      staleProcessingCount: 1,
      replayedCount: 8,
      ignoredCount: 5,
      oldestPendingReceivedAt: new Date("2026-06-06T07:00:00.000Z"),
      oldestPendingAgeSeconds: 1800,
    });
    assert.deepStrictEqual(countQueries, [
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "pending",
        },
      },
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "processing",
        },
      },
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "processing",
          reviewedAt: { lt: staleBefore },
        },
      },
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "replayed",
        },
      },
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "ignored",
        },
      },
    ]);
    assert.deepStrictEqual(findFirstQueries, [
      {
        where: {
          merchantId: "tenant_1",
          source: "real_channel_webhook",
          reviewStatus: "pending",
        },
        select: { receivedAt: true },
        orderBy: { receivedAt: "asc" },
      },
    ]);
  });

  it("reports source-wide queue health for readiness without tenant details", async () => {
    const countQueries: unknown[] = [];
    const findFirstQueries: unknown[] = [];
    const service = new ChannelEventReviewService(
      {
        normalizedChannelEvent: {
          count: async (query: unknown) => {
            countQueries.push(query);
            return [12, 2, 1][countQueries.length - 1] ?? 0;
          },
          findFirst: async (query: unknown) => {
            findFirstQueries.push(query);
            return { receivedAt: new Date("2026-06-06T07:00:00.000Z") };
          },
        },
      } as unknown as PrismaService,
      fakeAgent(),
    );

    const result = await service.getQueueHealth({
      now: new Date("2026-06-06T07:30:00.000Z"),
      staleAfterMinutes: 15,
      pendingWarnThreshold: 10,
      oldestPendingWarnSeconds: 900,
      staleProcessingWarnThreshold: 0,
    });

    assert.deepStrictEqual(result, {
      status: "degraded",
      measuredAt: new Date("2026-06-06T07:30:00.000Z"),
      pendingCount: 12,
      processingCount: 2,
      staleProcessingCount: 1,
      oldestPendingAgeSeconds: 1800,
      thresholds: {
        pendingWarnThreshold: 10,
        oldestPendingWarnSeconds: 900,
        staleProcessingWarnThreshold: 0,
        staleAfterMinutes: 15,
      },
      reasons: [
        "pending_count_above_threshold",
        "oldest_pending_age_above_threshold",
        "stale_processing_above_threshold",
      ],
    });
    assert.deepStrictEqual(countQueries, [
      {
        where: {
          source: "real_channel_webhook",
          reviewStatus: "pending",
        },
      },
      {
        where: {
          source: "real_channel_webhook",
          reviewStatus: "processing",
        },
      },
      {
        where: {
          source: "real_channel_webhook",
          reviewStatus: "processing",
          reviewedAt: { lt: new Date("2026-06-06T07:15:00.000Z") },
        },
      },
    ]);
    assert.deepStrictEqual(findFirstQueries, [
      {
        where: {
          source: "real_channel_webhook",
          reviewStatus: "pending",
        },
        select: { receivedAt: true },
        orderBy: { receivedAt: "asc" },
      },
    ]);
    assert.ok(!JSON.stringify(result).includes("tenant_"));
  });
});

function normalizedEvent(input: { reviewStatus?: string } = {}) {
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
    reviewStatus: input.reviewStatus ?? "pending",
    reviewedBy: null,
    reviewedAt: null,
    replayedCaseId: null,
    reviewNote: null,
  };
}

function fakeAgent(decision = {
  ...fakeAgentDecision(),
}) {
  return {
    decide: async () => decision,
  } as unknown as AgentService;
}

function fakeAgentDecision() {
  return {
    category: "unknown",
    riskLevel: "high",
    automationMode: "human_takeover",
    replyText: "Please wait.",
    suggestedActions: [{ type: "create_handoff", status: "pending" }],
  };
}

function transactionStore({
  event,
  createdCases,
  createdMessages,
  createdActions,
  auditLogs,
  updates,
  updateManyQueries = [],
  findFirstQueries = [],
  claimCount = 1,
}: {
  event: ReturnType<typeof normalizedEvent> | null;
  createdCases: unknown[];
  createdMessages: unknown[];
  createdActions: unknown[];
  auditLogs: unknown[];
  updates: unknown[];
  updateManyQueries?: unknown[];
  findFirstQueries?: unknown[];
  claimCount?: number;
}) {
  type Store = {
    $transaction<T>(callback: (tx: Store) => Promise<T>): Promise<T>;
    normalizedChannelEvent: {
      updateMany(args: unknown): Promise<{ count: number }>;
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
      updateMany: async (args: unknown) => {
        updateManyQueries.push(args);
        return { count: claimCount };
      },
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
