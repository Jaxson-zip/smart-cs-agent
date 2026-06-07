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
  ProviderWriteKillSwitchUpdateRequest,
  ProviderWriteRequest,
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

  it("lets admin operators list sanitized provider write execution attempts", async () => {
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
      listProviderWriteExecutionAttempts: (input: unknown) => {
        capturedInput = input;
        return [
          {
            id: "attempt_1",
            providerWriteRequestId: "write_1",
            operatorId: "admin_1",
            channel: "taobao",
            action: "issue_coupon",
            status: "blocked",
            networkExecution: "not_started",
            providerMutationExecuted: false,
            customerVisibleMessageSent: false,
            payloadEscrowStatus: "not_stored",
            payloadEscrowOpened: false,
            requestFingerprint: "abcdef123456",
            attemptFingerprint: "123456abcdef",
            policyReason: "execution_kill_switch_enabled",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:00.000Z",
          },
        ];
      },
    } as unknown as OpsService);

    const response = await controller.listProviderWriteExecutionAttempts(
      {
        limit: "10",
        status: "blocked",
        providerWriteRequestId: "write_1",
      },
      { authorization: "Bearer admin_key_123" },
    );

    assert.deepStrictEqual(capturedInput, {
      tenantId: "tenant_1",
      limit: 10,
      status: "blocked",
      providerWriteRequestId: "write_1",
    });
    assert.strictEqual(response[0].networkExecution, "not_started");
    assert.strictEqual("requestHash" in response[0], false);
  });

  it("rejects non-admin provider write execution attempt visibility", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "operator_key_123",
        tenantId: "tenant_1",
        operatorId: "operator_1",
        role: "operator",
      },
    ]);
    const controller = new OpsController({
      listProviderWriteExecutionAttempts: () => {
        throw new Error("must not list provider write execution attempts");
      },
    } as unknown as OpsService);

    await assert.rejects(
      () =>
        controller.listProviderWriteExecutionAttempts(
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

  it("lets admin operators read provider write live executor status", () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "admin_key_123",
        tenantId: "tenant_1",
        operatorId: "admin_1",
        role: "admin",
      },
    ]);
    let serviceCalled = false;
    const controller = new OpsController({
      getProviderWriteLiveExecutorStatus: () => {
        serviceCalled = true;
        return {
          liveExecutorEnabled: false,
          startupMode: "disabled",
          startupGuardSatisfied: false,
          dryRunRehearsalEvidenceConfigured: false,
          providerWriteApprovalEvidenceConfigured: false,
          executionKillSwitchEnabled: true,
          payloadEscrowMode: "disabled",
          reviewAdapterCount: 0,
          credentialRefCount: 0,
          missingStartupGates: [],
          networkExecution: "not_started",
          providerMutationExecuted: false,
          customerVisibleMessageSent: false,
          payloadEscrowOpened: false,
        };
      },
    } as unknown as OpsService);

    const response = controller.getProviderWriteLiveExecutorStatus({
      authorization: "Bearer admin_key_123",
    });

    assert.strictEqual(serviceCalled, true);
    assert.strictEqual(response.networkExecution, "not_started");
    assert.strictEqual("credentialRef" in response, false);
  });

  it("rejects non-admin provider write live executor status visibility", () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "operator_key_123",
        tenantId: "tenant_1",
        operatorId: "operator_1",
        role: "operator",
      },
    ]);
    const controller = new OpsController({
      getProviderWriteLiveExecutorStatus: () => {
        throw new Error("must not read live executor status");
      },
    } as unknown as OpsService);

    assert.throws(
      () =>
        controller.getProviderWriteLiveExecutorStatus({
          authorization: "Bearer operator_key_123",
        }),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.getStatus(), 403);
        return true;
      },
    );
  });

  it("rejects insecure header fallback for provider write live executor status visibility", () => {
    delete process.env.OPERATOR_API_KEYS;
    const controller = new OpsController({
      getProviderWriteLiveExecutorStatus: () => {
        throw new Error("must not read live executor status from insecure headers");
      },
    } as unknown as OpsService);

    assert.throws(
      () =>
        controller.getProviderWriteLiveExecutorStatus({
          "x-tenant-id": "tenant_1",
          "x-operator-id": "operator_1",
        }),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("lets admin operators read provider write kill switch status", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "admin_key_123",
        tenantId: "tenant_1",
        operatorId: "admin_1",
        role: "admin",
      },
    ]);
    let capturedTenantId = "";
    const controller = new OpsController({
      getProviderWriteKillSwitchStatus: async (tenantId: string) => {
        capturedTenantId = tenantId;
        return {
          envKillSwitchEnabled: true,
          emergencyStopEngaged: false,
          effectiveKillSwitchEnabled: true,
          source: "env",
          latestEvent: null,
          networkExecution: "not_started",
          providerMutationExecuted: false,
          customerVisibleMessageSent: false,
        };
      },
    } as unknown as OpsService);

    const response = await controller.getProviderWriteKillSwitchStatus({
      authorization: "Bearer admin_key_123",
    });

    assert.strictEqual(capturedTenantId, "tenant_1");
    assert.strictEqual(response.effectiveKillSwitchEnabled, true);
    assert.strictEqual(response.networkExecution, "not_started");
  });

  it("lets admin operators update provider write kill switch status with request context", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "admin_key_123",
        tenantId: "tenant_1",
        operatorId: "admin_1",
        role: "admin",
      },
    ]);
    let capturedRequest:
      | (ProviderWriteKillSwitchUpdateRequest & {
          tenantId: string;
          operatorId: string;
        })
      | undefined;
    const controller = new OpsController({
      updateProviderWriteKillSwitch: async (
        request: ProviderWriteKillSwitchUpdateRequest & {
          tenantId: string;
          operatorId: string;
        },
      ) => {
        capturedRequest = request;
        return {
          envKillSwitchEnabled: false,
          emergencyStopEngaged: true,
          effectiveKillSwitchEnabled: true,
          source: "emergency_stop",
          latestEvent: {
            action: request.action,
            reasonCode: request.reasonCode,
            operatorId: request.operatorId,
            stateFingerprint: "abcdef123456",
            createdAt: "2026-06-08T00:00:00.000Z",
          },
          networkExecution: "not_started",
          providerMutationExecuted: false,
          customerVisibleMessageSent: false,
        };
      },
    } as unknown as OpsService);

    const response = await controller.updateProviderWriteKillSwitch(
      { authorization: "Bearer admin_key_123" },
      {
        action: "engage",
        reasonCode: "incident_response",
        idempotencyKey: "ks_1234567890",
      },
    );

    assert.deepStrictEqual(capturedRequest, {
      tenantId: "tenant_1",
      operatorId: "admin_1",
      action: "engage",
      reasonCode: "incident_response",
      idempotencyKey: "ks_1234567890",
    });
    assert.strictEqual(response.emergencyStopEngaged, true);
    assert.strictEqual(response.networkExecution, "not_started");
  });

  it("rejects non-admin provider write kill switch visibility and updates", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "operator_key_123",
        tenantId: "tenant_1",
        operatorId: "operator_1",
        role: "operator",
      },
    ]);
    const controller = new OpsController({
      getProviderWriteKillSwitchStatus: async () => {
        throw new Error("must not read kill switch status");
      },
      updateProviderWriteKillSwitch: async () => {
        throw new Error("must not update kill switch status");
      },
    } as unknown as OpsService);

    assert.throws(
      () =>
        controller.getProviderWriteKillSwitchStatus({
          authorization: "Bearer operator_key_123",
        }),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.getStatus(), 403);
        return true;
      },
    );
    assert.throws(
      () =>
        controller.updateProviderWriteKillSwitch(
          { authorization: "Bearer operator_key_123" },
          {
            action: "engage",
            reasonCode: "incident_response",
            idempotencyKey: "ks_1234567890",
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.getStatus(), 403);
        return true;
      },
    );
  });

  it("rejects insecure header fallback for provider write kill switch operations", async () => {
    delete process.env.OPERATOR_API_KEYS;
    const controller = new OpsController({
      getProviderWriteKillSwitchStatus: async () => {
        throw new Error("must not read kill switch status from insecure headers");
      },
      updateProviderWriteKillSwitch: async () => {
        throw new Error("must not update kill switch status from insecure headers");
      },
    } as unknown as OpsService);

    assert.throws(
      () =>
        controller.getProviderWriteKillSwitchStatus({
          "x-tenant-id": "tenant_1",
          "x-operator-id": "operator_1",
        }),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
    assert.throws(
      () =>
        controller.updateProviderWriteKillSwitch(
          {
            "x-tenant-id": "tenant_1",
            "x-operator-id": "operator_1",
          },
          {
            action: "engage",
            reasonCode: "incident_response",
            idempotencyKey: "ks_1234567890",
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("uses request operator context for provider write requests", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "operator_key_123",
        tenantId: "demo_tenant",
        operatorId: "operator_from_context",
        role: "operator",
      },
    ]);
    let capturedRequest: ProviderWriteRequest | undefined;
    const controller = new OpsController({
      requestProviderWrite: (request: ProviderWriteRequest) => {
        capturedRequest = request;
        return {
          writeRequestId: "write_1",
          status: "approval_required",
          networkExecution: "not_started",
          providerMutationExecuted: false,
          customerVisibleMessageSent: false,
          operatorVisibleResult: "queued",
          requiresHuman: true,
          retryable: false,
        };
      },
    } as unknown as OpsService);

    await controller.requestProviderWrite(
      { authorization: "Bearer operator_key_123" },
      {
        caseId: "case_1",
        tenantId: "spoofed_tenant",
        channel: "taobao",
        action: "issue_coupon",
        payload: { orderId: "order_1", couponAmountCents: 2000 },
        idempotencyKey: "write_1",
        operatorId: "spoofed_operator",
      },
    );

    assert.strictEqual(capturedRequest?.tenantId, "demo_tenant");
    assert.strictEqual(capturedRequest?.operatorId, "operator_from_context");
  });

  it("rejects insecure header fallback for provider write requests", async () => {
    delete process.env.OPERATOR_API_KEYS;
    const controller = new OpsController({
      requestProviderWrite: () => {
        throw new Error("must not create provider write requests from insecure headers");
      },
    } as unknown as OpsService);

    assert.throws(
      () =>
        controller.requestProviderWrite(
          { "x-tenant-id": "tenant_1", "x-operator-id": "operator_1" },
          {
            caseId: "case_1",
            channel: "taobao",
            action: "issue_coupon",
            payload: { orderId: "order_1", couponAmountCents: 2000 },
            idempotencyKey: "write_1",
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("blocks viewer operators from creating provider write requests", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "viewer_key_123",
        tenantId: "tenant_1",
        operatorId: "viewer_1",
        role: "viewer",
      },
    ]);
    const controller = new OpsController({
      requestProviderWrite: () => {
        throw new Error("viewer must not create provider write requests");
      },
    } as unknown as OpsService);

    assert.throws(
      () =>
        controller.requestProviderWrite(
          { authorization: "Bearer viewer_key_123" },
          {
            caseId: "case_1",
            channel: "taobao",
            action: "issue_coupon",
            payload: { orderId: "order_1", couponAmountCents: 2000 },
            idempotencyKey: "write_1",
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.getStatus(), 403);
        return true;
      },
    );
  });

  it("uses request operator context for provider write approvals", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "admin_key_123",
        tenantId: "demo_tenant",
        operatorId: "admin_from_context",
        role: "admin",
      },
    ]);
    let capturedInput:
      | {
          tenantId: string;
          requestId: string;
          reviewerOperatorId: string;
          reasonCode: string;
        }
      | undefined;
    const controller = new OpsController({
      approveProviderWriteRequest: (input: typeof capturedInput) => {
        capturedInput = input;
        return {
          writeRequestId: input?.requestId ?? "",
          status: "approved",
          networkExecution: "not_started",
          providerMutationExecuted: false,
          customerVisibleMessageSent: false,
          operatorVisibleResult: "approved",
          requiresHuman: true,
          retryable: false,
        };
      },
    } as unknown as OpsService);

    await controller.approveProviderWriteRequest(
      "write_1",
      { authorization: "Bearer admin_key_123" },
      { reasonCode: "policy_verified" },
    );

    assert.deepStrictEqual(capturedInput, {
      tenantId: "demo_tenant",
      requestId: "write_1",
      reviewerOperatorId: "admin_from_context",
      reasonCode: "policy_verified",
    });
  });

  it("uses request operator context for provider write rejections", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "admin_key_123",
        tenantId: "demo_tenant",
        operatorId: "admin_from_context",
        role: "admin",
      },
    ]);
    let capturedInput:
      | {
          tenantId: string;
          requestId: string;
          reviewerOperatorId: string;
          reasonCode: string;
        }
      | undefined;
    const controller = new OpsController({
      rejectProviderWriteRequest: (input: typeof capturedInput) => {
        capturedInput = input;
        return {
          writeRequestId: input?.requestId ?? "",
          status: "rejected",
          networkExecution: "not_started",
          providerMutationExecuted: false,
          customerVisibleMessageSent: false,
          operatorVisibleResult: "rejected",
          requiresHuman: true,
          retryable: false,
        };
      },
    } as unknown as OpsService);

    await controller.rejectProviderWriteRequest(
      "write_1",
      { authorization: "Bearer admin_key_123" },
      { reasonCode: "insufficient_context" },
    );

    assert.deepStrictEqual(capturedInput, {
      tenantId: "demo_tenant",
      requestId: "write_1",
      reviewerOperatorId: "admin_from_context",
      reasonCode: "insufficient_context",
    });
  });

  it("rejects non-admin provider write approvals", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "operator_key_123",
        tenantId: "tenant_1",
        operatorId: "operator_1",
        role: "operator",
      },
    ]);
    const controller = new OpsController({
      approveProviderWriteRequest: () => {
        throw new Error("operator must not approve provider writes");
      },
    } as unknown as OpsService);

    assert.throws(
      () =>
        controller.approveProviderWriteRequest(
          "write_1",
          { authorization: "Bearer operator_key_123" },
          { reasonCode: "policy_verified" },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.getStatus(), 403);
        return true;
      },
    );
  });

  it("rejects insecure header fallback for provider write approvals", async () => {
    delete process.env.OPERATOR_API_KEYS;
    const controller = new OpsController({
      approveProviderWriteRequest: () => {
        throw new Error("must not approve provider writes from insecure headers");
      },
    } as unknown as OpsService);

    assert.throws(
      () =>
        controller.approveProviderWriteRequest(
          "write_1",
          { "x-tenant-id": "tenant_1", "x-operator-id": "admin_1" },
          { reasonCode: "policy_verified" },
        ),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("uses request operator context for provider write execution attempts", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "admin_key_123",
        tenantId: "demo_tenant",
        operatorId: "admin_from_context",
        role: "admin",
      },
    ]);
    let capturedInput:
      | {
          tenantId: string;
          requestId: string;
          operatorId: string;
          idempotencyKey: string;
        }
      | undefined;
    const controller = new OpsController({
      executeProviderWriteAttempt: (input: typeof capturedInput) => {
        capturedInput = input;
        return {
          attemptId: "attempt_1",
          writeRequestId: input?.requestId ?? "",
          status: "blocked",
          networkExecution: "not_started",
          providerMutationExecuted: false,
          customerVisibleMessageSent: false,
          payloadEscrowOpened: false,
          operatorVisibleResult: "blocked",
          requiresHuman: true,
          retryable: true,
        };
      },
    } as unknown as OpsService);

    await controller.executeProviderWriteAttempt(
      "write_1",
      { authorization: "Bearer admin_key_123" },
      { idempotencyKey: "execution_1" },
    );

    assert.deepStrictEqual(capturedInput, {
      tenantId: "demo_tenant",
      requestId: "write_1",
      operatorId: "admin_from_context",
      idempotencyKey: "execution_1",
    });
  });

  it("rejects non-admin provider write execution attempts", async () => {
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "operator_key_123",
        tenantId: "tenant_1",
        operatorId: "operator_1",
        role: "operator",
      },
    ]);
    const controller = new OpsController({
      executeProviderWriteAttempt: () => {
        throw new Error("operator must not execute provider write attempts");
      },
    } as unknown as OpsService);

    assert.throws(
      () =>
        controller.executeProviderWriteAttempt(
          "write_1",
          { authorization: "Bearer operator_key_123" },
          { idempotencyKey: "execution_1" },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.getStatus(), 403);
        return true;
      },
    );
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
