import { Body, Controller, Get, Post } from "@nestjs/common";
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
import { OpsService } from "./ops.service";

@Controller("v2")
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get("integrations")
  listIntegrations() {
    return this.opsService.listIntegrations();
  }

  @Post("channel-events")
  ingestMessage(@Body() body: ChannelMessageIngest) {
    ChannelMessageIngestSchema.parse(body);
    return this.opsService.ingestMessage();
  }

  @Post("actions/execute")
  executeAction(@Body() body: ExecuteActionRequest) {
    const request = ExecuteActionRequestSchema.parse(body);
    return this.opsService.executeAction(request);
  }

  @Post("compensation/declined")
  handleCompensationDeclined(@Body() body: CompensationDeclinedRequest) {
    const request = CompensationDeclinedRequestSchema.parse(body);
    return this.opsService.handleCompensationDeclined(request);
  }

  @Post("handoffs")
  createHandoff(@Body() body: HandoffRequest) {
    const request = HandoffRequestSchema.parse(body);
    return this.opsService.createHandoff(request);
  }
}
