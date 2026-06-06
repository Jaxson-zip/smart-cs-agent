import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import {
  ChannelWebhookSecurityService,
  type AcceptedChannelWebhook,
} from "./channel-webhook-security.service";

@Controller("v1/channels")
export class RealChannelController {
  constructor(private readonly security: ChannelWebhookSecurityService) {}

  @Post(":channel/webhook/events")
  @HttpCode(HttpStatus.ACCEPTED)
  async handleEvent(
    @Param("channel") channel: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Req() request?: { rawBody?: Buffer },
  ): Promise<AcceptedChannelWebhook> {
    return this.security.acceptIncomingWebhook({
      channel,
      headers,
      body,
      rawBody: request?.rawBody,
    });
  }
}
