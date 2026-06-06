import assert from "node:assert";
import { describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import type {
  ExecuteActionRequest,
  IntegrationStatus,
} from "@smart-cs-agent/shared";
import { OpsController } from "./ops.controller";
import type { OpsService } from "./ops.service";

describe("OpsController", () => {
  it("requires operator context before listing integrations", () => {
    const controller = new OpsController({
      listIntegrations: () => [],
    } as unknown as OpsService);

    assert.throws(
      () => controller.listIntegrations({}),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("uses request operator context for action execution", () => {
    let capturedRequest: ExecuteActionRequest | undefined;
    const controller = new OpsController({
      executeAction: (request: ExecuteActionRequest) => {
        capturedRequest = request;
        return {
          actionRunId: "run_1",
          status: "queued",
          customerVisibleResult: "queued",
          requiresHuman: false,
          retryable: true,
        };
      },
    } as unknown as OpsService);

    controller.executeAction(
      {
        "x-tenant-id": "demo_tenant",
        "x-operator-id": "operator_from_context",
      },
      {
        caseId: "case_1",
        channel: "taobao",
        action: "issue_coupon",
        idempotencyKey: "idem_1",
        payload: {},
        operatorId: "spoofed_operator",
      },
    );

    assert.strictEqual(capturedRequest?.operatorId, "operator_from_context");
  });

  it("allows integration reads when operator context is present", () => {
    let capturedTenantId: string | undefined;
    const integrations: IntegrationStatus[] = [
      {
        channel: "taobao",
        connected: true,
        capabilities: ["issue_coupon"],
        readCapabilities: ["get_order"],
        health: "normal",
        adapterMode: "sandbox_mock",
        writePolicy: "sandbox_only",
        customerVisibleActionsEnabled: false,
        realCommerceActionsEnabled: false,
        contractVersion: "provider-adapter-contract-v1",
        safetyNotes: ["test contract"],
      },
    ];
    const controller = new OpsController({
      listIntegrations: (tenantId: string) => {
        capturedTenantId = tenantId;
        return integrations;
      },
    } as unknown as OpsService);

    assert.deepStrictEqual(
      controller.listIntegrations({ "x-tenant-id": "demo_tenant" }),
      integrations,
    );
    assert.strictEqual(capturedTenantId, "demo_tenant");
  });
});
