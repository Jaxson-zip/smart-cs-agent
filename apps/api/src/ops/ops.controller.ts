import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import {
  ChannelMessageIngestSchema,
  CompensationDeclinedRequestSchema,
  ExecuteActionRequestSchema,
  HandoffRequestSchema,
  ProviderWriteApprovalRequestSchema,
  ProviderWriteExecutionAttemptRequestSchema,
  ProviderWriteExecutionAttemptStatusSchema,
  ProviderWriteKillSwitchUpdateRequestSchema,
  ProviderReadRequestSchema,
  ProviderWriteRejectionRequestSchema,
  ProviderWriteRequestSchema,
  type ChannelMessageIngest,
  type CompensationDeclinedRequest,
  type ExecuteActionRequest,
  type HandoffRequest,
  type ProviderWriteApprovalRequest,
  type ProviderWriteExecutionAttemptRequest,
  type ProviderWriteKillSwitchUpdateRequest,
  type ProviderReadRequest,
  type ProviderWriteRejectionRequest,
  type ProviderWriteRequest,
} from "@smart-cs-agent/shared";
import {
  requireRequestContext,
  type RequestContext,
  type RequestHeaders,
} from "../auth/request-context";
import { OpsService } from "./ops.service";

const providerReadRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  status: z.enum(["policy_accepted", "blocked", "failed"]).optional(),
});

const providerWriteRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  status: z
    .enum(["approval_required", "approved", "rejected", "blocked", "failed"])
    .optional(),
});

const providerWriteExecutionAttemptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  status: ProviderWriteExecutionAttemptStatusSchema.optional(),
  providerWriteRequestId: z.string().min(1).optional(),
});

const providerWriteLivePilotRunLedgerDraftQuerySchema = z.object({
  channel: z.enum(["taobao", "douyin"]),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  freezeWindowActive: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  changeTicket: z.string().min(3).max(100).optional(),
});

const providerReadSummaryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
const PROVIDER_READ_SUMMARY_WINDOW_MS = 24 * 60 * 60_000;
const PROVIDER_WRITE_LIVE_PILOT_LEDGER_WINDOW_MINUTES = {
  min: 15,
  max: 120,
} as const;

@Controller("v2")
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get("integrations")
  listIntegrations(@Headers() headers: RequestHeaders) {
    const context = requireRequestContext(headers);
    return this.opsService.listIntegrations(context.tenantId);
  }

  @Get("provider-reads/runs")
  async listProviderReadRuns(
    @Query() query: unknown,
    @Headers() headers: RequestHeaders,
  ) {
    const context = requireRequestContext(headers);
    requireProviderReadAdminAccess(context);
    const parsed = providerReadRunsQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.opsService.listProviderReadRuns({
      tenantId: context.tenantId,
      limit: parsed.data.limit,
      status: parsed.data.status,
    });
  }

  @Get("provider-reads/summary")
  async providerReadSummary(
    @Query() query: unknown,
    @Headers() headers: RequestHeaders,
  ) {
    const context = requireRequestContext(headers);
    requireProviderReadAdminAccess(context);
    const parsed = providerReadSummaryQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
    const from = parsed.data.from
      ? new Date(parsed.data.from)
      : new Date(to.getTime() - PROVIDER_READ_SUMMARY_WINDOW_MS);
    if (from > to || to.getTime() - from.getTime() > PROVIDER_READ_SUMMARY_WINDOW_MS) {
      throw new BadRequestException("Provider read summary window is invalid");
    }

    return this.opsService.getProviderReadSummary({
      tenantId: context.tenantId,
      from,
      to,
    });
  }

  @Get("provider-writes/requests")
  async listProviderWriteRequests(
    @Query() query: unknown,
    @Headers() headers: RequestHeaders,
  ) {
    const context = requireRequestContext(headers);
    requireProviderWriteAdminAccess(context);
    const parsed = providerWriteRequestsQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.opsService.listProviderWriteRequests({
      tenantId: context.tenantId,
      limit: parsed.data.limit,
      status: parsed.data.status,
    });
  }

  @Get("provider-writes/execution-attempts")
  async listProviderWriteExecutionAttempts(
    @Query() query: unknown,
    @Headers() headers: RequestHeaders,
  ) {
    const context = requireRequestContext(headers);
    requireProviderWriteAdminAccess(context);
    const parsed = providerWriteExecutionAttemptsQuerySchema.safeParse(
      query ?? {},
    );
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.opsService.listProviderWriteExecutionAttempts({
      tenantId: context.tenantId,
      limit: parsed.data.limit,
      status: parsed.data.status,
      providerWriteRequestId: parsed.data.providerWriteRequestId,
    });
  }

  @Get("provider-writes/live-pilot-run-ledger/draft")
  async getProviderWriteLivePilotRunLedgerDraft(
    @Query() query: unknown,
    @Headers() headers: RequestHeaders,
  ) {
    const context = requireRequestContext(headers);
    requireProviderWriteAdminAccess(context);
    const parsed = providerWriteLivePilotRunLedgerDraftQuerySchema.safeParse(
      query ?? {},
    );
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
    const from = parsed.data.from
      ? new Date(parsed.data.from)
      : new Date(
          to.getTime() -
            PROVIDER_WRITE_LIVE_PILOT_LEDGER_WINDOW_MINUTES.min * 60_000,
        );
    const durationMinutes = (to.getTime() - from.getTime()) / 60_000;
    if (
      from > to ||
      durationMinutes < PROVIDER_WRITE_LIVE_PILOT_LEDGER_WINDOW_MINUTES.min ||
      durationMinutes > PROVIDER_WRITE_LIVE_PILOT_LEDGER_WINDOW_MINUTES.max
    ) {
      throw new BadRequestException(
        "Provider write live pilot run ledger draft window is invalid",
      );
    }

    return this.opsService.getProviderWriteLivePilotRunLedgerDraft({
      tenantId: context.tenantId,
      channel: parsed.data.channel,
      from,
      to,
      freezeWindowActive: parsed.data.freezeWindowActive,
      changeTicket: parsed.data.changeTicket,
    });
  }

  @Get("provider-writes/live-executor/status")
  getProviderWriteLiveExecutorStatus(@Headers() headers: RequestHeaders) {
    const context = requireRequestContext(headers);
    requireProviderWriteAdminAccess(context);
    return this.opsService.getProviderWriteLiveExecutorStatus();
  }

  @Get("provider-writes/kill-switch/status")
  getProviderWriteKillSwitchStatus(@Headers() headers: RequestHeaders) {
    const context = requireRequestContext(headers);
    requireProviderWriteAdminAccess(context);
    return this.opsService.getProviderWriteKillSwitchStatus(context.tenantId);
  }

  @Post("provider-writes/kill-switch/status")
  updateProviderWriteKillSwitch(
    @Headers() headers: RequestHeaders,
    @Body() body: ProviderWriteKillSwitchUpdateRequest,
  ) {
    const context = requireRequestContext(headers);
    requireProviderWriteAdminAccess(context);
    const request = ProviderWriteKillSwitchUpdateRequestSchema.parse(body);
    return this.opsService.updateProviderWriteKillSwitch({
      tenantId: context.tenantId,
      operatorId: context.operatorId,
      ...request,
    });
  }

  @Post("channel-events")
  ingestMessage(
    @Headers() headers: RequestHeaders,
    @Body() body: ChannelMessageIngest,
  ) {
    requireRequestContext(headers);
    ChannelMessageIngestSchema.parse(body);
    return this.opsService.ingestMessage();
  }

  @Post("actions/execute")
  executeAction(
    @Headers() headers: RequestHeaders,
    @Body() body: ExecuteActionRequest,
  ) {
    const context = requireRequestContext(headers);
    const request = ExecuteActionRequestSchema.parse(body);
    return this.opsService.executeAction({
      ...request,
      tenantId: context.tenantId,
      operatorId: context.operatorId,
    });
  }

  @Post("provider-reads/execute")
  executeProviderRead(
    @Headers() headers: RequestHeaders,
    @Body() body: ProviderReadRequest,
  ) {
    const context = requireRequestContext(headers);
    const request = ProviderReadRequestSchema.parse(body);
    return this.opsService.executeProviderRead({
      ...request,
      tenantId: context.tenantId,
      operatorId: context.operatorId,
    });
  }

  @Post("provider-writes/request")
  requestProviderWrite(
    @Headers() headers: RequestHeaders,
    @Body() body: ProviderWriteRequest,
  ) {
    const context = requireRequestContext(headers);
    requireProviderWriteOperatorAccess(context);
    const request = ProviderWriteRequestSchema.parse(body);
    return this.opsService.requestProviderWrite({
      ...request,
      tenantId: context.tenantId,
      operatorId: context.operatorId,
    });
  }

  @Post("provider-writes/requests/:id/approve")
  approveProviderWriteRequest(
    @Param("id") id: string,
    @Headers() headers: RequestHeaders,
    @Body() body: ProviderWriteApprovalRequest,
  ) {
    const context = requireRequestContext(headers);
    requireProviderWriteAdminAccess(context);
    const request = ProviderWriteApprovalRequestSchema.parse(body);
    return this.opsService.approveProviderWriteRequest({
      tenantId: context.tenantId,
      requestId: id,
      reviewerOperatorId: context.operatorId,
      reasonCode: request.reasonCode,
    });
  }

  @Post("provider-writes/requests/:id/reject")
  rejectProviderWriteRequest(
    @Param("id") id: string,
    @Headers() headers: RequestHeaders,
    @Body() body: ProviderWriteRejectionRequest,
  ) {
    const context = requireRequestContext(headers);
    requireProviderWriteAdminAccess(context);
    const request = ProviderWriteRejectionRequestSchema.parse(body);
    return this.opsService.rejectProviderWriteRequest({
      tenantId: context.tenantId,
      requestId: id,
      reviewerOperatorId: context.operatorId,
      reasonCode: request.reasonCode,
    });
  }

  @Post("provider-writes/requests/:id/execution-attempts")
  executeProviderWriteAttempt(
    @Param("id") id: string,
    @Headers() headers: RequestHeaders,
    @Body() body: ProviderWriteExecutionAttemptRequest,
  ) {
    const context = requireRequestContext(headers);
    requireProviderWriteAdminAccess(context);
    const request = ProviderWriteExecutionAttemptRequestSchema.parse(body);
    return this.opsService.executeProviderWriteAttempt({
      tenantId: context.tenantId,
      requestId: id,
      operatorId: context.operatorId,
      idempotencyKey: request.idempotencyKey,
    });
  }

  @Post("compensation/declined")
  handleCompensationDeclined(
    @Headers() headers: RequestHeaders,
    @Body() body: CompensationDeclinedRequest,
  ) {
    requireRequestContext(headers);
    const request = CompensationDeclinedRequestSchema.parse(body);
    return this.opsService.handleCompensationDeclined(request);
  }

  @Post("handoffs")
  createHandoff(
    @Headers() headers: RequestHeaders,
    @Body() body: HandoffRequest,
  ) {
    requireRequestContext(headers);
    const request = HandoffRequestSchema.parse(body);
    return this.opsService.createHandoff(request);
  }
}

function requireProviderReadAdminAccess(context: RequestContext) {
  if (context.role !== "admin") {
    throw new ForbiddenException("Provider read operations require admin permission");
  }
  if (context.authMethod !== "operator_api_key") {
    throw new UnauthorizedException("Operator API key is required");
  }
}

function requireProviderWriteAdminAccess(context: RequestContext) {
  if (context.role !== "admin") {
    throw new ForbiddenException("Provider write operations require admin permission");
  }
  if (context.authMethod !== "operator_api_key") {
    throw new UnauthorizedException("Operator API key is required");
  }
}

function requireProviderWriteOperatorAccess(context: RequestContext) {
  if (context.role === "viewer") {
    throw new ForbiddenException("Provider write requests require operator permission");
  }
  if (context.authMethod !== "operator_api_key") {
    throw new UnauthorizedException("Operator API key is required");
  }
}
