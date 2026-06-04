import { Injectable } from "@nestjs/common";
import { ClassifierService } from "./classifier.service";
import { RiskService } from "../risk/risk.service";
import { DecisionResult } from "./agent.interface";
import { AfterSalesAction } from "@smart-cs-agent/shared";

@Injectable()
export class AgentService {
  constructor(
    private readonly classifier: ClassifierService,
    private readonly riskService: RiskService,
  ) {}

  async decide(text: string, context?: { amount?: number }): Promise<DecisionResult> {
    const category = this.classifier.classify(text);
    const { riskLevel, automationMode } = this.riskService.evaluate(category, text, context?.amount);
    
    let replyText = "";
    const suggestedActions: AfterSalesAction[] = [];

    if (category === "address_change") {
      replyText = "您的地址修改请求已收到，我们已为您更新物流信息。";
      suggestedActions.push({ type: "change_address", newAddress: "识别到的新地址", status: "pending" });
    } else if (category === "logistics") {
      replyText = "您的包裹正在运输中，请耐心等待。";
      suggestedActions.push({ type: "query_logistics", status: "pending" });
    } else if (category === "damage_compensation") {
      replyText = "很抱歉给您带来不好的体验，我们为您申请了补偿方案，请确认。";
      suggestedActions.push({ type: "issue_coupon", amount: context?.amount || 20, status: "pending" });
    } else if (category === "complaint_escalation" || category === "refund_return") {
      replyText = "您的问题我们非常重视，正在为您转接高级专员。";
      suggestedActions.push({ type: "create_handoff", reason: "高风险问题接管", status: "pending" });
    } else {
      replyText = "好的，请稍等，正在为您分配人工客服。";
      suggestedActions.push({ type: "create_handoff", reason: "未知问题接管", status: "pending" });
    }

    return {
      category,
      riskLevel,
      automationMode,
      replyText,
      suggestedActions
    };
  }
}
