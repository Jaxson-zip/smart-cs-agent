import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { OpsModule } from "./ops/ops.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { WecomModule } from "./wecom/wecom.module";
import { AgentModule } from "./agent/agent.module";
import { PrismaModule } from "./prisma/prisma.module";
import { CasesModule } from "./cases/cases.module";
import { AuditModule } from "./audit/audit.module";
import { RulesModule } from "./rules/rules.module";
import { AdaptersModule } from "./adapters/adapters.module";
import { ChannelsModule } from "./channels/channels.module";

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    RealtimeModule,
    OpsModule,
    WecomModule,
    AgentModule,
    CasesModule,
    AuditModule,
    RulesModule,
    AdaptersModule,
    ChannelsModule,
  ],
})
export class AppModule {}
