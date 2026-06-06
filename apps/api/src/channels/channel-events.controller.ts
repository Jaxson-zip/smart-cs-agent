import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
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

@Controller("v1/channel-events")
export class ChannelEventsController {
  constructor(private readonly reviewService: ChannelEventReviewService) {}

  @Get()
  async list(@Headers() headers: RequestHeaders) {
    const context = requireRequestContext(headers);
    return this.reviewService.listPending(context.tenantId);
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
