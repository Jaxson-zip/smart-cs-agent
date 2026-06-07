import { createHash } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ProviderReadResponseSchema,
  ProviderWriteExecutionAttemptResponseSchema,
  ProviderWriteResponseSchema,
  type AgentCaseDecision,
  type CompensationDeclinedRequest,
  type CompensationDeclinedResponse,
  type ExecuteActionRequest,
  type ExecuteActionResponse,
  type HandoffRequest,
  type IntegrationStatus,
  type ProviderReadRequest,
  type ProviderReadResponse,
  type ProviderWriteApprovalRequest,
  type ProviderWriteExecutionAttemptRequest,
  type ProviderWriteExecutionAttemptResponse,
  type ProviderWriteExecutionAttemptStatus,
  type ProviderWriteRequest,
  type ProviderWriteRejectionRequest,
  type ProviderWriteResponse,
  type ProviderWriteStatus,
} from "@smart-cs-agent/shared";
import { ProviderAdapterRegistry } from "../adapters/provider-adapter-registry.service";
import {
  ProviderCredentialResolverService,
  type ProviderCredentialResolution,
} from "../adapters/provider-credential-resolver.service";
import {
  ProviderReadonlyClientHarnessService,
  type ProviderReadonlyClientHarnessResult,
} from "../adapters/provider-readonly-client-harness.service";
import { AuditService } from "../audit/audit.service";
import { providerWriteExecutionKillSwitchEnabled } from "../config/api-config";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OpsService {
  constructor(
    private readonly providerAdapters: ProviderAdapterRegistry,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly auditService?: AuditService,
    @Optional()
    private readonly credentialResolver?: ProviderCredentialResolverService,
    @Optional()
    private readonly providerReadHarness?: ProviderReadonlyClientHarnessService,
  ) {}

  listIntegrations(tenantId: string): IntegrationStatus[] {
    return this.providerAdapters.listIntegrations(tenantId);
  }

  async listProviderReadRuns(input: ListProviderReadRunsInput) {
    if (!this.prisma) return [];
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const runs = (await this.prisma.providerReadRun.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })) as ProviderReadRunRecord[];

    return runs.map(toSanitizedProviderReadRun);
  }

  async getProviderReadSummary(input: ProviderReadSummaryInput) {
    if (!this.prisma) return emptyProviderReadSummary(input);

    const measuredAt = input.now ?? new Date();
    const to = input.to ?? measuredAt;
    const from = input.from ?? new Date(to.getTime() - PROVIDER_READ_SUMMARY_WINDOW_MS);
    const where = {
      tenantId: input.tenantId,
      createdAt: { gte: from, lte: to },
    };

    const [totalCount, policyAcceptedCount, blockedCount, failedCount, runs] =
      await Promise.all([
        this.prisma.providerReadRun.count({ where }),
        this.prisma.providerReadRun.count({
          where: { ...where, status: "policy_accepted" },
        }),
        this.prisma.providerReadRun.count({
          where: { ...where, status: "blocked" },
        }),
        this.prisma.providerReadRun.count({
          where: { ...where, status: "failed" },
        }),
        this.prisma.providerReadRun.findMany({
          where,
          select: {
            channel: true,
            readCapability: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    return {
      measuredAt: measuredAt.toISOString(),
      window: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totals: {
        totalCount,
        policyAcceptedCount,
        blockedCount,
        failedCount,
      },
      byChannel: summarizeProviderReadRuns(runs, "channel"),
      byCapability: summarizeProviderReadRuns(runs, "readCapability"),
      latestCreatedAt: runs[0]?.createdAt.toISOString() ?? null,
    };
  }

  async listProviderWriteRequests(input: ListProviderWriteRequestsInput) {
    if (!this.prisma) return [];
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const requests = (await this.prisma.providerWriteRequest.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })) as ProviderWriteRequestRecord[];

    return requests.map(toSanitizedProviderWriteRequest);
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

  async requestProviderWrite(
    request: ProviderWriteRequest,
  ): Promise<ProviderWriteResponse> {
    const metadata = providerWriteMetadata(request);
    const caseBelongsToTenant = await this.providerWriteCaseBelongsToTenant(
      request,
    );
    if (!caseBelongsToTenant) {
      const response = ProviderWriteResponseSchema.parse({
        writeRequestId: `write_${Date.now()}`,
        status: "blocked",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        operatorVisibleResult:
          "Provider write blocked because the case does not belong to the authenticated tenant.",
        requiresHuman: true,
        retryable: false,
      });
      await this.auditProviderWrite(
        null,
        request,
        response,
        metadata,
        "case_tenant_mismatch",
      );
      return response;
    }

    const existingRequest = await this.findProviderWriteRequest(
      request.tenantId,
      metadata.idempotencyKeyHash,
    );
    if (existingRequest) {
      if (existingRequest.requestHash === metadata.requestHash) {
        return providerWriteResponseFromRequest(existingRequest);
      }
      const response = ProviderWriteResponseSchema.parse({
        writeRequestId: existingRequest.id,
        status: "failed",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        operatorVisibleResult:
          "Provider write idempotency key was already used for a different request.",
        requiresHuman: true,
        retryable: false,
      });
      await this.auditProviderWrite(
        request.caseId,
        request,
        response,
        metadata,
        "idempotency_key_reused",
        existingRequest.id,
      );
      return response;
    }

    const policy = this.providerAdapters.evaluateWriteRequestPolicy(request);
    if (!policy.allowed) {
      const response = ProviderWriteResponseSchema.parse({
        writeRequestId: `write_${Date.now()}`,
        status: "blocked",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        operatorVisibleResult: policy.reason,
        requiresHuman: true,
        retryable: policy.retryable,
      });
      return this.persistProviderWriteRequest(
        request,
        response,
        metadata,
        policy.reason,
      );
    }

    const response = ProviderWriteResponseSchema.parse({
      writeRequestId: `write_${Date.now()}`,
      status: "approval_required",
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      operatorVisibleResult:
        "Provider write request recorded for human approval; provider network execution is disabled in this build.",
      requiresHuman: true,
      retryable: false,
    });
    return this.persistProviderWriteRequest(request, response, metadata, null);
  }

  async approveProviderWriteRequest(
    input: ProviderWriteApprovalInput,
  ): Promise<ProviderWriteResponse> {
    return this.reviewProviderWriteRequest(input, "approved");
  }

  async rejectProviderWriteRequest(
    input: ProviderWriteRejectionInput,
  ): Promise<ProviderWriteResponse> {
    return this.reviewProviderWriteRequest(input, "rejected");
  }

  async executeProviderWriteAttempt(
    input: ProviderWriteExecutionAttemptInput,
  ): Promise<ProviderWriteExecutionAttemptResponse> {
    if (!this.prisma) {
      return providerWriteExecutionAttemptResponse(
        `attempt_${Date.now()}`,
        input.requestId,
        "failed",
        "Provider write execution attempt failed because persistence is unavailable.",
        false,
      );
    }

    const request = await this.findProviderWriteRequestById(
      input.tenantId,
      input.requestId,
    );
    if (!request) {
      const response = providerWriteExecutionAttemptResponse(
        `attempt_${Date.now()}`,
        input.requestId,
        "failed",
        "Provider write request was not found for the authenticated tenant.",
        false,
      );
      await this.auditProviderWriteExecutionAttempt(
        null,
        input,
        response,
        null,
        null,
        "request_not_found",
      );
      return response;
    }

    const metadata = providerWriteExecutionAttemptMetadata(input, request);
    const existingAttempt = await this.findProviderWriteExecutionAttempt(
      input.tenantId,
      request.id,
      metadata.idempotencyKeyHash,
    );
    if (existingAttempt) {
      if (existingAttempt.requestHash === metadata.requestHash) {
        return providerWriteExecutionAttemptResponseFromRecord(existingAttempt);
      }
      const response = providerWriteExecutionAttemptResponse(
        existingAttempt.id,
        request.id,
        "failed",
        "Provider write execution idempotency key was already used for a different request.",
        false,
      );
      await this.auditProviderWriteExecutionAttempt(
        request.caseId ?? null,
        input,
        response,
        request,
        existingAttempt,
        "idempotency_key_reused",
      );
      return response;
    }

    const decision = providerWriteExecutionDecision(request);
    const response = providerWriteExecutionAttemptResponse(
      `attempt_${Date.now()}`,
      request.id,
      decision.status,
      decision.operatorVisibleResult,
      decision.retryable,
    );

    return this.persistProviderWriteExecutionAttempt(
      input,
      request,
      response,
      metadata,
      decision.policyReason,
    );
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

  private async findProviderWriteRequest(
    tenantId: string | undefined,
    idempotencyKeyHash: string,
  ): Promise<ProviderWriteRequestRecord | null> {
    if (!this.prisma || !tenantId) return null;
    return this.prisma.providerWriteRequest.findUnique({
      where: {
        tenantId_idempotencyKeyHash: { tenantId, idempotencyKeyHash },
      },
    }) as Promise<ProviderWriteRequestRecord | null>;
  }

  private async findProviderWriteRequestById(
    tenantId: string,
    requestId: string,
  ): Promise<ProviderWriteRequestRecord | null> {
    if (!this.prisma) return null;
    return this.prisma.providerWriteRequest.findFirst({
      where: {
        id: requestId,
        tenantId,
      },
    }) as Promise<ProviderWriteRequestRecord | null>;
  }

  private async findProviderWriteExecutionAttempt(
    tenantId: string,
    providerWriteRequestId: string,
    idempotencyKeyHash: string,
  ): Promise<ProviderWriteExecutionAttemptRecord | null> {
    if (!this.prisma) return null;
    return this.prisma.providerWriteExecutionAttempt.findUnique({
      where: {
        tenantId_providerWriteRequestId_idempotencyKeyHash: {
          tenantId,
          providerWriteRequestId,
          idempotencyKeyHash,
        },
      },
    }) as Promise<ProviderWriteExecutionAttemptRecord | null>;
  }

  private async reviewProviderWriteRequest(
    input: ProviderWriteReviewInput,
    decision: "approved" | "rejected",
  ): Promise<ProviderWriteResponse> {
    if (!this.prisma) {
      return providerWriteReviewResponse(
        input.requestId,
        "failed",
        "Provider write review failed because persistence is unavailable.",
      );
    }

    const request = await this.findProviderWriteRequestById(
      input.tenantId,
      input.requestId,
    );
    if (!request) {
      const response = providerWriteReviewResponse(
        input.requestId,
        "failed",
        "Provider write request was not found for the authenticated tenant.",
      );
      await this.auditProviderWriteReview(
        null,
        input,
        response,
        decision,
        null,
        "request_not_found",
      );
      return response;
    }

    if (request.operatorId === input.reviewerOperatorId) {
      const response = providerWriteReviewResponse(
        request.id,
        "blocked",
        "Provider write approval requires two-person review.",
      );
      await this.auditProviderWriteReview(
        request.caseId ?? null,
        input,
        response,
        decision,
        request,
        "self_approval_blocked",
      );
      return response;
    }

    if (request.status !== "approval_required") {
      const response = providerWriteReviewResponse(
        request.id,
        "failed",
        "Provider write request was already reviewed or is not reviewable.",
      );
      await this.auditProviderWriteReview(
        request.caseId ?? null,
        input,
        response,
        decision,
        request,
        "terminal_state",
      );
      return response;
    }

    const reviewedAt = input.reviewedAt ?? new Date();
    const reviewFingerprint = providerWriteReviewFingerprint(
      request,
      input,
      decision,
      reviewedAt,
    );
    const payloadEscrowFingerprint =
      request.payloadEscrowFingerprint ??
      providerWritePayloadEscrowFingerprint(request.requestHash);
    const operatorVisibleResult =
      decision === "approved"
        ? "Provider write approved for a future executor; provider network execution is disabled in this build."
        : "Provider write rejected by human reviewer; provider network execution was not started.";

    const updateResult = await this.prisma.providerWriteRequest.updateMany({
      where: {
        id: request.id,
        tenantId: input.tenantId,
        status: "approval_required",
      },
      data: {
        status: decision,
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        operatorVisibleResult,
        reviewerOperatorId: input.reviewerOperatorId,
        reviewedAt,
        reviewReasonCode: input.reasonCode,
        reviewFingerprint,
        payloadEscrowStatus: "not_stored",
        payloadEscrowFingerprint,
      },
    });

    if (updateResult.count !== 1) {
      const current = await this.findProviderWriteRequestById(
        input.tenantId,
        input.requestId,
      );
      const response = providerWriteReviewResponse(
        input.requestId,
        "failed",
        "Provider write request was already reviewed or is not reviewable.",
      );
      await this.auditProviderWriteReview(
        current?.caseId ?? request.caseId ?? null,
        input,
        response,
        decision,
        current ?? request,
        "concurrent_review_conflict",
      );
      return response;
    }

    const updated =
      (await this.findProviderWriteRequestById(input.tenantId, input.requestId)) ??
      {
        ...request,
        status: decision,
        operatorVisibleResult,
        reviewerOperatorId: input.reviewerOperatorId,
        reviewedAt,
        reviewReasonCode: input.reasonCode,
        reviewFingerprint,
        payloadEscrowStatus: "not_stored",
        payloadEscrowFingerprint,
      };
    const response = providerWriteResponseFromRequest(updated);
    await this.auditProviderWriteReview(
      updated.caseId ?? null,
      input,
      response,
      decision,
      updated,
      null,
    );
    return response;
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
    const credentialResolution =
      response.status === "policy_accepted"
        ? await this.resolveProviderReadCredential(request)
        : undefined;
    const providerReadExecution =
      response.status === "policy_accepted"
        ? await this.planProviderReadExecution(request, credentialResolution)
        : undefined;
    await this.auditProviderRead(
      request.caseId,
      request,
      response,
      metadata,
      policyReason,
      created.id,
      credentialResolution,
      providerReadExecution,
    );
    return ProviderReadResponseSchema.parse({
      ...response,
      readRunId: created.id,
    });
  }

  private async persistProviderWriteRequest(
    request: ProviderWriteRequest,
    response: ProviderWriteResponse,
    metadata: ProviderWriteMetadata,
    policyReason: string | null,
  ): Promise<ProviderWriteResponse> {
    if (!this.prisma || !request.tenantId) return response;
    let created: ProviderWriteRequestRecord;
    try {
      created = (await this.prisma.providerWriteRequest.create({
        data: {
          tenantId: request.tenantId,
          operatorId: request.operatorId ?? null,
          caseId: request.caseId,
          channel: request.channel,
          action: request.action,
          idempotencyKeyHash: metadata.idempotencyKeyHash,
          payloadHash: metadata.payloadHash,
          payloadKeys: metadata.payloadKeys as Prisma.InputJsonValue,
          requestHash: metadata.requestHash,
          status: response.status,
          networkExecution: response.networkExecution,
          providerMutationExecuted: false,
          customerVisibleMessageSent: false,
          operatorVisibleResult: response.operatorVisibleResult,
          policyReason,
          reviewerOperatorId: null,
          reviewedAt: null,
          reviewReasonCode: null,
          reviewFingerprint: null,
          payloadEscrowStatus: "not_stored",
          payloadEscrowFingerprint: providerWritePayloadEscrowFingerprint(
            metadata.requestHash,
          ),
        },
      })) as ProviderWriteRequestRecord;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await this.findProviderWriteRequest(
        request.tenantId,
        metadata.idempotencyKeyHash,
      );
      if (existing?.requestHash === metadata.requestHash) {
        return providerWriteResponseFromRequest(existing);
      }
      const conflictResponse = ProviderWriteResponseSchema.parse({
        writeRequestId: existing?.id ?? response.writeRequestId,
        status: "failed",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        operatorVisibleResult:
          "Provider write idempotency key was already used for a different request.",
        requiresHuman: true,
        retryable: false,
      });
      await this.auditProviderWrite(
        request.caseId,
        request,
        conflictResponse,
        metadata,
        "idempotency_key_reused",
        existing?.id,
      );
      return conflictResponse;
    }
    await this.auditProviderWrite(
      request.caseId,
      request,
      response,
      metadata,
      policyReason,
      created.id,
    );
    return ProviderWriteResponseSchema.parse({
      ...response,
      writeRequestId: created.id,
    });
  }

  private async persistProviderWriteExecutionAttempt(
    input: ProviderWriteExecutionAttemptInput,
    request: ProviderWriteRequestRecord,
    response: ProviderWriteExecutionAttemptResponse,
    metadata: ProviderWriteExecutionAttemptMetadata,
    policyReason: string | null,
  ): Promise<ProviderWriteExecutionAttemptResponse> {
    if (!this.prisma) return response;

    let created: ProviderWriteExecutionAttemptRecord;
    try {
      created = (await this.prisma.providerWriteExecutionAttempt.create({
        data: {
          tenantId: input.tenantId,
          providerWriteRequestId: request.id,
          operatorId: input.operatorId ?? null,
          channel: request.channel ?? "",
          action: request.action ?? "",
          status: response.status,
          idempotencyKeyHash: metadata.idempotencyKeyHash,
          requestHash: metadata.requestHash,
          attemptFingerprint: metadata.attemptFingerprint,
          payloadEscrowStatus: request.payloadEscrowStatus ?? "not_stored",
          payloadEscrowOpened: false,
          networkExecution: "not_started",
          providerMutationExecuted: false,
          customerVisibleMessageSent: false,
          operatorVisibleResult: response.operatorVisibleResult,
          policyReason,
        },
      })) as ProviderWriteExecutionAttemptRecord;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await this.findProviderWriteExecutionAttempt(
        input.tenantId,
        request.id,
        metadata.idempotencyKeyHash,
      );
      if (existing?.requestHash === metadata.requestHash) {
        return providerWriteExecutionAttemptResponseFromRecord(existing);
      }
      const conflictResponse = providerWriteExecutionAttemptResponse(
        existing?.id ?? response.attemptId,
        request.id,
        "failed",
        "Provider write execution idempotency key was already used for a different request.",
        false,
      );
      await this.auditProviderWriteExecutionAttempt(
        request.caseId ?? null,
        input,
        conflictResponse,
        request,
        existing ?? null,
        "idempotency_key_reused",
      );
      return conflictResponse;
    }

    const output = providerWriteExecutionAttemptResponseFromRecord(created);
    await this.auditProviderWriteExecutionAttempt(
      request.caseId ?? null,
      input,
      output,
      request,
      created,
      policyReason,
    );
    return output;
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

  private async providerWriteCaseBelongsToTenant(
    request: ProviderWriteRequest,
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

  private async resolveProviderReadCredential(
    request: ProviderReadRequest,
  ): Promise<ProviderReadCredentialAuditMetadata | undefined> {
    if (!request.tenantId || !this.credentialResolver) return undefined;
    const credentialRef = this.providerAdapters.getReadonlyCredentialRef(
      request.channel,
      request.tenantId,
    );
    if (!credentialRef) return undefined;

    const resolution = await this.credentialResolver.resolve({
      tenantId: request.tenantId,
      channel: request.channel,
      credentialRef,
    });
    return toProviderReadCredentialAuditMetadata(resolution);
  }

  private async planProviderReadExecution(
    request: ProviderReadRequest,
    credentialResolution?: ProviderReadCredentialAuditMetadata,
  ): Promise<ProviderReadExecutionAuditMetadata | undefined> {
    if (!this.providerReadHarness) return undefined;
    const result = await this.providerReadHarness.planReadonlyRead({
      request,
      credentialResolution: credentialResolution
        ? {
            status: credentialResolution.credentialResolutionStatus,
            source: credentialResolution.credentialSource,
            credentialRefFingerprint:
              credentialResolution.credentialRefFingerprint,
            credentialRefConfigured: credentialResolution.credentialRefConfigured,
            credentialMaterialLoaded: false,
            secretValueReturned: false,
            reason: "sanitized credential metadata for readonly harness",
          }
        : undefined,
    });
    return toProviderReadExecutionAuditMetadata(result);
  }

  private async auditProviderRead(
    caseId: string | null,
    request: ProviderReadRequest,
    response: ProviderReadResponse,
    metadata: ProviderReadMetadata,
    policyReason: string | null,
    providerReadRunId?: string,
    credentialResolution?: ProviderReadCredentialAuditMetadata,
    providerReadExecution?: ProviderReadExecutionAuditMetadata,
  ) {
    await this.auditService?.log(caseId, `provider_read.${response.status}`, {
      ...(providerReadRunId ? { providerReadRunId } : {}),
      ...(credentialResolution ? { credentialResolution } : {}),
      ...(providerReadExecution ? { providerReadExecution } : {}),
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

  private async auditProviderWrite(
    caseId: string | null,
    request: ProviderWriteRequest,
    response: ProviderWriteResponse,
    metadata: ProviderWriteMetadata,
    policyReason: string | null,
    providerWriteRequestId?: string,
  ) {
    await this.auditService?.log(caseId, `provider_write.${response.status}`, {
      ...(providerWriteRequestId ? { providerWriteRequestId } : {}),
      tenantId: request.tenantId ?? null,
      operatorId: request.operatorId ?? null,
      channel: request.channel,
      action: request.action,
      payloadHash: metadata.payloadHash,
      payloadKeys: metadata.payloadKeys,
      requestHash: metadata.requestHash,
      status: response.status,
      networkExecution: response.networkExecution,
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      policyReason,
    });
  }

  private async auditProviderWriteReview(
    caseId: string | null,
    input: ProviderWriteReviewInput,
    response: ProviderWriteResponse,
    attemptedDecision: "approved" | "rejected",
    request: ProviderWriteRequestRecord | null,
    policyReason: string | null,
  ) {
    await this.auditService?.log(caseId, `provider_write.${response.status}`, {
      providerWriteRequestId: input.requestId,
      tenantId: input.tenantId,
      requesterOperatorId: request?.operatorId ?? null,
      reviewerOperatorId: input.reviewerOperatorId,
      channel: request?.channel ?? null,
      action: request?.action ?? null,
      attemptedDecision,
      reasonCode: input.reasonCode,
      payloadHash: request?.payloadHash ?? null,
      payloadKeys: sanitizePayloadKeys(request?.payloadKeys),
      requestHash: request?.requestHash ?? null,
      reviewFingerprint: request?.reviewFingerprint ?? null,
      payloadEscrowStatus: request?.payloadEscrowStatus ?? "not_stored",
      payloadEscrowFingerprint: request?.payloadEscrowFingerprint ?? null,
      status: response.status,
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      policyReason,
    });
  }

  private async auditProviderWriteExecutionAttempt(
    caseId: string | null,
    input: ProviderWriteExecutionAttemptInput,
    response: ProviderWriteExecutionAttemptResponse,
    request: ProviderWriteRequestRecord | null,
    attempt: ProviderWriteExecutionAttemptRecord | null,
    policyReason: string | null,
  ) {
    await this.auditService?.log(
      caseId,
      `provider_write_execution.${response.status}`,
      {
        providerWriteRequestId: input.requestId,
        providerWriteExecutionAttemptId: response.attemptId,
        tenantId: input.tenantId,
        operatorId: input.operatorId ?? null,
        channel: request?.channel ?? null,
        action: request?.action ?? null,
        requestStatus: request?.status ?? null,
        reviewFingerprint: fingerprint(request?.reviewFingerprint ?? undefined),
        payloadEscrowStatus: request?.payloadEscrowStatus ?? "not_stored",
        payloadEscrowOpened: false,
        payloadEscrowFingerprint: fingerprint(
          request?.payloadEscrowFingerprint ?? undefined,
        ),
        idempotencyKeyFingerprint: fingerprint(attempt?.idempotencyKeyHash),
        requestFingerprint: fingerprint(attempt?.requestHash),
        attemptFingerprint: fingerprint(attempt?.attemptFingerprint),
        status: response.status,
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        policyReason,
      },
    );
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

type ProviderWriteMetadata = {
  idempotencyKeyHash: string;
  payloadHash: string;
  payloadKeys: {
    hasOrderId: boolean;
    hasLogisticsId: boolean;
    hasAddressFingerprint: boolean;
    hasCouponAmountCents: boolean;
  };
  requestHash: string;
};

type ProviderWriteExecutionAttemptMetadata = {
  idempotencyKeyHash: string;
  requestHash: string;
  attemptFingerprint: string;
};

type ProviderWriteApprovalInput = {
  tenantId: string;
  requestId: string;
  reviewerOperatorId: string;
  reasonCode: ProviderWriteApprovalRequest["reasonCode"];
  reviewedAt?: Date;
};

type ProviderWriteRejectionInput = {
  tenantId: string;
  requestId: string;
  reviewerOperatorId: string;
  reasonCode: ProviderWriteRejectionRequest["reasonCode"];
  reviewedAt?: Date;
};

type ProviderWriteReviewInput =
  | ProviderWriteApprovalInput
  | ProviderWriteRejectionInput;

type ProviderWriteExecutionAttemptInput = {
  tenantId: string;
  requestId: string;
  operatorId: string;
  idempotencyKey: ProviderWriteExecutionAttemptRequest["idempotencyKey"];
};

type ProviderReadCredentialAuditMetadata = {
  credentialResolutionStatus: ProviderCredentialResolution["status"];
  credentialSource: ProviderCredentialResolution["source"];
  credentialRefFingerprint: string;
  credentialRefConfigured: boolean;
  credentialMaterialLoaded: false;
  secretValueReturned: false;
};

type ProviderReadExecutionAuditMetadata = ProviderReadonlyClientHarnessResult;

type ProviderReadRunRecord = {
  id: string;
  caseId?: string;
  operatorId?: string | null;
  channel?: string;
  readCapability?: string;
  status: string;
  networkExecution: string;
  providerDataReturned: boolean;
  operatorVisibleResult: string;
  lookupHash?: string;
  lookupKeys?: unknown;
  requestHash: string;
  policyReason?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type ProviderWriteRequestRecord = {
  id: string;
  tenantId?: string;
  caseId?: string;
  operatorId?: string | null;
  channel?: string;
  action?: string;
  status: string;
  networkExecution: string;
  providerMutationExecuted: boolean;
  customerVisibleMessageSent: boolean;
  operatorVisibleResult: string;
  payloadHash?: string;
  payloadKeys?: unknown;
  requestHash: string;
  policyReason?: string | null;
  reviewerOperatorId?: string | null;
  reviewedAt?: Date | null;
  reviewReasonCode?: string | null;
  reviewFingerprint?: string | null;
  payloadEscrowStatus?: string;
  payloadEscrowFingerprint?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type ProviderWriteExecutionAttemptRecord = {
  id: string;
  tenantId?: string;
  providerWriteRequestId?: string;
  operatorId?: string | null;
  channel?: string;
  action?: string;
  status: ProviderWriteExecutionAttemptStatus;
  idempotencyKeyHash?: string;
  requestHash?: string;
  attemptFingerprint?: string;
  payloadEscrowStatus?: string;
  payloadEscrowOpened?: boolean;
  networkExecution: string;
  providerMutationExecuted: boolean;
  customerVisibleMessageSent: boolean;
  operatorVisibleResult: string;
  policyReason?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type ListProviderReadRunsInput = {
  tenantId: string;
  limit?: number;
  status?: string;
};

type ListProviderWriteRequestsInput = {
  tenantId: string;
  limit?: number;
  status?: string;
};

type ProviderReadSummaryInput = {
  tenantId: string;
  from?: Date;
  to?: Date;
  now?: Date;
};

const PROVIDER_READ_SUMMARY_WINDOW_MS = 24 * 60 * 60_000;

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

function providerWriteMetadata(
  request: ProviderWriteRequest,
): ProviderWriteMetadata {
  const payloadHash = sha256(stableJson(request.payload));
  return {
    idempotencyKeyHash: sha256(
      stableJson({
        kind: "provider_write_idempotency_key",
        value: request.idempotencyKey,
      }),
    ),
    payloadHash,
    payloadKeys: {
      hasOrderId: Boolean(request.payload.orderId),
      hasLogisticsId: Boolean(request.payload.logisticsId),
      hasAddressFingerprint: Boolean(request.payload.addressFingerprint),
      hasCouponAmountCents: request.payload.couponAmountCents !== undefined,
    },
    requestHash: sha256(
      stableJson({
        caseId: request.caseId,
        tenantId: request.tenantId,
        channel: request.channel,
        action: request.action,
        payloadHash,
      }),
    ),
  };
}

function providerWritePayloadEscrowFingerprint(requestHash: string) {
  return sha256(
    stableJson({
      kind: "provider_write_payload_escrow_absent",
      payloadEscrowStatus: "not_stored",
      requestHash,
    }),
  );
}

function providerWriteReviewFingerprint(
  request: ProviderWriteRequestRecord,
  input: ProviderWriteReviewInput,
  decision: "approved" | "rejected",
  reviewedAt: Date,
) {
  return sha256(
    stableJson({
      kind: "provider_write_review",
      providerWriteRequestId: request.id,
      requestHash: request.requestHash,
      reviewerOperatorId: input.reviewerOperatorId,
      decision,
      reasonCode: input.reasonCode,
      reviewedAt: reviewedAt.toISOString(),
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
    }),
  );
}

function providerWriteExecutionAttemptMetadata(
  input: ProviderWriteExecutionAttemptInput,
  request: ProviderWriteRequestRecord,
): ProviderWriteExecutionAttemptMetadata {
  const idempotencyKeyHash = sha256(
    stableJson({
      kind: "provider_write_execution_attempt_idempotency_key",
      value: input.idempotencyKey,
    }),
  );
  const requestHash = sha256(
    stableJson({
      kind: "provider_write_execution_attempt_request",
      providerWriteRequestId: request.id,
      providerWriteRequestHash: request.requestHash,
      requestStatus: request.status,
      reviewFingerprint: request.reviewFingerprint ?? null,
      payloadEscrowStatus: request.payloadEscrowStatus ?? "not_stored",
      payloadEscrowFingerprint: request.payloadEscrowFingerprint ?? null,
      tenantId: input.tenantId,
      idempotencyKeyHash,
    }),
  );
  return {
    idempotencyKeyHash,
    requestHash,
    attemptFingerprint: sha256(
      stableJson({
        kind: "provider_write_execution_attempt",
        providerWriteRequestId: request.id,
        providerWriteRequestHash: request.requestHash,
        requestHash,
        requestStatus: request.status,
        reviewFingerprint: request.reviewFingerprint ?? null,
        payloadEscrowStatus: request.payloadEscrowStatus ?? "not_stored",
        payloadEscrowFingerprint: request.payloadEscrowFingerprint ?? null,
        payloadEscrowOpened: false,
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
      }),
    ),
  };
}

function providerWriteExecutionDecision(
  request: ProviderWriteRequestRecord,
): {
  status: ProviderWriteExecutionAttemptStatus;
  operatorVisibleResult: string;
  policyReason: string | null;
  retryable: boolean;
} {
  if (request.status !== "approved") {
    return {
      status: "blocked",
      operatorVisibleResult:
        "Provider write execution attempt blocked because the request is not approved.",
      policyReason: "request_not_approved",
      retryable: false,
    };
  }

  if ((request.payloadEscrowStatus ?? "not_stored") !== "not_stored") {
    return {
      status: "blocked",
      operatorVisibleResult:
        "Provider write execution attempt blocked because payload escrow opening is not supported in this build.",
      policyReason: "unsupported_payload_escrow_state",
      retryable: false,
    };
  }

  if (providerWriteExecutionKillSwitchEnabled()) {
    return {
      status: "blocked",
      operatorVisibleResult:
        "Provider write execution attempt blocked by the provider write execution kill switch.",
      policyReason: "execution_kill_switch_enabled",
      retryable: true,
    };
  }

  return {
    status: "dry_run_recorded",
    operatorVisibleResult:
      "Provider write dry-run execution attempt recorded; provider network execution remains disabled in this build.",
    policyReason: null,
    retryable: false,
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

function providerWriteResponseFromRequest(
  request: ProviderWriteRequestRecord,
): ProviderWriteResponse {
  return ProviderWriteResponseSchema.parse({
    writeRequestId: request.id,
    status: request.status,
    networkExecution: "not_started",
    providerMutationExecuted: false,
    customerVisibleMessageSent: false,
    operatorVisibleResult: request.operatorVisibleResult,
    requiresHuman: true,
    retryable: false,
  });
}

function providerWriteReviewResponse(
  writeRequestId: string,
  status: Extract<ProviderWriteStatus, "blocked" | "failed">,
  operatorVisibleResult: string,
): ProviderWriteResponse {
  return ProviderWriteResponseSchema.parse({
    writeRequestId,
    status,
    networkExecution: "not_started",
    providerMutationExecuted: false,
    customerVisibleMessageSent: false,
    operatorVisibleResult,
    requiresHuman: true,
    retryable: false,
  });
}

function providerWriteExecutionAttemptResponse(
  attemptId: string,
  writeRequestId: string,
  status: ProviderWriteExecutionAttemptStatus,
  operatorVisibleResult: string,
  retryable: boolean,
): ProviderWriteExecutionAttemptResponse {
  return ProviderWriteExecutionAttemptResponseSchema.parse({
    attemptId,
    writeRequestId,
    status,
    networkExecution: "not_started",
    providerMutationExecuted: false,
    customerVisibleMessageSent: false,
    payloadEscrowOpened: false,
    operatorVisibleResult,
    requiresHuman: true,
    retryable,
  });
}

function providerWriteExecutionAttemptResponseFromRecord(
  attempt: ProviderWriteExecutionAttemptRecord,
): ProviderWriteExecutionAttemptResponse {
  return providerWriteExecutionAttemptResponse(
    attempt.id,
    attempt.providerWriteRequestId ?? "",
    attempt.status,
    attempt.operatorVisibleResult,
    attempt.status === "blocked" &&
      attempt.policyReason === "execution_kill_switch_enabled",
  );
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

function toProviderReadCredentialAuditMetadata(
  resolution: ProviderCredentialResolution,
): ProviderReadCredentialAuditMetadata {
  return {
    credentialResolutionStatus: resolution.status,
    credentialSource: resolution.source,
    credentialRefFingerprint: resolution.credentialRefFingerprint,
    credentialRefConfigured: resolution.credentialRefConfigured,
    credentialMaterialLoaded: false,
    secretValueReturned: false,
  };
}

function toProviderReadExecutionAuditMetadata(
  result: ProviderReadonlyClientHarnessResult,
): ProviderReadExecutionAuditMetadata {
  return {
    executionMode: result.executionMode,
    credentialResolutionStatus: result.credentialResolutionStatus,
    credentialRefConfigured: result.credentialRefConfigured,
    providerRequestPrepared: result.providerRequestPrepared,
    networkExecution: "not_implemented",
    networkAttempted: false,
    providerDataReturned: false,
    providerResponseCaptured: false,
    attemptCount: 0,
    timeoutMs: result.timeoutMs,
    maxRetries: result.maxRetries,
    reason: result.reason,
  };
}

function toSanitizedProviderReadRun(run: ProviderReadRunRecord) {
  return {
    id: run.id,
    caseId: run.caseId ?? "",
    operatorId: run.operatorId ?? null,
    channel: run.channel ?? "",
    readCapability: run.readCapability ?? "",
    status: run.status,
    networkExecution: run.networkExecution,
    providerDataReturned: false,
    lookupKeys: sanitizeLookupKeys(run.lookupKeys),
    lookupFingerprint: fingerprint(run.lookupHash),
    requestFingerprint: fingerprint(run.requestHash),
    policyReason: run.policyReason ?? null,
    createdAt: run.createdAt?.toISOString() ?? "",
    updatedAt: run.updatedAt?.toISOString() ?? "",
  };
}

function toSanitizedProviderWriteRequest(run: ProviderWriteRequestRecord) {
  return {
    id: run.id,
    caseId: run.caseId ?? "",
    operatorId: run.operatorId ?? null,
    channel: run.channel ?? "",
    action: run.action ?? "",
    status: run.status,
    networkExecution: "not_started",
    providerMutationExecuted: false,
    customerVisibleMessageSent: false,
    payloadKeys: sanitizePayloadKeys(run.payloadKeys),
    payloadFingerprint: fingerprint(run.payloadHash),
    requestFingerprint: fingerprint(run.requestHash),
    reviewerOperatorId: run.reviewerOperatorId ?? null,
    reviewedAt: run.reviewedAt?.toISOString() ?? null,
    reviewReasonCode: run.reviewReasonCode ?? null,
    reviewFingerprint: fingerprint(run.reviewFingerprint ?? undefined),
    payloadEscrowStatus: run.payloadEscrowStatus ?? "not_stored",
    payloadEscrowFingerprint: fingerprint(
      run.payloadEscrowFingerprint ?? undefined,
    ),
    policyReason: run.policyReason ?? null,
    createdAt: run.createdAt?.toISOString() ?? "",
    updatedAt: run.updatedAt?.toISOString() ?? "",
  };
}

function sanitizeLookupKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { hasOrderId: false, hasLogisticsId: false };
  }
  const record = value as Record<string, unknown>;
  return {
    hasOrderId: record.hasOrderId === true,
    hasLogisticsId: record.hasLogisticsId === true,
  };
}

function sanitizePayloadKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      hasOrderId: false,
      hasLogisticsId: false,
      hasAddressFingerprint: false,
      hasCouponAmountCents: false,
    };
  }
  const record = value as Record<string, unknown>;
  return {
    hasOrderId: record.hasOrderId === true,
    hasLogisticsId: record.hasLogisticsId === true,
    hasAddressFingerprint: record.hasAddressFingerprint === true,
    hasCouponAmountCents: record.hasCouponAmountCents === true,
  };
}

function fingerprint(hash?: string) {
  return typeof hash === "string" ? hash.slice(0, 12) : "";
}

function summarizeProviderReadRuns(
  runs: Array<{ channel?: string; readCapability?: string }>,
  field: "channel" | "readCapability",
) {
  const counts = new Map<string, number>();
  for (const run of runs) {
    const key = run[field] ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function emptyProviderReadSummary(input: ProviderReadSummaryInput) {
  const measuredAt = input.now ?? new Date();
  const to = input.to ?? measuredAt;
  const from = input.from ?? new Date(to.getTime() - PROVIDER_READ_SUMMARY_WINDOW_MS);
  return {
    measuredAt: measuredAt.toISOString(),
    window: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    totals: {
      totalCount: 0,
      policyAcceptedCount: 0,
      blockedCount: 0,
      failedCount: 0,
    },
    byChannel: [],
    byCapability: [],
    latestCreatedAt: null,
  };
}
