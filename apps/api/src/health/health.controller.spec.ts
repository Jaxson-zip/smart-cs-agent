import { ServiceUnavailableException } from "@nestjs/common";
import assert from "node:assert";
import { describe, it } from "node:test";
import { PrismaService } from "../prisma/prisma.service";
import { HealthController, HealthReadinessController } from "./health.controller";

describe("HealthController", () => {
  it("keeps liveness lightweight", () => {
    const controller = new HealthController();

    const response = controller.getHealth();

    assert.strictEqual(response.status, "ok");
    assert.strictEqual(response.service, "smart-cs-agent-api");
  });

  it("reports readiness when the database responds", async () => {
    let queryCount = 0;
    const prisma = {
      $queryRaw: async () => {
        queryCount += 1;
        return [{ "?column?": 1 }];
      },
    } as unknown as PrismaService;
    const controller = new HealthReadinessController(prisma);

    const response = await controller.getReadiness();

    assert.strictEqual(queryCount, 1);
    assert.strictEqual(response.status, "ok");
    assert.deepStrictEqual(response.checks.database, { status: "ok" });
  });

  it("returns a 503 readiness failure when the database is unavailable", async () => {
    const prisma = {
      $queryRaw: async () => {
        throw new Error("connection refused");
      },
    } as unknown as PrismaService;
    const controller = new HealthReadinessController(prisma);

    await assert.rejects(
      () => controller.getReadiness(),
      (error: unknown) => {
        assert.ok(error instanceof ServiceUnavailableException);
        assert.strictEqual(error.getStatus(), 503);
        const response = error.getResponse() as {
          status: string;
          service: string;
          timestamp: string;
          checks: {
            database: {
              status: string;
              message: string;
            };
          };
        };
        assert.match(response.timestamp, /^\d{4}-\d{2}-\d{2}T/);
        assert.deepStrictEqual(response, {
          status: "unhealthy",
          service: "smart-cs-agent-api",
          timestamp: response.timestamp,
          checks: {
            database: {
              status: "unhealthy",
              message: "Database readiness check failed",
            },
          },
        });
        return true;
      },
    );
  });
});
