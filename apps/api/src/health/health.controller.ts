import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import type { HealthReadinessResponse, HealthResponse } from "@smart-cs-agent/shared";
import { ChannelEventReviewService } from "../channels/channel-event-review.service";
import { ChannelWebhookSecurityService } from "../channels/channel-webhook-security.service";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "smart-cs-agent-api",
      timestamp: new Date().toISOString(),
    };
  }
}

@Controller("health")
export class HealthReadinessController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelWebhooks: ChannelWebhookSecurityService,
    private readonly channelEvents: ChannelEventReviewService,
  ) {}

  @Get("ready")
  async getReadiness(): Promise<HealthReadinessResponse> {
    const timestamp = new Date().toISOString();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const channelQueueHealth = await this.channelEvents.getQueueHealth(
        loadQueueHealthThresholds(),
      );
      const channelQueue = toReadinessQueueCheck(channelQueueHealth);

      return {
        status: channelQueue.status === "degraded" ? "degraded" : "ok",
        service: "smart-cs-agent-api",
        timestamp,
        checks: {
          database: {
            status: "ok",
          },
          channelWebhooks: this.channelWebhooks.getReadiness(),
          channelQueue,
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "unhealthy",
        service: "smart-cs-agent-api",
        timestamp,
        checks: {
          database: {
            status: "unhealthy",
            message: "Database readiness check failed",
          },
          channelWebhooks: this.channelWebhooks.getReadiness(),
        },
      });
    }
  }
}

function loadQueueHealthThresholds() {
  return {
    pendingWarnThreshold: readOptionalInt(
      process.env.CHANNEL_QUEUE_PENDING_WARN_THRESHOLD,
    ),
    oldestPendingWarnSeconds: readOptionalInt(
      process.env.CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS,
    ),
    staleProcessingWarnThreshold: readOptionalInt(
      process.env.CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD,
    ),
    staleAfterMinutes:
      readOptionalInt(process.env.CHANNEL_QUEUE_STALE_AFTER_MINUTES) ?? 15,
  };
}

function readOptionalInt(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toReadinessQueueCheck(queueHealth: {
  status: "ok" | "degraded";
  pendingCount: number;
  processingCount: number;
  staleProcessingCount: number;
  oldestPendingAgeSeconds: number | null;
  thresholds: {
    pendingWarnThreshold?: number;
    oldestPendingWarnSeconds?: number;
    staleProcessingWarnThreshold?: number;
    staleAfterMinutes: number;
  };
  reasons: string[];
}) {
  return {
    status: queueHealth.status,
    pendingCount: queueHealth.pendingCount,
    processingCount: queueHealth.processingCount,
    staleProcessingCount: queueHealth.staleProcessingCount,
    oldestPendingAgeSeconds: queueHealth.oldestPendingAgeSeconds,
    thresholds: queueHealth.thresholds,
    reasons: queueHealth.reasons,
  };
}
