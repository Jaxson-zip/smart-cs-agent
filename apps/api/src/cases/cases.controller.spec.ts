import assert from "node:assert";
import { describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { CasesController } from "./cases.controller";
import { CasesService } from "./cases.service";

describe("CasesController", () => {
  it("requires tenant context before listing cases", async () => {
    const controller = new CasesController({} as CasesService);

    await assert.rejects(
      () => controller.getCases({}),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("passes tenant context into the cases service", async () => {
    let tenantId = "";
    const controller = new CasesController({
      findAll: async (inputTenantId: string) => {
        tenantId = inputTenantId;
        return [];
      },
    } as unknown as CasesService);

    await controller.getCases({
      "x-tenant-id": "demo_tenant",
      "x-operator-id": "operator_1",
    });

    assert.strictEqual(tenantId, "demo_tenant");
  });
});
