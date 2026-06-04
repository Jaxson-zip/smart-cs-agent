import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { OpsModule } from "./ops/ops.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { WecomModule } from "./wecom/wecom.module";

@Module({
  imports: [HealthModule, RealtimeModule, OpsModule, WecomModule],
})
export class AppModule {}
