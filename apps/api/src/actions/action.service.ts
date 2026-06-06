import { Injectable, Logger } from "@nestjs/common";
import { AfterSalesAction } from "@smart-cs-agent/shared";
import { AuditService } from "../audit/audit.service";
import { MockTaobaoAdapter } from "../adapters/mock-taobao.adapter";
import { MockDouyinAdapter } from "../adapters/mock-douyin.adapter";

@Injectable()
export class ActionService {
  private readonly logger = new Logger(ActionService.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly taobaoAdapter: MockTaobaoAdapter,
    private readonly douyinAdapter: MockDouyinAdapter,
  ) {}

  async executeMockAction(action: AfterSalesAction, caseId?: string): Promise<AfterSalesAction> {
    this.logger.log(`Executing mock action: ${action.type}`);
    
    let resultAction: AfterSalesAction;
    
    const adapter = action.channel === "douyin" ? this.douyinAdapter : this.taobaoAdapter;
    const orderId = action.orderId || caseId || "mock_order_id";

    switch (action.type) {
      case "change_address":
        await adapter.changeAddress(orderId, action.newAddress || "N/A");
        resultAction = { ...action, status: "simulated" };
        break;
      case "query_logistics":
        await adapter.queryLogistics(orderId);
        resultAction = { ...action, status: "simulated" };
        break;
      case "issue_coupon":
        await adapter.issueCoupon(orderId, action.amount || 0);
        resultAction = { ...action, status: "simulated" };
        break;
      case "create_handoff":
        resultAction = { ...action, status: "pending" };
        break;
      case "create_supervisor_review":
        resultAction = { ...action, status: "pending" };
        break;
      case "send_channel_reply":
        await adapter.sendMessage(orderId, action.replyText || "");
        resultAction = { ...action, status: "simulated" };
        break;
    }

    if (caseId) {
      await this.auditService.log(caseId, "action_executed", { action: resultAction });
    }

    return resultAction;
  }
}
