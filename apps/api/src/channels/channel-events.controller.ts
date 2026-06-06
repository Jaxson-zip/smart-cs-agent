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
} from "@nestjs/common";
import { z } from "zod";
import {
  requireRequestContext,
  type RequestContext,
  type RequestHeaders,
} from "../auth/request-context";
import { ChannelEventReviewService } from "./channel-event-review.service";

const ignoreBodySchema = z
  .object({
    note: z.string().max(500).optional(),
  })
  .optional();

const recoverStaleBodySchema = z
  .object({
    olderThanMinutes: z.number().int().min(1).max(1440).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();

const auditSummaryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
const AUDIT_SUMMARY_WINDOW_MS = 24 * 60 * 60_000;

@Controller("v1/channel-events")
export class ChannelEventsController {
  constructor(private readonly reviewService: ChannelEventReviewService) {}

  @Get()
  async list(@Headers() headers: RequestHeaders) {
    const context = requireRequestContext(headers);
    return this.reviewService.listPending(context.tenantId);
  }

  @Get("metrics")
  async metrics(@Headers() headers: RequestHeaders) {
    const context = requireRequestContext(headers);
    return this.reviewService.getQueueMetrics({ tenantId: context.tenantId });
  }

  @Get("operation-audits")
  async operationAudits(@Headers() headers: RequestHeaders) {
    const context = requireRequestContext(headers);
    requireReviewRecoveryAccess(context);
    return this.reviewService.listQueueOperationAudits({
      tenantId: context.tenantId,
    });
  }

  @Get("audit-summary")
  async auditSummary(
    @Query() query: unknown,
    @Headers() headers: RequestHeaders,
  ) {
    const context = requireRequestContext(headers);
    requireReviewRecoveryAccess(context);
    const parsed = auditSummaryQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
    const from = parsed.data.from
      ? new Date(parsed.data.from)
      : new Date(to.getTime() - AUDIT_SUMMARY_WINDOW_MS);
    if (from > to || to.getTime() - from.getTime() > AUDIT_SUMMARY_WINDOW_MS) {
      throw new BadRequestException("Queue audit summary window is invalid");
    }

    return this.reviewService.getQueueAuditSummary({
      tenantId: context.tenantId,
      from,
      to,
    });
  }

  @Post("recover-stale")
  async recoverStale(
    @Body() body: unknown,
    @Headers() headers: RequestHeaders,
  ) {
    const context = requireRequestContext(headers);
    requireReviewRecoveryAccess(context);
    const parsed = recoverStaleBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    return this.reviewService.recoverStaleProcessing({
      tenantId: context.tenantId,
      operatorId: context.operatorId,
      olderThanMinutes: parsed.data?.olderThanMinutes,
      limit: parsed.data?.limit,
    });
  }

  @Post(":id/replay")
  async replay(
    @Param("id") id: string,
    @Headers() headers: RequestHeaders,
  ) {
    const context = requireRequestContext(headers);
    requireReviewMutationAccess(context);
    return this.reviewService.replay(id, context);
  }

  @Post(":id/ignore")
  async ignore(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers() headers: RequestHeaders,
  ) {
    const context = requireRequestContext(headers);
    requireReviewMutationAccess(context);
    const parsed = ignoreBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    return this.reviewService.ignore(id, {
      tenantId: context.tenantId,
      operatorId: context.operatorId,
      note: parsed.data?.note,
    });
  }
}

function requireReviewMutationAccess(context: RequestContext) {
  if (context.role === "viewer") {
    throw new ForbiddenException("Viewer operators cannot review channel events");
  }
}

function requireReviewRecoveryAccess(context: RequestContext) {
  if (context.role !== "admin") {
    throw new ForbiddenException("Channel event recovery requires admin permission");
  }
}
