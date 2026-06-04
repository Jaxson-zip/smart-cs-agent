import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { OpsModule } from "./ops/ops.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [HealthModule, RealtimeModule, OpsModule],
})
export class AppModule {}
