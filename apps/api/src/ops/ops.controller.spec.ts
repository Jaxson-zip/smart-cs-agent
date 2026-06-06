import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
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
  const originalOperatorApiKeys = process.env.OPERATOR_API_KEYS;

  afterEach(() => {
    if (originalProviderReadonlyAdapters === undefined) {
      delete process.env.PROVIDER_READONLY_ADAPTERS;
    } else {
      process.env.PROVIDER_READONLY_ADAPTERS = originalProviderReadonlyAdapters;
    }
    if (originalOperatorApiKeys === undefined) {
      delete process.env.OPERATOR_API_KEYS;
    } else {
      process.env.OPERATOR_API_KEYS = originalOperatorApiKeys;
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

  it("lets admin operators list sanitized provider read runs", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "admin_key_123",
        tenantId: "tenant_1",
        operatorId: "admin_1",
        role: "admin",
      },
    ]);
    let capturedInput: unknown;
    const controller = new OpsController({
      listProviderReadRuns: (input: unknown) => {
        capturedInput = input;
        return [
          {
            id: "provider_read_run_1",
            caseId: "case_1",
            channel: "taobao",
            readCapability: "get_order",
            status: "blocked",
            networkExecution: "not_started",
            providerDataReturned: false,
            lookupKeys: { hasOrderId: true, hasLogisticsId: false },
            lookupFingerprint: "abcdef123456",
            requestFingerprint: "123456abcdef",
            policyReason: "blocked",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:00.000Z",
          },
        ];
      },
    } as unknown as OpsService);

    const response = await controller.listProviderReadRuns(
      { limit: "10", status: "blocked" },
      { authorization: "Bearer admin_key_123" },
    );

    assert.deepStrictEqual(capturedInput, {
      tenantId: "tenant_1",
      limit: 10,
      status: "blocked",
    });
    assert.strictEqual(response[0].providerDataReturned, false);
    assert.strictEqual("lookupHash" in response[0], false);
  });

  it("rejects non-admin provider read operation visibility", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "operator_key_123",
        tenantId: "tenant_1",
        operatorId: "operator_1",
        role: "operator",
      },
    ]);
    const controller = new OpsController({
      listProviderReadRuns: () => {
        throw new Error("must not list provider read runs");
      },
    } as unknown as OpsService);

    await assert.rejects(
      () =>
        controller.listProviderReadRuns(
          {},
          { authorization: "Bearer operator_key_123" },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.getStatus(), 403);
        return true;
      },
    );
  });

  it("rejects insecure header fallback for provider read operation visibility", async () => {
    delete process.env.OPERATOR_API_KEYS;
    const controller = new OpsController({
      listProviderReadRuns: () => {
        throw new Error("must not list provider read runs from insecure headers");
      },
    } as unknown as OpsService);

    await assert.rejects(
      () =>
        controller.listProviderReadRuns(
          {},
          { "x-tenant-id": "tenant_1", "x-operator-id": "operator_1" },
        ),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("rejects invalid provider read summary windows", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "admin_key_123",
        tenantId: "tenant_1",
        operatorId: "admin_1",
        role: "admin",
      },
    ]);
    const controller = new OpsController({
      getProviderReadSummary: () => {
        throw new Error("must not summarize invalid windows");
      },
    } as unknown as OpsService);

    await assert.rejects(
      () =>
        controller.providerReadSummary(
          {
            from: "2026-06-06T00:00:00.000Z",
            to: "2026-06-08T00:00:00.000Z",
          },
          { authorization: "Bearer admin_key_123" },
        ),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.strictEqual(error.getStatus(), 400);
        return true;
      },
    );
  });

  it("lets admin operators read provider read summaries", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "admin_key_123",
        tenantId: "tenant_1",
        operatorId: "admin_1",
        role: "admin",
      },
    ]);
    let capturedInput: {
      tenantId: string;
      from?: Date;
      to?: Date;
    } | undefined;
    const controller = new OpsController({
      getProviderReadSummary: (input: typeof capturedInput) => {
        capturedInput = input;
        return {
          measuredAt: "2026-06-06T08:00:00.000Z",
          window: {
            from: input?.from?.toISOString(),
            to: input?.to?.toISOString(),
          },
          totals: {
            totalCount: 1,
            policyAcceptedCount: 1,
            blockedCount: 0,
            failedCount: 0,
          },
          byChannel: [{ key: "taobao", count: 1 }],
          byCapability: [{ key: "get_order", count: 1 }],
          latestCreatedAt: "2026-06-06T07:30:00.000Z",
        };
      },
    } as unknown as OpsService);

    const response = await controller.providerReadSummary(
      {
        from: "2026-06-06T07:00:00.000Z",
        to: "2026-06-06T08:00:00.000Z",
      },
      { authorization: "Bearer admin_key_123" },
    );

    assert.strictEqual(capturedInput?.tenantId, "tenant_1");
    assert.strictEqual(
      capturedInput?.from?.toISOString(),
      "2026-06-06T07:00:00.000Z",
    );
    assert.strictEqual(response.totals.totalCount, 1);
  });

  it("uses request operator context for provider read execution", async () => {
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

    await controller.executeProviderRead(
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

  it("blocks provider read body tenant spoofing through the real service", async () => {
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

    const response = await controller.executeProviderRead(
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
