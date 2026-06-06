import { Module } from "@nestjs/common";
import { AdaptersModule } from "../adapters/adapters.module";
import { AuditModule } from "../audit/audit.module";
import { PrismaModule } from "../prisma/prisma.module";
import { OpsController } from "./ops.controller";
import { OpsService } from "./ops.service";

@Module({
  imports: [AdaptersModule, PrismaModule, AuditModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
