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

  async executeMockAction(action: Omit<AfterSalesAction, "status">, caseId?: string): Promise<AfterSalesAction> {
    this.logger.log(`Executing mock action: ${action.type}`);
    
    let resultAction: AfterSalesAction;
    
    const adapter = action.channel === "douyin" ? this.douyinAdapter : this.taobaoAdapter;
    const orderId = action.orderId || caseId || "mock_order_id";

    switch (action.type) {
      case "change_address":
        await adapter.changeAddress(orderId, (action as any).newAddress || "N/A");
        resultAction = { ...action, status: "success" } as AfterSalesAction;
        break;
      case "query_logistics":
        await adapter.queryLogistics(orderId);
        resultAction = { ...action, status: "success" } as AfterSalesAction;
        break;
      case "issue_coupon":
        await adapter.issueCoupon(orderId, (action as any).amount || 0);
        resultAction = { ...action, status: "success" } as AfterSalesAction;
        break;
      case "create_handoff":
        resultAction = { ...action, status: "pending" } as AfterSalesAction;
        break;
      case "create_supervisor_review":
        resultAction = { ...action, status: "pending" } as AfterSalesAction;
        break;
      case "send_channel_reply":
        await adapter.sendMessage(orderId, (action as any).replyText || "");
        resultAction = { ...action, status: "success" } as AfterSalesAction;
        break;
      default:
        resultAction = { ...action, status: "pending" } as AfterSalesAction;
        break;
    }

    if (caseId) {
      await this.auditService.log(caseId, "action_executed", { action: resultAction });
    }

    return resultAction;
  }
}
