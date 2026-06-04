import { AfterSalesCategory, RiskLevel, AutomationMode, AfterSalesAction } from "@smart-cs-agent/shared";

export interface DecisionResult {
  category: AfterSalesCategory;
  riskLevel: RiskLevel;
  automationMode: AutomationMode;
  replyText?: string;
  suggestedActions?: AfterSalesAction[];
}
