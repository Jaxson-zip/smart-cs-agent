import { Module } from "@nestjs/common";
import { WecomController } from "./wecom.controller";
import { WecomSandboxProvider } from "./wecom-sandbox.provider";

@Module({
  controllers: [WecomController],
  providers: [WecomSandboxProvider],
  exports: [WecomSandboxProvider],
})
export class WecomModule {}
