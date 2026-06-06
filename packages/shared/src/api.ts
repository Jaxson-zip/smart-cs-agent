import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("smart-cs-agent-api"),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const HealthReadinessResponseSchema = z.object({
  status: z.enum(["ok", "unhealthy"]),
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
  }),
});

export type HealthReadinessResponse = z.infer<typeof HealthReadinessResponseSchema>;
