import { Module } from "@nestjs/common";
import { WecomController } from "./wecom.controller";
import { WecomSandboxProvider } from "./wecom-sandbox.provider";
import { AgentModule } from "../agent/agent.module";
import { ActionModule } from "../actions/action.module";

@Module({
  imports: [AgentModule, ActionModule],
  controllers: [WecomController],
  providers: [WecomSandboxProvider],
  exports: [WecomSandboxProvider],
})
export class WecomModule {}
