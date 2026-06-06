import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module";
import {
  HealthController,
  HealthMetricsController,
  HealthReadinessController,
} from "./health.controller";

@Module({
  imports: [ChannelsModule],
  controllers: [
    HealthController,
    HealthReadinessController,
    HealthMetricsController,
  ],
})
export class HealthModule {}
