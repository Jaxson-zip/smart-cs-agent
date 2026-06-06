import { Module } from "@nestjs/common";
import { AdaptersModule } from "../adapters/adapters.module";
import { OpsController } from "./ops.controller";
import { OpsService } from "./ops.service";

@Module({
  imports: [AdaptersModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
