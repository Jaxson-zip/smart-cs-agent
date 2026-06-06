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
import { ProviderAdapterRegistry } from "../adapters/provider-adapter-registry.service";

@Injectable()
export class OpsService {
  constructor(private readonly providerAdapters: ProviderAdapterRegistry) {}

  listIntegrations(): IntegrationStatus[] {
    return this.providerAdapters.listIntegrations();
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
    const policy = this.providerAdapters.evaluateActionPolicy(request);

    if (!policy.allowed) {
      return {
        actionRunId: `run_${Date.now()}`,
        status: "blocked",
        customerVisibleResult: policy.reason,
        requiresHuman: true,
        retryable: policy.retryable,
      };
    }

    return {
      actionRunId: `run_${Date.now()}`,
      status: "queued",
      customerVisibleResult: "Action queued for internal operator handling.",
      requiresHuman: false,
      retryable: true,
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
