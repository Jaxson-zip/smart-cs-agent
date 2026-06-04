import { Injectable } from "@nestjs/common";
import type {
  AgentCaseDecision,
  CompensationDeclinedRequest,
  CompensationDeclinedResponse,
  ExecuteActionRequest,
  ExecuteActionResponse,
  HandoffRequest,
  IntegrationStatus,
} from "@smart-cs-agent/shared";

@Injectable()
export class OpsService {
  listIntegrations(): IntegrationStatus[] {
    return [
      {
        channel: "taobao",
        connected: true,
        capabilities: [
          "modify_address",
          "issue_coupon",
          "escalate_coupon",
          "urge_logistics",
          "refund",
          "handoff",
        ],
        health: "normal",
        lastEventAt: new Date().toISOString(),
      },
      {
        channel: "douyin",
        connected: true,
        capabilities: ["modify_address", "urge_logistics", "refund", "handoff"],
        health: "normal",
        lastEventAt: new Date().toISOString(),
      },
      {
        channel: "shopify",
        connected: false,
        capabilities: ["refund", "handoff"],
        health: "degraded",
      },
      {
        channel: "wechat",
        connected: true,
        capabilities: ["urge_logistics", "issue_coupon", "handoff"],
        health: "normal",
        lastEventAt: new Date().toISOString(),
      },
      {
        channel: "email",
        connected: false,
        capabilities: ["update_invoice", "handoff"],
        health: "auth_required",
      },
    ];
  }

  ingestMessage(): AgentCaseDecision {
    return {
      caseId: "case_mock_ingested",
      status: "processing",
      intent: "compensation",
      confidence: 0.92,
      suggestedAction: "issue_coupon",
      replyDraft: "我们可以先为客户发放一次补偿券，并继续观察客户反馈。",
      requiresHuman: false,
      reasons: ["订单未补偿过", "金额低于自动上限", "客户情绪稳定"],
      nextAllowedActions: ["issue_coupon", "escalate_coupon", "handoff"],
    };
  }

  executeAction(request: ExecuteActionRequest): ExecuteActionResponse {
    const blocked = request.action === "refund" && !request.operatorId;

    return {
      actionRunId: `run_${Date.now()}`,
      status: blocked ? "blocked" : "queued",
      customerVisibleResult: blocked
        ? "该操作需要主管或坐席确认。"
        : "系统已接收操作，后续会回传到客户原会话。",
      requiresHuman: blocked,
      retryable: !blocked,
    };
  }

  handleCompensationDeclined(
    request: CompensationDeclinedRequest,
  ): CompensationDeclinedResponse {
    const maxAutoRoundsReached = request.round >= 2;

    if (maxAutoRoundsReached || request.customerReason === "angry") {
      return {
        caseId: request.caseId,
        status: "needs_human",
        nextAction: "handoff",
        replyDraft: "我理解您的感受，这个情况我会交给专人继续处理。",
        requiresApproval: true,
        maxAutoRoundsReached,
      };
    }

    const nextOfferAmount =
      request.customerReason === "wants_cash"
        ? request.currentOfferAmount
        : request.currentOfferAmount + 20;

    return {
      caseId: request.caseId,
      status: "negotiating",
      nextOfferAmount,
      nextAction:
        request.customerReason === "wants_cash"
          ? "handoff"
          : "escalate_coupon",
      replyDraft:
        request.customerReason === "wants_cash"
          ? "我先为您申请现金补偿，需要专人确认后继续处理。"
          : `我为您升级到 ${nextOfferAmount} 元补偿券，确认后会发放到原账户。`,
      requiresApproval: request.customerReason === "wants_cash",
      maxAutoRoundsReached: false,
    };
  }

  createHandoff(request: HandoffRequest) {
    return {
      handoffId: `handoff_${Date.now()}`,
      caseId: request.caseId,
      status: "created",
      priority: request.priority,
      summary: request.summary,
    };
  }
}
