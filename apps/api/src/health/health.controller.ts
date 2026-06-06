import { Controller, Get, Header, ServiceUnavailableException } from "@nestjs/common";
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

@Controller()
export class HealthMetricsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelWebhooks: ChannelWebhookSecurityService,
    private readonly channelEvents: ChannelEventReviewService,
  ) {}

  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async getMetrics(): Promise<string> {
    const lines = new PrometheusMetricsBuilder();
    const webhookReadiness = this.channelWebhooks.getReadiness();

    lines.gauge("smart_cs_agent_api_up", "API process is serving HTTP", 1);
    lines.gauge(
      "smart_cs_agent_real_channel_webhook_enabled",
      "Real-channel webhook intake is open according to readiness",
      webhookReadiness.enabled ? 1 : 0,
    );
    lines.gauge(
      "smart_cs_agent_real_channel_webhook_kill_switch_enabled",
      "Real-channel webhook emergency kill switch state",
      webhookReadiness.status === "disabled_by_kill_switch" ? 1 : 0,
    );
    for (const status of WEBHOOK_READINESS_STATUSES) {
      lines.gauge(
        "smart_cs_agent_real_channel_webhook_status",
        "Real-channel webhook readiness status as a one-hot gauge",
        webhookReadiness.status === status ? 1 : 0,
        { status },
      );
    }

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      lines.gauge("smart_cs_agent_database_ready", "Database readiness state", 1);
      const queueHealth = await this.channelEvents.getQueueHealth(
        loadQueueHealthThresholds(),
      );
      appendQueueMetrics(lines, queueHealth);
    } catch {
      lines.gauge("smart_cs_agent_database_ready", "Database readiness state", 0);
    }

    return `${lines.toString()}\n`;
  }
}

const WEBHOOK_READINESS_STATUSES = [
  "ok",
  "disabled",
  "disabled_by_kill_switch",
  "misconfigured",
] as const;

const QUEUE_DEGRADED_REASONS = [
  "pending_count_above_threshold",
  "oldest_pending_age_above_threshold",
  "stale_processing_above_threshold",
] as const;

function appendQueueMetrics(
  lines: PrometheusMetricsBuilder,
  queueHealth: {
    status: "ok" | "degraded";
    pendingCount: number;
    processingCount: number;
    staleProcessingCount: number;
    oldestPendingAgeSeconds: number | null;
    reasons: string[];
  },
) {
  lines.gauge(
    "smart_cs_agent_channel_queue_degraded",
    "Source-wide real-channel review queue degraded state",
    queueHealth.status === "degraded" ? 1 : 0,
  );
  lines.gauge(
    "smart_cs_agent_channel_queue_pending_total",
    "Source-wide pending real-channel review events",
    queueHealth.pendingCount,
  );
  lines.gauge(
    "smart_cs_agent_channel_queue_processing_total",
    "Source-wide processing real-channel review events",
    queueHealth.processingCount,
  );
  lines.gauge(
    "smart_cs_agent_channel_queue_stale_processing_total",
    "Source-wide stale processing real-channel review events",
    queueHealth.staleProcessingCount,
  );
  lines.gauge(
    "smart_cs_agent_channel_queue_oldest_pending_age_seconds",
    "Age of the oldest pending real-channel review event",
    queueHealth.oldestPendingAgeSeconds ?? 0,
  );
  for (const reason of QUEUE_DEGRADED_REASONS) {
    lines.gauge(
      "smart_cs_agent_channel_queue_degraded_reason",
      "Source-wide real-channel review queue degraded reason as a one-hot gauge",
      queueHealth.reasons.includes(reason) ? 1 : 0,
      { reason },
    );
  }
}

class PrometheusMetricsBuilder {
  private readonly lines: string[] = [];
  private readonly describedMetrics = new Set<string>();

  gauge(
    name: string,
    help: string,
    value: number,
    labels: Record<string, string> = {},
  ) {
    if (!this.describedMetrics.has(name)) {
      this.lines.push(`# HELP ${name} ${help}`);
      this.lines.push(`# TYPE ${name} gauge`);
      this.describedMetrics.add(name);
    }
    this.lines.push(`${name}${formatLabels(labels)} ${formatMetricValue(value)}`);
  }

  toString() {
    return this.lines.join("\n");
  }
}

function formatLabels(labels: Record<string, string>) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";

  return `{${entries
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(",")}}`;
}

function escapeLabelValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, "\\\"");
}

function formatMetricValue(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
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
