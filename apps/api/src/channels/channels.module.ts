import { Module } from "@nestjs/common";
import { ChannelWebhookSecurityService } from "./channel-webhook-security.service";
import { RealChannelNormalizerService } from "./real-channel-normalizer.service";
import { RealChannelController } from "./real-channel.controller";

@Module({
  controllers: [RealChannelController],
  providers: [ChannelWebhookSecurityService, RealChannelNormalizerService],
  exports: [ChannelWebhookSecurityService],
})
export class ChannelsModule {}
