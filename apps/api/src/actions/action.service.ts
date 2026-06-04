import { Injectable, Logger } from "@nestjs/common";
import { AfterSalesAction } from "@smart-cs-agent/shared";

@Injectable()
export class ActionService {
  private readonly logger = new Logger(ActionService.name);

  executeMockAction(action: Omit<AfterSalesAction, "status">): AfterSalesAction {
    this.logger.log(`Executing mock action: ${action.type}`);
    
    switch (action.type) {
      case "change_address":
        return { ...action, status: "success" } as AfterSalesAction;
      case "query_logistics":
        return { ...action, status: "success" } as AfterSalesAction;
      case "issue_coupon":
        return { ...action, status: "success" } as AfterSalesAction;
      case "create_handoff":
        return { ...action, status: "pending" } as AfterSalesAction;
      case "create_supervisor_review":
        return { ...action, status: "pending" } as AfterSalesAction;
      case "send_channel_reply":
        return { ...action, status: "success" } as AfterSalesAction;
      default:
        return { ...action, status: "failed" } as any;
    }
  }
}
