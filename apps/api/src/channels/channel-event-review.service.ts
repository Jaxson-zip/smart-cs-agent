import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ChannelEventReviewStatus } from "@prisma/client";
import type { AutomationMode, AfterSalesAction } from "@smart-cs-agent/shared";
import { AgentService } from "../agent/agent.service";
import { PrismaService } from "../prisma/prisma.service";

type ReviewContext = {
  tenantId: string;
  operatorId: string;
};

type IgnoreInput = ReviewContext & {
  note?: string;
};

type RecoverStaleProcessingInput = ReviewContext & {
  olderThanMinutes?: number;
  limit?: number;
  now?: Date;
};

type QueueMetricsInput = {
  tenantId: string;
  staleAfterMinutes?: number;
  now?: Date;
};

type QueueOperationAuditInput = {
  tenantId: string;
  limit?: number;
};

type QueueAuditSummaryInput = {
  tenantId: string;
  from?: Date;
  to?: Date;
  now?: Date;
};

type QueueHealthInput = {
  staleAfterMinutes?: number;
  pendingWarnThreshold?: number;
  oldestPendingWarnSeconds?: number;
  staleProcessingWarnThreshold?: number;
  now?: Date;
};

const toJsonInput = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const REAL_CHANNEL_EVENT_SOURCE = "real_channel_webhook";
const RECOVERY_AUDIT_ACTION = "real_channel_event_processing_recovered";
const PENDING_REVIEW_STATUS = "pending";
const PROCESSING_REVIEW_STATUS = "processing";
const REVIEWED_REVIEW_STATUSES: ChannelEventReviewStatus[] = [
  "replayed",
  "ignored",
];

@Injectable()
export class ChannelEventReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
  ) {}

  async listPending(tenantId: string, limit = 50) {
    const events = await this.prisma.normalizedChannelEvent.findMany({
      where: {
        merchantId: tenantId,
        source: REAL_CHANNEL_EVENT_SOURCE,
        reviewStatus: PENDING_REVIEW_STATUS,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return events.map((event) => ({
      id: event.id,
      merchantId: event.merchantId,
      channel: event.channel,
      externalConversationId: event.externalConversationId,
      externalMessageId: event.externalMessageId,
      senderName: event.senderName,
      text: event.text,
      receivedAt: event.receivedAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
      reviewStatus: event.reviewStatus,
    }));
  }

  async ignore(eventId: string, input: IgnoreInput) {
    const reviewedAt = new Date();
    const result = await this.prisma.normalizedChannelEvent.updateMany({
      where: {
        id: eventId,
        merchantId: input.tenantId,
        source: REAL_CHANNEL_EVENT_SOURCE,
        reviewStatus: PENDING_REVIEW_STATUS,
      },
      data: {
        reviewStatus: "ignored",
        reviewedBy: input.operatorId,
        reviewedAt,
        reviewNote: input.note,
      },
    });

    if (result.count === 0) {
      await assertPendingEventCanBeReviewed(this.prisma, eventId, input.tenantId);
    }

    return {
      status: "ignored" as const,
      eventId,
      reviewedAt,
    };
  }

  async replay(eventId: string, context: ReviewContext) {
    const reviewedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.normalizedChannelEvent.updateMany({
        where: {
          id: eventId,
          merchantId: context.tenantId,
          source: REAL_CHANNEL_EVENT_SOURCE,
          reviewStatus: PENDING_REVIEW_STATUS,
        },
        data: {
          reviewStatus: PROCESSING_REVIEW_STATUS,
          reviewedBy: context.operatorId,
          reviewedAt,
        },
      });

      if (claim.count === 0) {
        await assertPendingEventCanBeReviewed(tx, eventId, context.tenantId);
      }

      const event = await tx.normalizedChannelEvent.findFirst({
        where: {
          id: eventId,
          merchantId: context.tenantId,
          source: REAL_CHANNEL_EVENT_SOURCE,
          reviewStatus: PROCESSING_REVIEW_STATUS,
        },
      });

      if (!event) {
        throw new NotFoundException("Pending channel event was not found");
      }

      const decision = await this.agentService.decide(event.text, {
        tenantId: event.merchantId,
      });
      const automationMode = forceHumanReviewMode(decision.automationMode);
      const actions = (decision.suggestedActions ?? []).map((action) => ({
        ...action,
        status: "pending" as const,
      })) as AfterSalesAction[];
      const caseId = `case_replay_${event.id}`;

      await tx.afterSalesCase.create({
        data: {
          id: caseId,
          merchantId: event.merchantId,
          channel: event.channel,
          customerName: event.senderName,
          category: decision.category,
          riskLevel: decision.riskLevel,
          automationMode,
          customerMessage: event.text,
          customerReply: decision.replyText,
          actions: toJsonInput(actions),
        },
      });

      await tx.caseMessage.create({
        data: {
          caseId,
          senderType: "customer",
          text: event.text,
          createdAt: event.receivedAt,
        },
      });

      for (const action of actions) {
        await tx.caseAction.create({
          data: {
            caseId,
            type: action.type,
            status: action.status ?? "pending",
            params: toJsonInput(action),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          caseId,
          action: "real_channel_event_replayed",
          details: toJsonInput({
            normalizedEventId: event.id,
            operatorId: context.operatorId,
            originalAutomationMode: decision.automationMode,
            enforcedAutomationMode: automationMode,
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          caseId,
          action: "category_decision",
          details: toJsonInput({ category: decision.category }),
        },
      });
      await tx.auditLog.create({
        data: {
          caseId,
          action: "risk_decision",
          details: toJsonInput({
            riskLevel: decision.riskLevel,
            automationMode,
          }),
        },
      });

      await tx.normalizedChannelEvent.update({
        where: { id: event.id },
        data: {
          reviewStatus: "replayed",
          reviewedBy: context.operatorId,
          reviewedAt,
          replayedCaseId: caseId,
        },
      });

      return {
        status: "replayed" as const,
        eventId: event.id,
        caseId,
        automationMode,
        reviewedAt,
      };
    });
  }

  async recoverStaleProcessing(input: RecoverStaleProcessingInput) {
    const olderThanMinutes = input.olderThanMinutes ?? 15;
    const limit = input.limit ?? 100;
    const now = input.now ?? new Date();
    const recoveredBefore = new Date(now.getTime() - olderThanMinutes * 60_000);

    return this.prisma.$transaction(async (tx) => {
      const staleEvents = await tx.normalizedChannelEvent.findMany({
        where: {
          merchantId: input.tenantId,
          source: REAL_CHANNEL_EVENT_SOURCE,
          reviewStatus: PROCESSING_REVIEW_STATUS,
          reviewedAt: { lt: recoveredBefore },
        },
        select: { id: true },
        take: limit,
        orderBy: { reviewedAt: "asc" },
      });
      const eventIds = staleEvents.map((event) => event.id);

      if (eventIds.length === 0) {
        return {
          status: "recovered" as const,
          recoveredCount: 0,
          recoveredBefore,
          eventIds,
        };
      }

      const result = await tx.normalizedChannelEvent.updateMany({
        where: {
          id: { in: eventIds },
          merchantId: input.tenantId,
          source: REAL_CHANNEL_EVENT_SOURCE,
          reviewStatus: PROCESSING_REVIEW_STATUS,
          reviewedAt: { lt: recoveredBefore },
        },
        data: {
          reviewStatus: PENDING_REVIEW_STATUS,
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: `Recovered stale processing claim by ${input.operatorId}`,
        },
      });
      const [pendingCount, staleProcessingCount] = await Promise.all([
        tx.normalizedChannelEvent.count({
          where: {
            merchantId: input.tenantId,
            source: REAL_CHANNEL_EVENT_SOURCE,
            reviewStatus: PENDING_REVIEW_STATUS,
          },
        }),
        tx.normalizedChannelEvent.count({
          where: {
            merchantId: input.tenantId,
            source: REAL_CHANNEL_EVENT_SOURCE,
            reviewStatus: PROCESSING_REVIEW_STATUS,
            reviewedAt: { lt: recoveredBefore },
          },
        }),
      ]);

      await tx.auditLog.create({
        data: {
          caseId: null,
          action: RECOVERY_AUDIT_ACTION,
          details: toJsonInput({
            tenantId: input.tenantId,
            operatorId: input.operatorId,
            recoveredBefore: recoveredBefore.toISOString(),
            recoveredCount: result.count,
            eventIds,
            queueAfter: {
              pendingCount,
              staleProcessingCount,
            },
            queueHealthyAfter: staleProcessingCount === 0,
          }),
        },
      });

      return {
        status: "recovered" as const,
        recoveredCount: result.count,
        recoveredBefore,
        eventIds,
      };
    });
  }

  async listQueueOperationAudits(input: QueueOperationAuditInput) {
    const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        action: { in: [RECOVERY_AUDIT_ACTION] },
        details: { path: ["tenantId"], equals: input.tenantId },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return auditLogs.map((log) => {
      const details = isRecord(log.details) ? log.details : {};
      const queueAfter = isRecord(details.queueAfter)
        ? {
            pendingCount: readFiniteNumber(details.queueAfter.pendingCount),
            staleProcessingCount: readFiniteNumber(
              details.queueAfter.staleProcessingCount,
            ),
          }
        : null;

      return {
        id: log.id,
        type: "stale_processing_recovered" as const,
        operatorId: readString(details.operatorId),
        recoveredCount: readFiniteNumber(details.recoveredCount),
        recoveredBefore: readString(details.recoveredBefore),
        queueHealthyAfter: details.queueHealthyAfter === true,
        queueAfter,
        createdAt: log.createdAt.toISOString(),
      };
    });
  }

  async getQueueAuditSummary(input: QueueAuditSummaryInput) {
    const measuredAt = input.now ?? new Date();
    const to = input.to ?? measuredAt;
    const from = input.from ?? new Date(to.getTime() - 24 * 60 * 60_000);
    const reviewedWhere = {
      merchantId: input.tenantId,
      source: REAL_CHANNEL_EVENT_SOURCE,
      reviewStatus: { in: REVIEWED_REVIEW_STATUSES },
      reviewedAt: { gte: from, lte: to },
    };
    const recoveryWhere = {
      action: { in: [RECOVERY_AUDIT_ACTION] },
      createdAt: { gte: from, lte: to },
      details: { path: ["tenantId"], equals: input.tenantId },
    };

    const [replayedCount, ignoredCount, reviewedEvents, recoveryLogs] =
      await Promise.all([
        this.prisma.normalizedChannelEvent.count({
          where: {
            merchantId: input.tenantId,
            source: REAL_CHANNEL_EVENT_SOURCE,
            reviewStatus: "replayed",
            reviewedAt: { gte: from, lte: to },
          },
        }),
        this.prisma.normalizedChannelEvent.count({
          where: {
            merchantId: input.tenantId,
            source: REAL_CHANNEL_EVENT_SOURCE,
            reviewStatus: "ignored",
            reviewedAt: { gte: from, lte: to },
          },
        }),
        this.prisma.normalizedChannelEvent.findMany({
          where: reviewedWhere,
          select: {
            reviewedBy: true,
            reviewStatus: true,
            reviewedAt: true,
          },
        }),
        this.prisma.auditLog.findMany({
          where: recoveryWhere,
          select: {
            createdAt: true,
            details: true,
          },
        }),
      ]);
    const byOperator = new Map<
      string,
      {
        operatorId: string;
        replayedCount: number;
        ignoredCount: number;
        recoveryRunCount: number;
        recoveredEventCount: number;
        lastActivityAt: Date | null;
      }
    >();

    for (const event of reviewedEvents) {
      const operatorId = event.reviewedBy ?? "unknown";
      const summary = ensureOperatorSummary(byOperator, operatorId);
      if (event.reviewStatus === "replayed") summary.replayedCount += 1;
      if (event.reviewStatus === "ignored") summary.ignoredCount += 1;
      updateLastActivity(summary, event.reviewedAt);
    }

    let recoveredEventCount = 0;
    for (const log of recoveryLogs) {
      const details = isRecord(log.details) ? log.details : {};
      const operatorId = readString(details.operatorId) || "unknown";
      const recoveredCount = readFiniteNumber(details.recoveredCount);
      const summary = ensureOperatorSummary(byOperator, operatorId);

      summary.recoveryRunCount += 1;
      summary.recoveredEventCount += recoveredCount;
      recoveredEventCount += recoveredCount;
      updateLastActivity(summary, log.createdAt);
    }

    return {
      measuredAt: measuredAt.toISOString(),
      window: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totals: {
        replayedCount,
        ignoredCount,
        recoveryRunCount: recoveryLogs.length,
        recoveredEventCount,
      },
      byOperator: Array.from(byOperator.values())
        .sort((left, right) => {
          const rightTime = right.lastActivityAt?.getTime() ?? 0;
          const leftTime = left.lastActivityAt?.getTime() ?? 0;
          return rightTime - leftTime || left.operatorId.localeCompare(right.operatorId);
        })
        .map((summary) => ({
          ...summary,
          lastActivityAt: summary.lastActivityAt?.toISOString() ?? null,
        })),
    };
  }

  async getQueueMetrics(input: QueueMetricsInput) {
    const staleAfterMinutes = input.staleAfterMinutes ?? 15;
    const measuredAt = input.now ?? new Date();
    const staleBefore = new Date(
      measuredAt.getTime() - staleAfterMinutes * 60_000,
    );
    const baseWhere = {
      merchantId: input.tenantId,
      source: REAL_CHANNEL_EVENT_SOURCE,
    };

    const [
      pendingCount,
      processingCount,
      staleProcessingCount,
      replayedCount,
      ignoredCount,
      oldestPending,
    ] = await Promise.all([
      this.prisma.normalizedChannelEvent.count({
        where: { ...baseWhere, reviewStatus: PENDING_REVIEW_STATUS },
      }),
      this.prisma.normalizedChannelEvent.count({
        where: { ...baseWhere, reviewStatus: PROCESSING_REVIEW_STATUS },
      }),
      this.prisma.normalizedChannelEvent.count({
        where: {
          ...baseWhere,
          reviewStatus: PROCESSING_REVIEW_STATUS,
          reviewedAt: { lt: staleBefore },
        },
      }),
      this.prisma.normalizedChannelEvent.count({
        where: { ...baseWhere, reviewStatus: "replayed" },
      }),
      this.prisma.normalizedChannelEvent.count({
        where: { ...baseWhere, reviewStatus: "ignored" },
      }),
      this.prisma.normalizedChannelEvent.findFirst({
        where: { ...baseWhere, reviewStatus: PENDING_REVIEW_STATUS },
        select: { receivedAt: true },
        orderBy: { receivedAt: "asc" },
      }),
    ]);
    const oldestPendingReceivedAt = oldestPending?.receivedAt ?? null;
    const oldestPendingAgeSeconds = oldestPendingReceivedAt
      ? Math.max(
          0,
          Math.floor(
            (measuredAt.getTime() - oldestPendingReceivedAt.getTime()) / 1000,
          ),
        )
      : null;

    return {
      measuredAt,
      staleAfterMinutes,
      pendingCount,
      processingCount,
      staleProcessingCount,
      replayedCount,
      ignoredCount,
      oldestPendingReceivedAt,
      oldestPendingAgeSeconds,
    };
  }

  async getQueueHealth(input: QueueHealthInput = {}) {
    const staleAfterMinutes = input.staleAfterMinutes ?? 15;
    const measuredAt = input.now ?? new Date();
    const staleBefore = new Date(
      measuredAt.getTime() - staleAfterMinutes * 60_000,
    );
    const baseWhere = {
      source: REAL_CHANNEL_EVENT_SOURCE,
    };

    const [
      pendingCount,
      processingCount,
      staleProcessingCount,
      oldestPending,
    ] = await Promise.all([
      this.prisma.normalizedChannelEvent.count({
        where: { ...baseWhere, reviewStatus: PENDING_REVIEW_STATUS },
      }),
      this.prisma.normalizedChannelEvent.count({
        where: { ...baseWhere, reviewStatus: PROCESSING_REVIEW_STATUS },
      }),
      this.prisma.normalizedChannelEvent.count({
        where: {
          ...baseWhere,
          reviewStatus: PROCESSING_REVIEW_STATUS,
          reviewedAt: { lt: staleBefore },
        },
      }),
      this.prisma.normalizedChannelEvent.findFirst({
        where: { ...baseWhere, reviewStatus: PENDING_REVIEW_STATUS },
        select: { receivedAt: true },
        orderBy: { receivedAt: "asc" },
      }),
    ]);
    const oldestPendingAgeSeconds = oldestPending
      ? Math.max(
          0,
          Math.floor(
            (measuredAt.getTime() - oldestPending.receivedAt.getTime()) / 1000,
          ),
        )
      : null;
    const reasons: string[] = [];

    if (
      input.pendingWarnThreshold !== undefined &&
      pendingCount > input.pendingWarnThreshold
    ) {
      reasons.push("pending_count_above_threshold");
    }
    if (
      input.oldestPendingWarnSeconds !== undefined &&
      oldestPendingAgeSeconds !== null &&
      oldestPendingAgeSeconds > input.oldestPendingWarnSeconds
    ) {
      reasons.push("oldest_pending_age_above_threshold");
    }
    if (
      input.staleProcessingWarnThreshold !== undefined &&
      staleProcessingCount > input.staleProcessingWarnThreshold
    ) {
      reasons.push("stale_processing_above_threshold");
    }

    return {
      status: reasons.length > 0 ? "degraded" as const : "ok" as const,
      measuredAt,
      pendingCount,
      processingCount,
      staleProcessingCount,
      oldestPendingAgeSeconds,
      thresholds: {
        pendingWarnThreshold: input.pendingWarnThreshold,
        oldestPendingWarnSeconds: input.oldestPendingWarnSeconds,
        staleProcessingWarnThreshold: input.staleProcessingWarnThreshold,
        staleAfterMinutes,
      },
      reasons,
    };
  }
}

function forceHumanReviewMode(mode: AutomationMode): AutomationMode {
  return mode === "human_takeover" ? "human_takeover" : "human_confirm";
}

async function assertPendingEventCanBeReviewed(
  prisma: Pick<PrismaService, "normalizedChannelEvent">,
  eventId: string,
  tenantId: string,
) {
  const event = await prisma.normalizedChannelEvent.findFirst({
    where: {
      id: eventId,
      merchantId: tenantId,
      source: REAL_CHANNEL_EVENT_SOURCE,
    },
  });

  if (!event) {
    throw new NotFoundException("Pending channel event was not found");
  }

  throw new ConflictException("Channel event has already been reviewed");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function ensureOperatorSummary(
  summaries: Map<
    string,
    {
      operatorId: string;
      replayedCount: number;
      ignoredCount: number;
      recoveryRunCount: number;
      recoveredEventCount: number;
      lastActivityAt: Date | null;
    }
  >,
  operatorId: string,
) {
  const existing = summaries.get(operatorId);
  if (existing) return existing;

  const created = {
    operatorId,
    replayedCount: 0,
    ignoredCount: 0,
    recoveryRunCount: 0,
    recoveredEventCount: 0,
    lastActivityAt: null,
  };
  summaries.set(operatorId, created);
  return created;
}

function updateLastActivity(
  summary: { lastActivityAt: Date | null },
  activityAt: Date | null,
) {
  if (!activityAt) return;
  if (!summary.lastActivityAt || activityAt > summary.lastActivityAt) {
    summary.lastActivityAt = activityAt;
  }
}
