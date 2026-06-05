import { Injectable } from "@nestjs/common";
import { AfterSalesCategory } from "@smart-cs-agent/shared";
import { RulesService } from "../rules/rules.service";

@Injectable()
export class ClassifierService {
  constructor(private readonly rulesService: RulesService) {}

  async classify(text: string, tenantId = "demo_tenant"): Promise<AfterSalesCategory> {
    const rules = await this.rulesService.getRules(tenantId);

    if (text.includes("改") && text.includes("地址")) return "address_change";
    if (text.includes("物流") || text.includes("快递") || text.includes("发货")) return "logistics";

    const hasComplaintKeyword = rules.highRiskKeywords.some(keyword => text.includes(keyword) && ["投诉", "差评", "消协"].includes(keyword));
    if (hasComplaintKeyword || text.includes("投诉") || text.includes("差评") || text.includes("消协")) {
      return "complaint_escalation";
    }

    const hasRejectKeyword = rules.highRiskKeywords.some(keyword => text.includes(keyword) && ["拒绝", "不要券", "不接受"].includes(keyword));
    if (hasRejectKeyword || text.includes("拒绝") || text.includes("不要券") || text.includes("不接受")) {
      return "compensation_rejected";
    }

    if (text.includes("压坏") || text.includes("破损") || text.includes("补偿")) {
      return "damage_compensation";
    }

    if (text.includes("退款") || text.includes("退货")) return "refund_return";

    return "unknown";
  }
}
