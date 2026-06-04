import { Module } from "@nestjs/common";
import { AgentService } from "./agent.service";
import { ClassifierService } from "./classifier.service";
import { RiskModule } from "../risk/risk.module";
import { ActionModule } from "../actions/action.module";

@Module({
  imports: [RiskModule, ActionModule],
  providers: [AgentService, ClassifierService],
  exports: [AgentService],
})
export class AgentModule {}
