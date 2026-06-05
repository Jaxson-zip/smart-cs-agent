import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import type { HealthReadinessResponse, HealthResponse } from "@smart-cs-agent/shared";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "smart-cs-agent-api",
      timestamp: new Date().toISOString(),
    };
  }
}

@Controller("health")
export class HealthReadinessController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("ready")
  async getReadiness(): Promise<HealthReadinessResponse> {
    const timestamp = new Date().toISOString();

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: "ok",
        service: "smart-cs-agent-api",
        timestamp,
        checks: {
          database: {
            status: "ok",
          },
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "unhealthy",
        service: "smart-cs-agent-api",
        timestamp,
        checks: {
          database: {
            status: "unhealthy",
            message: "Database readiness check failed",
          },
        },
      });
    }
  }
}
