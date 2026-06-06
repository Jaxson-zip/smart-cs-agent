import { Module } from "@nestjs/common";
import { ChannelWebhookSecurityService } from "./channel-webhook-security.service";
import { RealChannelController } from "./real-channel.controller";

@Module({
  controllers: [RealChannelController],
  providers: [ChannelWebhookSecurityService],
  exports: [ChannelWebhookSecurityService],
})
export class ChannelsModule {}
