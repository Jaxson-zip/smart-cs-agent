import assert from "node:assert";
import { describe, it } from "node:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { RulesController } from "./rules.controller";
import { RulesService } from "./rules.service";

describe("RulesController", () => {
  it("requires tenant context before reading rules", async () => {
    const controller = new RulesController({} as RulesService);

    await assert.rejects(
      () => controller.getRules({}, "demo_tenant"),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("blocks access to a different tenant ruleset", async () => {
    const controller = new RulesController({} as RulesService);

    await assert.rejects(
      () => controller.getRules({ "x-tenant-id": "tenant_a" }, "tenant_b"),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.getStatus(), 403);
        return true;
      },
    );
  });

  it("uses the request tenant when the path tenant is omitted", async () => {
    let tenantId = "";
    const controller = new RulesController({
      getRules: async (inputTenantId: string) => {
        tenantId = inputTenantId;
        return {
          couponCompensationLimit: 50,
          highRiskKeywords: [],
          channelCapabilities: {},
        };
      },
    } as unknown as RulesService);

    await controller.getRules({ "x-tenant-id": "demo_tenant" });

    assert.strictEqual(tenantId, "demo_tenant");
  });
});
