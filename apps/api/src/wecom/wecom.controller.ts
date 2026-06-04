import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { WecomSandboxProvider } from "./wecom-sandbox.provider";

@Controller("v1/wecom")
export class WecomController {
  constructor(private readonly wecomProvider: WecomSandboxProvider) {}

  @Post("events")
  @HttpCode(HttpStatus.OK)
  async handleEvent(@Body() body: unknown) {
    const normalizedEvent = await this.wecomProvider.normalizeIncoming(body);
    
    return {
      status: "received",
      normalizedEvent,
    };
  }

  @Post("webhook/send")
  @HttpCode(HttpStatus.OK)
  async handleSend(@Body() body: any) {
    const result = await this.wecomProvider.sendMessage({
      merchantId: body.merchantId,
      channel: body.channel,
      externalConversationId: body.externalConversationId,
      text: body.text,
    });
    return result;
  }
}
