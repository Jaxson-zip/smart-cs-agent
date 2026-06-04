import { z } from "zod";

export const ToolRiskLevelSchema = z.enum(["low", "medium", "high"]);

export const ToolCallStatusSchema = z.enum([
  "pending",
  "running",
  "success",
  "failed",
  "blocked",
]);

export const CheckOrderToolInputSchema = z.object({
  orderId: z.string().min(1),
});

export const ModifyAddressToolInputSchema = z.object({
  orderId: z.string().min(1),
  newAddress: z.string().min(1),
});

export const IssueCouponToolInputSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().min(1),
});

export type ToolRiskLevel = z.infer<typeof ToolRiskLevelSchema>;
export type ToolCallStatus = z.infer<typeof ToolCallStatusSchema>;
export type CheckOrderToolInput = z.infer<typeof CheckOrderToolInputSchema>;
export type ModifyAddressToolInput = z.infer<typeof ModifyAddressToolInputSchema>;
export type IssueCouponToolInput = z.infer<typeof IssueCouponToolInputSchema>;
