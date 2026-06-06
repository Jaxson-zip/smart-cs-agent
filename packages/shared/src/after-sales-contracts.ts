import { z } from "zod";

export const afterSalesCategoryValues = [
  "address_change",
  "logistics",
  "damage_compensation",
  "refund_return",
  "compensation_rejected",
  "complaint_escalation",
  "unknown",
] as const;

export type AfterSalesCategory = (typeof afterSalesCategoryValues)[number];

export const riskLevelValues = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof riskLevelValues)[number];

export const automationModeValues = [
  "auto_execute",
  "human_confirm",
  "human_takeover",
] as const;
export type AutomationMode = (typeof automationModeValues)[number];

const afterSalesActionStatusSchema = z.enum([
  "success",
  "failed",
  "pending",
  "simulated",
]);

export const afterSalesActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("change_address"),
    status: afterSalesActionStatusSchema.optional(),
    newAddress: z.string().optional(),
    orderId: z.string().optional(),
    channel: z.string().optional(),
  }),
  z.object({
    type: z.literal("query_logistics"),
    status: afterSalesActionStatusSchema.optional(),
    logisticsInfo: z.string().optional(),
    orderId: z.string().optional(),
    channel: z.string().optional(),
  }),
  z.object({
    type: z.literal("issue_coupon"),
    status: afterSalesActionStatusSchema.optional(),
    amount: z.number().optional(),
    orderId: z.string().optional(),
    channel: z.string().optional(),
  }),
  z.object({
    type: z.literal("create_handoff"),
    status: afterSalesActionStatusSchema.optional(),
    reason: z.string().optional(),
    orderId: z.string().optional(),
    channel: z.string().optional(),
  }),
  z.object({
    type: z.literal("create_supervisor_review"),
    status: afterSalesActionStatusSchema.optional(),
    reason: z.string().optional(),
    orderId: z.string().optional(),
    channel: z.string().optional(),
  }),
  z.object({
    type: z.literal("send_channel_reply"),
    status: afterSalesActionStatusSchema.optional(),
    replyText: z.string().optional(),
    orderId: z.string().optional(),
    channel: z.string().optional(),
  }),
]);

export type AfterSalesAction = z.infer<typeof afterSalesActionSchema>;

export const afterSalesCaseSchema = z.object({
  caseId: z.string(),
  merchantId: z.string(),
  channel: z.string(),
  customerName: z.string(),
  orderId: z.string().optional(),
  category: z.enum(afterSalesCategoryValues),
  riskLevel: z.enum(riskLevelValues),
  automationMode: z.enum(automationModeValues),
  customerMessage: z.string(),
  customerReply: z.string().optional(),
  actions: z.array(afterSalesActionSchema).optional(),
  createdAt: z.union([z.string().datetime(), z.date()]).optional(),
  updatedAt: z.union([z.string().datetime(), z.date()]).optional(),
});

export type AfterSalesCase = z.infer<typeof afterSalesCaseSchema>;
