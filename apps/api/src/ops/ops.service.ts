import { createHash } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ProviderReadResponseSchema,
  type AgentCaseDecision,
  type CompensationDeclinedRequest,
  type CompensationDeclinedResponse,
  type ExecuteActionRequest,
  type ExecuteActionResponse,
  type HandoffRequest,
  type IntegrationStatus,
  type ProviderReadRequest,
  type ProviderReadResponse,
} from "@smart-cs-agent/shared";
import { ProviderAdapterRegistry } from "../adapters/provider-adapter-registry.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OpsService {
  constructor(
    private readonly providerAdapters: ProviderAdapterRegistry,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  listIntegrations(tenantId: string): IntegrationStatus[] {
    return this.providerAdapters.listIntegrations(tenantId);
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

  async executeProviderRead(
    request: ProviderReadRequest,
  ): Promise<ProviderReadResponse> {
    const metadata = providerReadMetadata(request);
    const caseBelongsToTenant = await this.providerReadCaseBelongsToTenant(
      request,
    );
    if (!caseBelongsToTenant) {
      const response = ProviderReadResponseSchema.parse({
        readRunId: `read_${Date.now()}`,
        status: "blocked",
        networkExecution: "not_started",
        providerDataReturned: false,
        operatorVisibleResult:
          "Provider read blocked because the case does not belong to the authenticated tenant.",
        requiresHuman: true,
        retryable: false,
      });
      await this.auditProviderRead(
        null,
        request,
        response,
        metadata,
        "case_tenant_mismatch",
      );
      return response;
    }

    const existingRun = await this.findProviderReadRun(
      request.tenantId,
      request.idempotencyKey,
    );
    if (existingRun) {
      if (existingRun.requestHash === metadata.requestHash) {
        return providerReadResponseFromRun(existingRun);
      }
      const response = ProviderReadResponseSchema.parse({
        readRunId: existingRun.id,
        status: "failed",
        networkExecution: "not_started",
        providerDataReturned: false,
        operatorVisibleResult:
          "Provider read idempotency key was already used for a different request.",
        requiresHuman: true,
        retryable: false,
      });
      await this.auditProviderRead(
        request.caseId,
        request,
        response,
        metadata,
        "idempotency_key_reused",
        existingRun.id,
      );
      return response;
    }

    const policy = this.providerAdapters.evaluateReadPolicy(request);

    if (!policy.allowed) {
      const response = ProviderReadResponseSchema.parse({
        readRunId: `read_${Date.now()}`,
        status: "blocked",
        networkExecution: "not_started",
        providerDataReturned: false,
        operatorVisibleResult: policy.reason,
        requiresHuman: true,
        retryable: policy.retryable,
      });
      return this.persistProviderReadRun(request, response, metadata, policy.reason);
    }

    const response = ProviderReadResponseSchema.parse({
      readRunId: `read_${Date.now()}`,
      status: "policy_accepted",
      networkExecution: "not_implemented",
      providerDataReturned: false,
      operatorVisibleResult:
        "Readonly provider read accepted by policy; provider network execution is not implemented in this build.",
      requiresHuman: false,
      retryable: false,
    });
    return this.persistProviderReadRun(request, response, metadata, null);
  }

  private async findProviderReadRun(
    tenantId: string | undefined,
    idempotencyKey: string,
  ): Promise<ProviderReadRunRecord | null> {
    if (!this.prisma || !tenantId) return null;
    return this.prisma.providerReadRun.findUnique({
      where: {
        tenantId_idempotencyKey: { tenantId, idempotencyKey },
      },
    }) as Promise<ProviderReadRunRecord | null>;
  }

  private async persistProviderReadRun(
    request: ProviderReadRequest,
    response: ProviderReadResponse,
    metadata: ProviderReadMetadata,
    policyReason: string | null,
  ): Promise<ProviderReadResponse> {
    if (!this.prisma || !request.tenantId) return response;
    let created: ProviderReadRunRecord;
    try {
      created = (await this.prisma.providerReadRun.create({
        data: {
          tenantId: request.tenantId,
          operatorId: request.operatorId ?? null,
          caseId: request.caseId,
          channel: request.channel,
          readCapability: request.readCapability,
          idempotencyKey: request.idempotencyKey,
          lookupHash: metadata.lookupHash,
          lookupKeys: metadata.lookupKeys as Prisma.InputJsonValue,
          requestHash: metadata.requestHash,
          status: response.status,
          networkExecution: response.networkExecution,
          providerDataReturned: response.providerDataReturned,
          operatorVisibleResult: response.operatorVisibleResult,
          policyReason,
        },
      })) as ProviderReadRunRecord;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await this.findProviderReadRun(
        request.tenantId,
        request.idempotencyKey,
      );
      if (existing?.requestHash === metadata.requestHash) {
        return providerReadResponseFromRun(existing);
      }
      const conflictResponse = ProviderReadResponseSchema.parse({
        readRunId: existing?.id ?? response.readRunId,
        status: "failed",
        networkExecution: "not_started",
        providerDataReturned: false,
        operatorVisibleResult:
          "Provider read idempotency key was already used for a different request.",
        requiresHuman: true,
        retryable: false,
      });
      await this.auditProviderRead(
        request.caseId,
        request,
        conflictResponse,
        metadata,
        "idempotency_key_reused",
        existing?.id,
      );
      return conflictResponse;
    }
    await this.auditProviderRead(
      request.caseId,
      request,
      response,
      metadata,
      policyReason,
      created.id,
    );
    return ProviderReadResponseSchema.parse({
      ...response,
      readRunId: created.id,
    });
  }

  private async providerReadCaseBelongsToTenant(
    request: ProviderReadRequest,
  ): Promise<boolean> {
    if (!this.prisma) return true;
    if (!request.tenantId) return false;
    const caseItem = await this.prisma.afterSalesCase.findFirst({
      where: {
        id: request.caseId,
        merchantId: request.tenantId,
      },
      select: { id: true },
    });
    return Boolean(caseItem);
  }

  private async auditProviderRead(
    caseId: string | null,
    request: ProviderReadRequest,
    response: ProviderReadResponse,
    metadata: ProviderReadMetadata,
    policyReason: string | null,
    providerReadRunId?: string,
  ) {
    await this.auditService?.log(caseId, `provider_read.${response.status}`, {
      ...(providerReadRunId ? { providerReadRunId } : {}),
      tenantId: request.tenantId ?? null,
      operatorId: request.operatorId ?? null,
      channel: request.channel,
      readCapability: request.readCapability,
      lookupHash: metadata.lookupHash,
      lookupKeys: metadata.lookupKeys,
      status: response.status,
      networkExecution: response.networkExecution,
      providerDataReturned: false,
      policyReason,
    });
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

type ProviderReadMetadata = {
  lookupHash: string;
  lookupKeys: { hasOrderId: boolean; hasLogisticsId: boolean };
  requestHash: string;
};

type ProviderReadRunRecord = {
  id: string;
  status: string;
  networkExecution: string;
  providerDataReturned: boolean;
  operatorVisibleResult: string;
  requestHash: string;
};

function providerReadMetadata(request: ProviderReadRequest): ProviderReadMetadata {
  const lookupHash = sha256(stableJson(request.lookup));
  return {
    lookupHash,
    lookupKeys: {
      hasOrderId: Boolean(request.lookup.orderId),
      hasLogisticsId: Boolean(request.lookup.logisticsId),
    },
    requestHash: sha256(
      stableJson({
        caseId: request.caseId,
        tenantId: request.tenantId,
        channel: request.channel,
        readCapability: request.readCapability,
        lookupHash,
      }),
    ),
  };
}

function providerReadResponseFromRun(
  run: ProviderReadRunRecord,
): ProviderReadResponse {
  return ProviderReadResponseSchema.parse({
    readRunId: run.id,
    status: run.status,
    networkExecution: run.networkExecution,
    providerDataReturned: false,
    operatorVisibleResult: run.operatorVisibleResult,
    requiresHuman: run.status !== "policy_accepted",
    retryable: false,
  });
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "code" in error && (error as { code?: unknown }).code === "P2002";
}
