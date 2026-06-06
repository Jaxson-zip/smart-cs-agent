import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module";
import { HealthController, HealthReadinessController } from "./health.controller";

@Module({
  imports: [ChannelsModule],
  controllers: [HealthController, HealthReadinessController],
})
export class HealthModule {}
