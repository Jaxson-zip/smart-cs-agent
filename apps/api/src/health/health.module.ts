import { Module } from "@nestjs/common";
import { HealthController, HealthReadinessController } from "./health.controller";

@Module({
  controllers: [HealthController, HealthReadinessController],
})
export class HealthModule {}
