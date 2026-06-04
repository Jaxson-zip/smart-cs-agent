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
    const { riskLevel, automationMode } = this.riskService.evaluate(
      category,
      text,
      context?.amount,
    );

    let replyText = "";
    const suggestedActions: AfterSalesAction[] = [];

    if (category === "address_change") {
      replyText = "您的地址修改请求已收到。订单未发货时，系统会为您同步到仓库。";
      suggestedActions.push({
        type: "change_address",
        newAddress: "待客户补充的新地址",
        status: "pending",
      });
    } else if (category === "logistics") {
      replyText = "我已为您查询物流状态。包裹仍在运输中，如有异常会继续为您跟进。";
      suggestedActions.push({ type: "query_logistics", status: "pending" });
    } else if (category === "damage_compensation") {
      replyText = "非常抱歉影响您的体验。我们可以为您补偿一张优惠券，稍后会发放到您的账户。";
      suggestedActions.push({
        type: "issue_coupon",
        amount: context?.amount ?? 20,
        status: "pending",
      });
    } else if (category === "compensation_rejected") {
      replyText = "我理解您对补偿方案不满意。我们会为您升级处理，并由客服确认新的处理方案。";
      suggestedActions.push({
        type: "create_handoff",
        reason: "客户拒绝首次补偿方案",
        status: "pending",
      });
    } else if (category === "complaint_escalation" || category === "refund_return") {
      replyText = "您的问题我们非常重视，已为您转交专人处理，请稍等。";
      suggestedActions.push({
        type: "create_handoff",
        reason: "高风险售后需要人工接管",
        status: "pending",
      });
    } else {
      replyText = "好的，请稍等，我们正在为您安排客服继续处理。";
      suggestedActions.push({
        type: "create_handoff",
        reason: "系统无法识别售后类型",
        status: "pending",
      });
    }

    return {
      category,
      riskLevel,
      automationMode,
      replyText,
      suggestedActions,
    };
  }
}
