import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import {
  ChannelMessageIngestSchema,
  CompensationDeclinedRequestSchema,
  ExecuteActionRequestSchema,
  HandoffRequestSchema,
  type ChannelMessageIngest,
  type CompensationDeclinedRequest,
  type ExecuteActionRequest,
  type HandoffRequest,
} from "@smart-cs-agent/shared";
import {
  requireRequestContext,
  type RequestHeaders,
} from "../auth/request-context";
import { OpsService } from "./ops.service";

@Controller("v2")
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get("integrations")
  listIntegrations(@Headers() headers: RequestHeaders) {
    requireRequestContext(headers);
    return this.opsService.listIntegrations();
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
      operatorId: context.operatorId,
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
