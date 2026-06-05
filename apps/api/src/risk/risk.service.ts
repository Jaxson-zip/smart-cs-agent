import { Injectable } from "@nestjs/common";
import { AfterSalesCategory, RiskLevel, AutomationMode } from "@smart-cs-agent/shared";
import { RulesService } from "../rules/rules.service";

@Injectable()
export class RiskService {
  constructor(private readonly rulesService: RulesService) {}

  async evaluate(
    category: AfterSalesCategory,
    _text: string,
    amount?: number,
    tenantId = "demo_tenant",
  ): Promise<{ riskLevel: RiskLevel; automationMode: AutomationMode }> {
    const rules = await this.rulesService.getRules(tenantId);

    if (category === "address_change") return { riskLevel: "low", automationMode: "auto_execute" };
    if (category === "logistics") return { riskLevel: "low", automationMode: "auto_execute" };
    
    if (category === "damage_compensation") {
      if (amount && amount > rules.couponCompensationLimit) return { riskLevel: "medium", automationMode: "human_confirm" };
      return { riskLevel: "low", automationMode: "auto_execute" };
    }

    if (category === "compensation_rejected") return { riskLevel: "medium", automationMode: "human_confirm" };
    
    if (category === "refund_return" || category === "complaint_escalation" || category === "unknown") {
      return { riskLevel: "high", automationMode: "human_takeover" };
    }

    return { riskLevel: "high", automationMode: "human_takeover" };
  }
}
