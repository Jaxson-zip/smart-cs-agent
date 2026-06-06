import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import type {
  ExecuteActionRequest,
  IntegrationStatus,
  ProviderReadRequest,
} from "@smart-cs-agent/shared";
import { ProviderAdapterRegistry } from "../adapters/provider-adapter-registry.service";
import { OpsController } from "./ops.controller";
import { OpsService } from "./ops.service";

describe("OpsController", () => {
  const originalProviderReadonlyAdapters = process.env.PROVIDER_READONLY_ADAPTERS;

  afterEach(() => {
    if (originalProviderReadonlyAdapters === undefined) {
      delete process.env.PROVIDER_READONLY_ADAPTERS;
    } else {
      process.env.PROVIDER_READONLY_ADAPTERS = originalProviderReadonlyAdapters;
    }
  });

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

  it("uses request operator context for provider read execution", () => {
    let capturedRequest: ProviderReadRequest | undefined;
    const controller = new OpsController({
      executeProviderRead: (request: ProviderReadRequest) => {
        capturedRequest = request;
        return {
          readRunId: "read_1",
          status: "policy_accepted",
          networkExecution: "not_implemented",
          providerDataReturned: false,
          operatorVisibleResult: "accepted",
          requiresHuman: false,
          retryable: false,
        };
      },
    } as unknown as OpsService);

    controller.executeProviderRead(
      {
        "x-tenant-id": "demo_tenant",
        "x-operator-id": "operator_from_context",
      },
      {
        caseId: "case_1",
        tenantId: "spoofed_tenant",
        channel: "taobao",
        readCapability: "get_order",
        lookup: { orderId: "order_1" },
        idempotencyKey: "read_1",
        operatorId: "spoofed_operator",
      },
    );

    assert.strictEqual(capturedRequest?.tenantId, "demo_tenant");
    assert.strictEqual(capturedRequest?.operatorId, "operator_from_context");
  });

  it("requires operator context before executing provider reads", () => {
    const controller = new OpsController({
      executeProviderRead: () => {
        throw new Error("must not execute without context");
      },
    } as unknown as OpsService);

    assert.throws(
      () =>
        controller.executeProviderRead(
          {},
          {
            caseId: "case_1",
            channel: "taobao",
            readCapability: "get_order",
            lookup: { orderId: "order_1" },
            idempotencyKey: "read_1",
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("blocks provider read body tenant spoofing through the real service", () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const controller = new OpsController(
      new OpsService(new ProviderAdapterRegistry()),
    );

    const response = controller.executeProviderRead(
      {
        "x-tenant-id": "tenant_2",
        "x-operator-id": "operator_2",
      },
      {
        caseId: "case_1",
        tenantId: "tenant_1",
        channel: "taobao",
        readCapability: "get_order",
        lookup: { orderId: "order_1" },
        idempotencyKey: "read_1",
        operatorId: "operator_1",
      },
    );

    assert.strictEqual(response.status, "blocked");
    assert.strictEqual(response.networkExecution, "not_started");
    assert.strictEqual(response.providerDataReturned, false);
    assert.match(response.operatorVisibleResult, /readonly credentials/i);
  });
});
