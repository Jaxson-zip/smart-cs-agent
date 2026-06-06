import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  CommerceActionSchema,
  type CommerceChannel,
  type ExecuteActionRequest,
} from "@smart-cs-agent/shared";
import { ProviderAdapterRegistry } from "../adapters/provider-adapter-registry.service";
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
});
