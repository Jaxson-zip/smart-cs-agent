import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@smart-cs-agent/shared";

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
