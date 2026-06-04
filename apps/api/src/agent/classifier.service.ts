import { Injectable } from "@nestjs/common";
import { AfterSalesCategory } from "@smart-cs-agent/shared";

@Injectable()
export class ClassifierService {
  classify(text: string): AfterSalesCategory {
    if (text.includes("改") && text.includes("地址")) return "address_change";
    if (text.includes("物流") || text.includes("快递") || text.includes("发货")) return "logistics";

    if (text.includes("投诉") || text.includes("差评") || text.includes("消协")) {
      return "complaint_escalation";
    }

    if (text.includes("拒绝") || text.includes("不要券") || text.includes("不接受")) {
      return "compensation_rejected";
    }

    if (text.includes("压坏") || text.includes("破损") || text.includes("补偿")) {
      return "damage_compensation";
    }

    if (text.includes("退款") || text.includes("退货")) return "refund_return";

    return "unknown";
  }
}
