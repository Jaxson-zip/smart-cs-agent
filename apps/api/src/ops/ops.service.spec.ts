import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  CommerceActionSchema,
  ProviderReadRequestSchema,
  ProviderReadResponseSchema,
  type CommerceChannel,
  type ExecuteActionRequest,
  type ProviderReadRequest,
} from "@smart-cs-agent/shared";
import type { ProviderAdapterContract } from "../adapters/adapters.interface";
import { ProviderAdapterRegistry } from "../adapters/provider-adapter-registry.service";
import { MockTaobaoAdapter } from "../adapters/mock-taobao.adapter";
import { OpsService } from "./ops.service";

describe("OpsService provider adapter contract", () => {
  const originalProviderReadonlyAdapters = process.env.PROVIDER_READONLY_ADAPTERS;

  afterEach(() => {
    if (originalProviderReadonlyAdapters === undefined) {
      delete process.env.PROVIDER_READONLY_ADAPTERS;
    } else {
      process.env.PROVIDER_READONLY_ADAPTERS = originalProviderReadonlyAdapters;
    }
  });

  it("lists commerce integrations from provider adapter contracts without enabling real writes", () => {
    const service = new OpsService(new ProviderAdapterRegistry());

    const integrations = service.listIntegrations("demo_tenant");
    const taobao = integrations.find((item) => item.channel === "taobao");
    const douyin = integrations.find((item) => item.channel === "douyin");

    assert.ok(taobao);
    assert.ok(douyin);
    assert.strictEqual(taobao.adapterMode, "sandbox_mock");
    assert.strictEqual(douyin.adapterMode, "sandbox_mock");
    assert.strictEqual(taobao.customerVisibleActionsEnabled, false);
    assert.strictEqual(douyin.customerVisibleActionsEnabled, false);
    assert.strictEqual(taobao.realCommerceActionsEnabled, false);
    assert.strictEqual(douyin.realCommerceActionsEnabled, false);
    assert.strictEqual(taobao.writePolicy, "sandbox_only");
    assert.strictEqual(douyin.writePolicy, "sandbox_only");
    assert.ok(!taobao.capabilities.includes("refund"));
    assert.ok(!douyin.capabilities.includes("refund"));
  });

  it("projects configured real provider adapters as readonly without enabling writes", () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const service = new OpsService(new ProviderAdapterRegistry());

    const taobao = service
      .listIntegrations("tenant_1")
      .find((item) => item.channel === "taobao");
    const writeAttempt = service.executeAction({
      caseId: "case_1",
      channel: "taobao",
      action: "issue_coupon",
      idempotencyKey: "idem_readonly_1",
      payload: {},
      operatorId: "operator_1",
      tenantId: "tenant_1",
    });

    assert.ok(taobao);
    assert.strictEqual(taobao.adapterMode, "real_readonly");
    assert.strictEqual(taobao.writePolicy, "read_only");
    assert.deepStrictEqual(taobao.capabilities, ["handoff"]);
    assert.deepStrictEqual(taobao.readCapabilities, [
      "get_order",
      "query_logistics",
    ]);
    assert.strictEqual(taobao.customerVisibleActionsEnabled, false);
    assert.strictEqual(taobao.realCommerceActionsEnabled, false);
    assert.strictEqual(writeAttempt.status, "blocked");
    assert.match(writeAttempt.customerVisibleResult, /provider write policy/i);
  });

  it("does not leak readonly provider projection across tenants", () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const service = new OpsService(new ProviderAdapterRegistry());

    const tenantTwoTaobao = service
      .listIntegrations("tenant_2")
      .find((item) => item.channel === "taobao");

    assert.ok(tenantTwoTaobao);
    assert.strictEqual(tenantTwoTaobao.adapterMode, "sandbox_mock");
    assert.strictEqual(tenantTwoTaobao.writePolicy, "sandbox_only");
  });

  it("blocks commerce write actions until a real provider write policy exists", () => {
    const service = new OpsService(new ProviderAdapterRegistry());
    const request: ExecuteActionRequest = {
      caseId: "case_1",
      channel: "taobao",
      action: "issue_coupon",
      idempotencyKey: "idem_1",
      payload: { amount: 20 },
      operatorId: "operator_1",
      tenantId: "demo_tenant",
    };

    const response = service.executeAction(request);

    assert.strictEqual(response.status, "blocked");
    assert.strictEqual(response.requiresHuman, true);
    assert.strictEqual(response.retryable, false);
    assert.match(response.customerVisibleResult, /provider write policy/i);
  });

  it("blocks every non-handoff commerce action for sandbox Taobao and Douyin", () => {
    const service = new OpsService(new ProviderAdapterRegistry());
    const channels: CommerceChannel[] = ["taobao", "douyin"];
    const actions = CommerceActionSchema.options.filter(
      (action) => action !== "handoff",
    );

    for (const channel of channels) {
      for (const action of actions) {
        const response = service.executeAction({
          caseId: `case_${channel}_${action}`,
          channel,
          action,
          idempotencyKey: `idem_${channel}_${action}`,
          payload: {},
          operatorId: "operator_1",
          tenantId: "demo_tenant",
        });

        assert.strictEqual(response.status, "blocked", `${channel}:${action}`);
        assert.strictEqual(response.requiresHuman, true, `${channel}:${action}`);
        assert.strictEqual(response.retryable, false, `${channel}:${action}`);
      }
    }
  });

  it("keeps non-commerce handoff actions queueable", () => {
    const service = new OpsService(new ProviderAdapterRegistry());

    const response = service.executeAction({
      caseId: "case_1",
      channel: "taobao",
      action: "handoff",
      idempotencyKey: "idem_2",
      payload: {},
      operatorId: "operator_1",
      tenantId: "demo_tenant",
    });

    assert.strictEqual(response.status, "queued");
    assert.strictEqual(response.requiresHuman, false);
    assert.strictEqual(response.retryable, true);
  });

  it("blocks provider reads unless real readonly credentials are configured", () => {
    const service = new OpsService(new ProviderAdapterRegistry());
    const request: ProviderReadRequest = {
      caseId: "case_1",
      tenantId: "demo_tenant",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_1",
      operatorId: "operator_1",
    };

    const response = service.executeProviderRead(request);

    assert.strictEqual(response.status, "blocked");
    assert.strictEqual(response.networkExecution, "not_started");
    assert.strictEqual(response.providerDataReturned, false);
    assert.strictEqual(response.requiresHuman, true);
    assert.strictEqual(response.retryable, false);
    assert.match(response.operatorVisibleResult, /readonly credentials/i);
  });

  it("accepts readonly provider reads by policy without returning provider data", () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const service = new OpsService(new ProviderAdapterRegistry());

    const response = service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "query_logistics",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_2",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "policy_accepted");
    assert.strictEqual(response.networkExecution, "not_implemented");
    assert.strictEqual(response.providerDataReturned, false);
    assert.strictEqual(response.requiresHuman, false);
    assert.strictEqual(response.retryable, false);
    assert.match(response.operatorVisibleResult, /not implemented/i);
  });

  it("does not allow provider reads through another tenant's readonly projection", () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const service = new OpsService(new ProviderAdapterRegistry());

    const response = service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_2",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_3",
      operatorId: "operator_2",
    });

    assert.strictEqual(response.status, "blocked");
    assert.strictEqual(response.networkExecution, "not_started");
    assert.strictEqual(response.providerDataReturned, false);
    assert.match(response.operatorVisibleResult, /readonly credentials/i);
  });

  it("does not call provider adapters when a readonly read is policy accepted", () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const adapter = new PoisonTaobaoAdapter();
    const service = new OpsService(new ProviderAdapterRegistry(adapter));

    const response = service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_4",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "policy_accepted");
    assert.strictEqual(response.networkExecution, "not_implemented");
    assert.strictEqual(response.providerDataReturned, false);
    assert.strictEqual(adapter.readCallCount, 0);
  });

  it("blocks unsupported readonly capabilities even when an adapter is read-only", () => {
    const service = new OpsService(
      new ProviderAdapterRegistry(readonlyTaobaoContract(["get_order"])),
    );

    const response = service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "query_logistics",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_5",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "blocked");
    assert.strictEqual(response.networkExecution, "not_started");
    assert.strictEqual(response.providerDataReturned, false);
    assert.match(response.operatorVisibleResult, /does not expose/i);
  });

  it("keeps provider read responses exact and free of provider payload fields", () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const service = new OpsService(new ProviderAdapterRegistry());

    const response = service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_6",
      operatorId: "operator_1",
    });

    assert.deepStrictEqual(Object.keys(response).sort(), [
      "networkExecution",
      "operatorVisibleResult",
      "providerDataReturned",
      "readRunId",
      "requiresHuman",
      "retryable",
      "status",
    ]);
    assert.strictEqual("providerPayload" in response, false);
    assert.strictEqual("rawProvider" in response, false);
    assert.strictEqual("order" in response, false);
    assert.strictEqual("logistics" in response, false);
    assert.strictEqual("customer" in response, false);
  });

  it("rejects unsafe provider read request and response shapes", () => {
    assert.throws(() =>
      ProviderReadRequestSchema.parse({
        caseId: "case_1",
        channel: "taobao",
        readCapability: "get_order",
        lookup: {},
        idempotencyKey: "read_7",
      }),
    );
    assert.throws(() =>
      ProviderReadRequestSchema.parse({
        caseId: "case_1",
        channel: "taobao",
        readCapability: "get_order",
        lookup: { customerExternalId: "customer_1" },
        idempotencyKey: "read_8",
      }),
    );
    assert.throws(() =>
      ProviderReadRequestSchema.parse({
        caseId: "case_1",
        channel: "taobao",
        readCapability: "refund",
        lookup: { orderId: "order_1" },
        idempotencyKey: "read_9",
      }),
    );
    assert.throws(() =>
      ProviderReadResponseSchema.parse({
        readRunId: "read_1",
        status: "policy_accepted",
        networkExecution: "not_implemented",
        providerDataReturned: true,
        operatorVisibleResult: "unsafe",
        requiresHuman: false,
        retryable: false,
      }),
    );
    assert.throws(() =>
      ProviderReadResponseSchema.parse({
        readRunId: "read_1",
        status: "policy_accepted",
        networkExecution: "not_implemented",
        providerDataReturned: false,
        operatorVisibleResult: "unsafe",
        requiresHuman: false,
        retryable: false,
        providerPayload: { id: "raw" },
      }),
    );
  });
});

class PoisonTaobaoAdapter extends MockTaobaoAdapter {
  readCallCount = 0;

  override async getOrder(_orderId: string): Promise<null> {
    this.readCallCount += 1;
    throw new Error("provider getOrder must not be called");
  }

  override async queryLogistics(
    _orderId: string,
  ): Promise<{ status: string; detail: string } | null> {
    this.readCallCount += 1;
    throw new Error("provider queryLogistics must not be called");
  }
}

function readonlyTaobaoContract(
  readCapabilities: ProviderAdapterContract["readCapabilities"],
) {
  return {
    channel: "taobao",
    mode: "real_readonly",
    writePolicy: "read_only",
    connected: true,
    health: "normal",
    capabilities: ["handoff"],
    readCapabilities,
    customerVisibleActionsEnabled: false,
    realCommerceActionsEnabled: false,
    contractVersion: "provider-adapter-contract-v1",
    safetyNotes: ["test readonly contract"],
    async getOrder() {
      throw new Error("provider getOrder must not be called");
    },
    async changeAddress() {
      throw new Error("provider changeAddress must not be called");
    },
    async issueCoupon() {
      throw new Error("provider issueCoupon must not be called");
    },
    async queryLogistics() {
      throw new Error("provider queryLogistics must not be called");
    },
    async sendMessage() {
      throw new Error("provider sendMessage must not be called");
    },
  } as unknown as MockTaobaoAdapter;
}
