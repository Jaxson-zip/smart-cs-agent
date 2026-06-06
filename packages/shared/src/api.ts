import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("smart-cs-agent-api"),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const HealthReadinessResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "unhealthy"]),
  service: z.literal("smart-cs-agent-api"),
  timestamp: z.string(),
  checks: z.object({
    database: z.object({
      status: z.enum(["ok", "unhealthy"]),
      message: z.string().optional(),
    }),
    channelWebhooks: z
      .object({
        status: z.enum(["ok", "disabled", "misconfigured"]),
        enabled: z.boolean(),
        configuredChannels: z.array(z.string()),
        message: z.string().optional(),
      })
      .optional(),
    channelQueue: z
      .object({
        status: z.enum(["ok", "degraded"]),
        pendingCount: z.number(),
        processingCount: z.number(),
        staleProcessingCount: z.number(),
        oldestPendingAgeSeconds: z.number().nullable(),
        thresholds: z.object({
          pendingWarnThreshold: z.number().optional(),
          oldestPendingWarnSeconds: z.number().optional(),
          staleProcessingWarnThreshold: z.number().optional(),
          staleAfterMinutes: z.number(),
        }),
        reasons: z.array(z.string()),
      })
      .optional(),
  }),
});

export type HealthReadinessResponse = z.infer<typeof HealthReadinessResponseSchema>;
