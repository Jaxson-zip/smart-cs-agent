import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { ChannelWebhookSecurityService } from "./channel-webhook-security.service";
import { ChannelEventReviewService } from "./channel-event-review.service";
import { ChannelEventsController } from "./channel-events.controller";
import { RealChannelNormalizerService } from "./real-channel-normalizer.service";
import { RealChannelRateLimitService } from "./real-channel-rate-limit.service";
import { RealChannelController } from "./real-channel.controller";

@Module({
  imports: [AgentModule],
  controllers: [RealChannelController, ChannelEventsController],
  providers: [
    ChannelWebhookSecurityService,
    RealChannelNormalizerService,
    RealChannelRateLimitService,
    ChannelEventReviewService,
  ],
  exports: [ChannelWebhookSecurityService, ChannelEventReviewService],
})
export class ChannelsModule {}
