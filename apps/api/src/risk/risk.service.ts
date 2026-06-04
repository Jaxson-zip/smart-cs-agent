import { Injectable } from "@nestjs/common";
import { AfterSalesCategory, RiskLevel, AutomationMode } from "@smart-cs-agent/shared";

@Injectable()
export class RiskService {
  evaluate(category: AfterSalesCategory, text: string, amount?: number): { riskLevel: RiskLevel; automationMode: AutomationMode } {
    if (category === "address_change") return { riskLevel: "low", automationMode: "auto_execute" };
    if (category === "logistics") return { riskLevel: "low", automationMode: "auto_execute" };
    
    if (category === "damage_compensation") {
      if (amount && amount > 50) return { riskLevel: "medium", automationMode: "human_confirm" };
      return { riskLevel: "low", automationMode: "auto_execute" };
    }

    if (category === "compensation_rejected") return { riskLevel: "medium", automationMode: "human_confirm" };
    
    if (category === "refund_return" || category === "complaint_escalation" || category === "unknown") {
      return { riskLevel: "high", automationMode: "human_takeover" };
    }

    return { riskLevel: "high", automationMode: "human_takeover" };
  }
}
