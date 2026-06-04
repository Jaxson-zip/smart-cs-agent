import { z } from "zod";

export const AgentEventTypeSchema = z.enum([
  "conversation.message.received",
  "agent.thought.created",
  "agent.intent.detected",
  "policy.search.completed",
  "risk.evaluation.completed",
  "tool.call.started",
  "tool.call.completed",
  "approval.created",
  "approval.updated",
  "case.status.updated",
  "notification.sent",
  "notification.failed",
  "agent.response.completed",
  "human.takeover.started",
  "human.takeover.ended",
]);

const AgentEventBaseSchema = z.object({
  id: z.string(),
  conversationId: z.string().optional(),
  caseId: z.string().optional(),
  createdAt: z.string(),
});

export const AgentEventSchema = z.discriminatedUnion("type", [
  AgentEventBaseSchema.extend({
    type: z.literal("conversation.message.received"),
    payload: z.object({
      messageId: z.string(),
      channel: z.string(),
      content: z.string(),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("agent.thought.created"),
    payload: z.object({
      thought: z.string(),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("agent.intent.detected"),
    payload: z.object({
      intent: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("policy.search.completed"),
    payload: z.object({
      query: z.string(),
      matchedPolicyIds: z.array(z.string()),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("risk.evaluation.completed"),
    payload: z.object({
      decision: z.enum(["allow", "block", "approval_required"]),
      reasons: z.array(z.string()),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("tool.call.started"),
    payload: z.object({
      toolCallId: z.string(),
      toolName: z.string(),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("tool.call.completed"),
    payload: z.object({
      toolCallId: z.string(),
      toolName: z.string(),
      status: z.enum(["success", "failed", "blocked"]),
      summary: z.string().optional(),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("approval.created"),
    payload: z.object({
      approvalId: z.string(),
      reason: z.string(),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("approval.updated"),
    payload: z.object({
      approvalId: z.string(),
      status: z.enum([
        "pending",
        "approved",
        "rejected",
        "executed",
        "customer_notified",
      ]),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("case.status.updated"),
    payload: z.object({
      status: z.enum([
        "open",
        "triaging",
        "action_required",
        "pending_approval",
        "resolved",
        "rejected",
        "closed",
      ]),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("notification.sent"),
    payload: z.object({
      notificationId: z.string(),
      channel: z.string(),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("notification.failed"),
    payload: z.object({
      notificationId: z.string(),
      channel: z.string(),
      error: z.string(),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("agent.response.completed"),
    payload: z.object({
      messageId: z.string(),
      content: z.string(),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("human.takeover.started"),
    payload: z.object({
      mode: z.enum(["manual", "risk_required", "low_confidence"]),
      operatorId: z.string().optional(),
    }),
  }),
  AgentEventBaseSchema.extend({
    type: z.literal("human.takeover.ended"),
    payload: z.object({
      outcome: z.enum(["resolved", "returned_to_agent", "escalated"]),
      operatorId: z.string().optional(),
      resolution: z.string().optional(),
    }),
  }),
]);

export type AgentEventType = z.infer<typeof AgentEventTypeSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
