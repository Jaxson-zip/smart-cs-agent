import { z } from "zod";

export const CommerceChannelSchema = z.enum([
  "taobao",
  "douyin",
  "shopify",
  "wechat",
  "email",
]);

export const CaseStatusSchema = z.enum([
  "queued",
  "processing",
  "negotiating",
  "needs_human",
  "manual",
  "resolved",
  "archived",
]);

export const CommerceActionSchema = z.enum([
  "modify_address",
  "issue_coupon",
  "escalate_coupon",
  "urge_logistics",
  "refund",
  "update_invoice",
  "handoff",
]);

export const ProviderAdapterModeSchema = z.enum([
  "sandbox_mock",
  "real_readonly",
  "real_actions_disabled",
  "not_configured",
]);

export const ProviderWritePolicySchema = z.enum([
  "sandbox_only",
  "read_only",
  "human_review_required",
  "disabled",
]);

export const ChannelMessageIngestSchema = z.object({
  externalMessageId: z.string().min(1),
  channel: CommerceChannelSchema,
  shopId: z.string().min(1),
  customerExternalId: z.string().min(1),
  orderId: z.string().optional(),
  content: z.string().min(1),
  receivedAt: z.string(),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
});

export const AgentCaseDecisionSchema = z.object({
  caseId: z.string(),
  status: CaseStatusSchema,
  intent: z.enum([
    "compensation",
    "address_change",
    "logistics",
    "refund",
    "invoice",
    "complaint",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  suggestedAction: CommerceActionSchema,
  replyDraft: z.string(),
  requiresHuman: z.boolean(),
  reasons: z.array(z.string()),
  nextAllowedActions: z.array(CommerceActionSchema),
});

export const ExecuteActionRequestSchema = z.object({
  caseId: z.string().min(1),
  channel: CommerceChannelSchema,
  action: CommerceActionSchema,
  idempotencyKey: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  operatorId: z.string().optional(),
});

export const ExecuteActionResponseSchema = z.object({
  actionRunId: z.string(),
  status: z.enum(["accepted", "executed", "queued", "blocked", "failed"]),
  customerVisibleResult: z.string(),
  requiresHuman: z.boolean(),
  retryable: z.boolean(),
});

export const CompensationDeclinedRequestSchema = z.object({
  caseId: z.string().min(1),
  customerReason: z.enum([
    "amount_too_low",
    "wants_cash",
    "wants_return",
    "angry",
    "unclear",
  ]),
  currentOfferAmount: z.number().nonnegative(),
  round: z.number().int().min(1),
});

export const CompensationDeclinedResponseSchema = z.object({
  caseId: z.string(),
  status: CaseStatusSchema,
  nextOfferAmount: z.number().nonnegative().optional(),
  nextAction: CommerceActionSchema,
  replyDraft: z.string(),
  requiresApproval: z.boolean(),
  maxAutoRoundsReached: z.boolean(),
});

export const HandoffRequestSchema = z.object({
  caseId: z.string().min(1),
  reason: z.enum([
    "high_risk",
    "low_confidence",
    "customer_rejected",
    "channel_failed",
    "policy_blocked",
  ]),
  priority: z.enum(["normal", "urgent"]),
  summary: z.string().min(1),
});

export const IntegrationStatusSchema = z.object({
  channel: CommerceChannelSchema,
  connected: z.boolean(),
  capabilities: z.array(CommerceActionSchema),
  health: z.enum(["normal", "degraded", "auth_required"]),
  lastEventAt: z.string().optional(),
  adapterMode: ProviderAdapterModeSchema,
  writePolicy: ProviderWritePolicySchema,
  customerVisibleActionsEnabled: z.boolean(),
  realCommerceActionsEnabled: z.boolean(),
  contractVersion: z.string().min(1),
  safetyNotes: z.array(z.string().min(1)),
});

export type CommerceChannel = z.infer<typeof CommerceChannelSchema>;
export type CaseStatus = z.infer<typeof CaseStatusSchema>;
export type CommerceAction = z.infer<typeof CommerceActionSchema>;
export type ProviderAdapterMode = z.infer<typeof ProviderAdapterModeSchema>;
export type ProviderWritePolicy = z.infer<typeof ProviderWritePolicySchema>;
export type ChannelMessageIngest = z.infer<typeof ChannelMessageIngestSchema>;
export type AgentCaseDecision = z.infer<typeof AgentCaseDecisionSchema>;
export type ExecuteActionRequest = z.infer<typeof ExecuteActionRequestSchema>;
export type ExecuteActionResponse = z.infer<typeof ExecuteActionResponseSchema>;
export type CompensationDeclinedRequest = z.infer<
  typeof CompensationDeclinedRequestSchema
>;
export type CompensationDeclinedResponse = z.infer<
  typeof CompensationDeclinedResponseSchema
>;
export type HandoffRequest = z.infer<typeof HandoffRequestSchema>;
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;
