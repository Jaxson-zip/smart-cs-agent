import assert from "node:assert";
import { createHash } from "node:crypto";
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
import { ProviderCredentialResolverService } from "../adapters/provider-credential-resolver.service";
import { ProviderCredentialStoreService } from "../adapters/provider-credential-store.service";
import { MockTaobaoAdapter } from "../adapters/mock-taobao.adapter";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
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

  it("keeps readonly credential refs scoped to exact tenant and channel", () => {
    const credentialRef =
      "secret://smartcs/taobao/tenant_1/credential_ref_must_not_leak";
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef,
      },
    ]);
    const registry = new ProviderAdapterRegistry();

    assert.strictEqual(
      registry.getReadonlyCredentialRef("taobao", "tenant_1"),
      credentialRef,
    );
    assert.strictEqual(
      registry.getReadonlyCredentialRef("taobao", "tenant_2"),
      undefined,
    );
    assert.strictEqual(
      registry.getReadonlyCredentialRef("douyin", "tenant_1"),
      undefined,
    );
    assert.strictEqual(
      JSON.stringify(registry.listIntegrations("tenant_1")).includes(
        "credential_ref_must_not_leak",
      ),
      false,
    );
    assert.strictEqual(
      JSON.stringify(registry.listIntegrations("tenant_1")).includes("secret://"),
      false,
    );
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

  it("blocks provider reads unless real readonly credentials are configured", async () => {
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

    const response = await service.executeProviderRead(request);

    assert.strictEqual(response.status, "blocked");
    assert.strictEqual(response.networkExecution, "not_started");
    assert.strictEqual(response.providerDataReturned, false);
    assert.strictEqual(response.requiresHuman, true);
    assert.strictEqual(response.retryable, false);
    assert.match(response.operatorVisibleResult, /readonly credentials/i);
  });

  it("accepts readonly provider reads by policy without returning provider data", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const service = new OpsService(new ProviderAdapterRegistry());

    const response = await service.executeProviderRead({
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

  it("does not allow provider reads through another tenant's readonly projection", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const service = new OpsService(new ProviderAdapterRegistry());

    const response = await service.executeProviderRead({
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

  it("does not call provider adapters when a readonly read is policy accepted", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const adapter = new PoisonTaobaoAdapter();
    const service = new OpsService(new ProviderAdapterRegistry(adapter));

    const response = await service.executeProviderRead({
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

  it("blocks unsupported readonly capabilities even when an adapter is read-only", async () => {
    const service = new OpsService(
      new ProviderAdapterRegistry(readonlyTaobaoContract(["get_order"])),
    );

    const response = await service.executeProviderRead({
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

  it("keeps provider read responses exact and free of provider payload fields", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const service = new OpsService(new ProviderAdapterRegistry());

    const response = await service.executeProviderRead({
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

  it("persists provider read runs and sanitized audit records", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const persistence = createProviderReadPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const response = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_10",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "policy_accepted");
    assert.strictEqual(persistence.runs.length, 1);
    assert.strictEqual(persistence.runs[0].id, response.readRunId);
    assert.strictEqual(persistence.runs[0].tenantId, "tenant_1");
    assert.strictEqual(persistence.runs[0].operatorId, "operator_1");
    assert.strictEqual(persistence.runs[0].caseId, "case_1");
    assert.strictEqual(persistence.runs[0].channel, "taobao");
    assert.strictEqual(persistence.runs[0].readCapability, "get_order");
    assert.strictEqual(persistence.runs[0].status, "policy_accepted");
    assert.strictEqual(persistence.runs[0].networkExecution, "not_implemented");
    assert.strictEqual(persistence.runs[0].providerDataReturned, false);
    assert.deepStrictEqual(persistence.runs[0].lookupKeys, {
      hasOrderId: true,
      hasLogisticsId: false,
    });
    assert.match(persistence.runs[0].lookupHash, /^[a-f0-9]{64}$/);
    assert.match(persistence.runs[0].requestHash, /^[a-f0-9]{64}$/);
    assert.strictEqual(JSON.stringify(persistence.runs[0]).includes("order_1"), false);

    assert.strictEqual(persistence.auditEntries.length, 1);
    assert.strictEqual(persistence.auditEntries[0].caseId, "case_1");
    assert.strictEqual(persistence.auditEntries[0].action, "provider_read.policy_accepted");
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries[0]).includes("order_1"),
      false,
    );
  });

  it("passes readonly credential references through a no-secret resolver without leaking them", async () => {
    const credentialRef =
      "secret://smartcs/taobao/tenant_1/credential_ref_must_not_leak";
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef,
      },
    ]);
    const persistence = createProviderReadPersistence();
    const credentialResolver = new RecordingCredentialResolver();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
      credentialResolver as unknown as ProviderCredentialResolverService,
    );

    const response = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_credential_boundary",
      operatorId: "operator_1",
    });

    assert.deepStrictEqual(credentialResolver.calls, [
      {
        tenantId: "tenant_1",
        channel: "taobao",
        credentialRef,
      },
    ]);
    assert.strictEqual(response.status, "policy_accepted");
    assert.strictEqual(response.networkExecution, "not_implemented");
    assert.strictEqual(response.providerDataReturned, false);
    const serializedEvidence = JSON.stringify({
      response,
      runs: persistence.runs,
      auditEntries: persistence.auditEntries,
    });
    assert.strictEqual(
      serializedEvidence.includes("credential_ref_must_not_leak"),
      false,
    );
    assert.strictEqual(serializedEvidence.includes("secret://"), false);
    assert.strictEqual(serializedEvidence.includes("actual_provider_token"), false);
    assert.strictEqual(
      serializedEvidence.includes("credential_ref_fingerprint_123"),
      true,
    );
  });

  it("audits configured credential refs without leaking tokens or full refs", async () => {
    const credentialRef =
      "secret://smartcs/taobao/tenant_1/credential_ref_must_not_leak";
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef,
      },
    ]);
    const persistence = createProviderReadPersistence();
    const credentialResolver = new ProviderCredentialResolverService(
      new ProviderCredentialStoreService({
        PROVIDER_CREDENTIALS: JSON.stringify([
          {
            credentialRef,
          },
        ]),
      }),
    );
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
      credentialResolver,
    );

    const response = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_credential_store" },
      idempotencyKey: "read_credential_store_configured",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "policy_accepted");
    assert.strictEqual(response.networkExecution, "not_implemented");
    assert.strictEqual(response.providerDataReturned, false);
    assert.strictEqual(persistence.runs.length, 1);
    const auditDetails = persistence.auditEntries[0].details as {
      credentialResolution?: {
        credentialResolutionStatus?: string;
        credentialRefConfigured?: boolean;
        credentialMaterialLoaded?: boolean;
        secretValueReturned?: boolean;
        credentialRefFingerprint?: string;
      };
    };
    assert.deepStrictEqual(auditDetails.credentialResolution, {
      credentialResolutionStatus: "configured",
      credentialSource: "secret",
      credentialRefFingerprint: testSha256(credentialRef).slice(0, 12),
      credentialRefConfigured: true,
      credentialMaterialLoaded: false,
      secretValueReturned: false,
    });
    const serializedEvidence = JSON.stringify({
      response,
      runs: persistence.runs,
      auditEntries: persistence.auditEntries,
    });
    assert.strictEqual(
      serializedEvidence.includes("actual_provider_token_must_not_leak"),
      false,
    );
    assert.strictEqual(
      serializedEvidence.includes("credential_ref_must_not_leak"),
      false,
    );
    assert.strictEqual(serializedEvidence.includes("secret://"), false);
    assert.strictEqual(serializedEvidence.includes("order_credential_store"), false);
  });

  it("does not resolve credentials for blocked provider reads", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const resolver = new RecordingCredentialResolver();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      undefined,
      undefined,
      resolver as unknown as ProviderCredentialResolverService,
    );

    const response = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_2",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_blocked_no_resolve",
      operatorId: "operator_2",
    });

    assert.strictEqual(response.status, "blocked");
    assert.strictEqual(resolver.calls.length, 0);
  });

  it("blocks persisted provider reads for cases outside the authenticated tenant", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const persistence = createProviderReadPersistence({
      cases: [{ id: "case_1", merchantId: "tenant_2" }],
    });
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const response = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_cross_tenant",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "blocked");
    assert.strictEqual(response.networkExecution, "not_started");
    assert.strictEqual(response.providerDataReturned, false);
    assert.strictEqual(response.requiresHuman, true);
    assert.match(response.operatorVisibleResult, /authenticated tenant/i);
    assert.strictEqual(persistence.runs.length, 0);
    assert.strictEqual(persistence.auditEntries.length, 1);
    assert.strictEqual(persistence.auditEntries[0].caseId, null);
    assert.strictEqual(persistence.auditEntries[0].action, "provider_read.blocked");
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries[0]).includes("case_1"),
      false,
    );
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries[0]).includes("order_1"),
      false,
    );
  });

  it("does not resolve credentials before case tenant ownership is verified", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const persistence = createProviderReadPersistence({
      cases: [{ id: "case_1", merchantId: "tenant_2" }],
    });
    const resolver = new RecordingCredentialResolver();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
      resolver as unknown as ProviderCredentialResolverService,
    );

    const response = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_case_mismatch_no_resolve",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "blocked");
    assert.strictEqual(resolver.calls.length, 0);
  });

  it("reuses the same provider read run for duplicate idempotency keys", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const persistence = createProviderReadPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );
    const request: ProviderReadRequest = {
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_11",
      operatorId: "operator_1",
    };

    const first = await service.executeProviderRead(request);
    const second = await service.executeProviderRead(request);

    assert.strictEqual(first.readRunId, second.readRunId);
    assert.strictEqual(first.status, "policy_accepted");
    assert.strictEqual(second.status, "policy_accepted");
    assert.strictEqual(persistence.runs.length, 1);
    assert.strictEqual(persistence.auditEntries.length, 1);
  });

  it("does not resolve credentials again for idempotency replays or conflicts", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const persistence = createProviderReadPersistence();
    const resolver = new RecordingCredentialResolver();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
      resolver as unknown as ProviderCredentialResolverService,
    );

    await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_idempotency_no_second_resolve",
      operatorId: "operator_1",
    });
    await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_idempotency_no_second_resolve",
      operatorId: "operator_1",
    });
    const conflict = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_2" },
      idempotencyKey: "read_idempotency_no_second_resolve",
      operatorId: "operator_1",
    });

    assert.strictEqual(conflict.status, "failed");
    assert.strictEqual(resolver.calls.length, 1);
  });

  it("does not resolve credentials before a raced idempotency create is confirmed", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const persistence = createProviderReadPersistence({
      failNextCreateWithDuplicate: true,
      seedRunOnDuplicate: {
        tenantId: "tenant_1",
        operatorId: "operator_1",
        caseId: "case_1",
        channel: "taobao",
        readCapability: "get_order",
        idempotencyKey: "read_raced_duplicate_no_resolve",
        lookup: { orderId: "order_1" },
        status: "policy_accepted",
        networkExecution: "not_implemented",
        operatorVisibleResult:
          "Readonly provider read accepted by policy; provider network execution is not implemented in this build.",
      },
    });
    const resolver = new RecordingCredentialResolver();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
      resolver as unknown as ProviderCredentialResolverService,
    );

    const response = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_raced_duplicate_no_resolve",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "policy_accepted");
    assert.strictEqual(response.readRunId, "provider_read_run_seeded");
    assert.strictEqual(resolver.calls.length, 0);
  });

  it("fails closed when an idempotency key is reused for a different provider read", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const persistence = createProviderReadPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_12",
      operatorId: "operator_1",
    });
    const conflict = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_2" },
      idempotencyKey: "read_12",
      operatorId: "operator_1",
    });

    assert.strictEqual(conflict.status, "failed");
    assert.strictEqual(conflict.networkExecution, "not_started");
    assert.strictEqual(conflict.providerDataReturned, false);
    assert.strictEqual(conflict.requiresHuman, true);
    assert.match(conflict.operatorVisibleResult, /idempotency/i);
    assert.strictEqual(persistence.runs.length, 1);
    assert.strictEqual(persistence.auditEntries.length, 2);
    assert.strictEqual(persistence.auditEntries[1].caseId, "case_1");
    assert.strictEqual(persistence.auditEntries[1].action, "provider_read.failed");
    assert.strictEqual(JSON.stringify(conflict).includes("order_2"), false);
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries[1]).includes("order_2"),
      false,
    );
  });

  it("re-reads provider read runs after a duplicate idempotency race", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const persistence = createProviderReadPersistence({
      failNextCreateWithDuplicate: true,
      seedRunOnDuplicate: {
        tenantId: "tenant_1",
        operatorId: "operator_1",
        caseId: "case_1",
        channel: "taobao",
        readCapability: "get_order",
        idempotencyKey: "read_13",
        lookup: { orderId: "order_1" },
        status: "policy_accepted",
        networkExecution: "not_implemented",
        operatorVisibleResult:
          "Readonly provider read accepted by policy; provider network execution is not implemented in this build.",
      },
    });
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const response = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_1" },
      idempotencyKey: "read_13",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.readRunId, "provider_read_run_seeded");
    assert.strictEqual(response.status, "policy_accepted");
    assert.strictEqual(response.providerDataReturned, false);
    assert.strictEqual(persistence.runs.length, 1);
  });

  it("audits sanitized idempotency conflicts after a duplicate race", async () => {
    process.env.PROVIDER_READONLY_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
    const persistence = createProviderReadPersistence({
      failNextCreateWithDuplicate: true,
      seedRunOnDuplicate: {
        tenantId: "tenant_1",
        operatorId: "operator_1",
        caseId: "case_1",
        channel: "taobao",
        readCapability: "get_order",
        idempotencyKey: "read_14",
        lookup: { orderId: "order_1" },
        status: "policy_accepted",
        networkExecution: "not_implemented",
        operatorVisibleResult:
          "Readonly provider read accepted by policy; provider network execution is not implemented in this build.",
      },
    });
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const response = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "get_order",
      lookup: { orderId: "order_2" },
      idempotencyKey: "read_14",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "failed");
    assert.strictEqual(response.networkExecution, "not_started");
    assert.strictEqual(response.providerDataReturned, false);
    assert.strictEqual(persistence.runs.length, 1);
    assert.strictEqual(persistence.auditEntries.length, 1);
    assert.strictEqual(persistence.auditEntries[0].caseId, "case_1");
    assert.strictEqual(persistence.auditEntries[0].action, "provider_read.failed");
    assert.strictEqual(JSON.stringify(response).includes("order_2"), false);
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries[0]).includes("order_2"),
      false,
    );
  });

  it("lists sanitized provider read runs for one tenant only", async () => {
    const persistence = createProviderReadPersistence();
    persistence.seedRun({
      tenantId: "tenant_1",
      operatorId: "operator_1",
      caseId: "case_1",
      channel: "taobao",
      readCapability: "get_order",
      idempotencyKey: "read_list_1",
      lookup: { orderId: "secret_order_1" },
      status: "policy_accepted",
      networkExecution: "not_implemented",
      operatorVisibleResult: "accepted",
      createdAt: new Date("2026-06-06T08:00:00.000Z"),
    });
    persistence.seedRun({
      tenantId: "tenant_2",
      operatorId: "operator_2",
      caseId: "case_2",
      channel: "douyin",
      readCapability: "query_logistics",
      idempotencyKey: "read_list_2",
      lookup: { logisticsId: "secret_logistics_2" },
      status: "blocked",
      networkExecution: "not_started",
      operatorVisibleResult: "blocked",
      createdAt: new Date("2026-06-06T09:00:00.000Z"),
    });
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const runs = await service.listProviderReadRuns({
      tenantId: "tenant_1",
      limit: 10,
    });

    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].caseId, "case_1");
    assert.strictEqual(runs[0].channel, "taobao");
    assert.strictEqual(runs[0].lookupKeys.hasOrderId, true);
    assert.match(runs[0].lookupFingerprint, /^[a-f0-9]{12}$/);
    assert.match(runs[0].requestFingerprint, /^[a-f0-9]{12}$/);
    assert.strictEqual("lookupHash" in runs[0], false);
    assert.strictEqual("requestHash" in runs[0], false);
    assert.strictEqual(JSON.stringify(runs).includes("secret_order_1"), false);
    assert.strictEqual(JSON.stringify(runs).includes("secret_logistics_2"), false);
  });

  it("summarizes provider read runs without leaking lookup data", async () => {
    const persistence = createProviderReadPersistence();
    persistence.seedRun({
      tenantId: "tenant_1",
      operatorId: "operator_1",
      caseId: "case_1",
      channel: "taobao",
      readCapability: "get_order",
      idempotencyKey: "read_summary_1",
      lookup: { orderId: "secret_order_1" },
      status: "policy_accepted",
      networkExecution: "not_implemented",
      operatorVisibleResult: "accepted",
      createdAt: new Date("2026-06-06T08:00:00.000Z"),
    });
    persistence.seedRun({
      tenantId: "tenant_1",
      operatorId: "operator_1",
      caseId: "case_1",
      channel: "taobao",
      readCapability: "query_logistics",
      idempotencyKey: "read_summary_2",
      lookup: { logisticsId: "secret_logistics_1" },
      status: "failed",
      networkExecution: "not_started",
      operatorVisibleResult: "failed",
      createdAt: new Date("2026-06-06T09:00:00.000Z"),
    });
    persistence.seedRun({
      tenantId: "tenant_2",
      operatorId: "operator_2",
      caseId: "case_2",
      channel: "douyin",
      readCapability: "get_order",
      idempotencyKey: "read_summary_3",
      lookup: { orderId: "secret_order_2" },
      status: "blocked",
      networkExecution: "not_started",
      operatorVisibleResult: "blocked",
      createdAt: new Date("2026-06-06T09:30:00.000Z"),
    });
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const summary = await service.getProviderReadSummary({
      tenantId: "tenant_1",
      from: new Date("2026-06-06T07:00:00.000Z"),
      to: new Date("2026-06-06T10:00:00.000Z"),
      now: new Date("2026-06-06T10:00:00.000Z"),
    });

    assert.strictEqual(summary.totals.totalCount, 2);
    assert.strictEqual(summary.totals.policyAcceptedCount, 1);
    assert.strictEqual(summary.totals.failedCount, 1);
    assert.deepStrictEqual(summary.byChannel, [{ key: "taobao", count: 2 }]);
    assert.deepStrictEqual(summary.byCapability, [
      { key: "get_order", count: 1 },
      { key: "query_logistics", count: 1 },
    ]);
    assert.strictEqual(summary.latestCreatedAt, "2026-06-06T09:00:00.000Z");
    assert.strictEqual(JSON.stringify(summary).includes("secret_order_1"), false);
    assert.strictEqual(JSON.stringify(summary).includes("secret_order_2"), false);
  });
});

type ProviderReadRunRecord = {
  id: string;
  tenantId: string;
  operatorId: string | null;
  caseId: string;
  channel: string;
  readCapability: string;
  idempotencyKey: string;
  lookupHash: string;
  lookupKeys: unknown;
  requestHash: string;
  status: string;
  networkExecution: string;
  providerDataReturned: boolean;
  operatorVisibleResult: string;
  policyReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProviderReadCaseRecord = {
  id: string;
  merchantId: string;
};

type SeedProviderReadRunInput = {
  id?: string;
  tenantId: string;
  operatorId: string;
  caseId: string;
  channel: string;
  readCapability: string;
  idempotencyKey: string;
  lookup: { orderId?: string; logisticsId?: string };
  status: string;
  networkExecution: string;
  operatorVisibleResult: string;
  createdAt?: Date;
};

function createProviderReadPersistence(
  options: {
    failNextCreateWithDuplicate?: boolean;
    cases?: ProviderReadCaseRecord[];
    seedRunOnDuplicate?: SeedProviderReadRunInput;
  } = {},
) {
  const runs: ProviderReadRunRecord[] = [];
  const cases = options.cases ?? [{ id: "case_1", merchantId: "tenant_1" }];
  const auditEntries: Array<{
    caseId: string | null;
    action: string;
    details: unknown;
  }> = [];
  let failNextCreateWithDuplicate = Boolean(options.failNextCreateWithDuplicate);

  const seedRun = (input: SeedProviderReadRunInput) => {
    const lookupHash = testSha256(stableTestJson(input.lookup));
    const timestamp = input.createdAt ?? new Date("2026-06-06T00:00:00.000Z");
    runs.push({
      id:
        input.id ??
        (runs.length === 0
          ? "provider_read_run_seeded"
          : `provider_read_run_seeded_${runs.length + 1}`),
      tenantId: input.tenantId,
      operatorId: input.operatorId,
      caseId: input.caseId,
      channel: input.channel,
      readCapability: input.readCapability,
      idempotencyKey: input.idempotencyKey,
      lookupHash,
      lookupKeys: {
        hasOrderId: Boolean(input.lookup.orderId),
        hasLogisticsId: Boolean(input.lookup.logisticsId),
      },
      requestHash: testSha256(
        stableTestJson({
          caseId: input.caseId,
          tenantId: input.tenantId,
          channel: input.channel,
          readCapability: input.readCapability,
          lookupHash,
        }),
      ),
      status: input.status,
      networkExecution: input.networkExecution,
      providerDataReturned: false,
      operatorVisibleResult: input.operatorVisibleResult,
      policyReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  };

  const persistence = {
    runs,
    auditEntries,
    prisma: {
      afterSalesCase: {
        findFirst: async ({
          where,
        }: {
          where: { id: string; merchantId: string };
        }) => {
          const match = cases.find(
            (item) =>
              item.id === where.id && item.merchantId === where.merchantId,
          );
          return match ? { id: match.id } : null;
        },
      },
      providerReadRun: {
        findMany: async ({
          where,
          select,
          orderBy,
          take,
        }: {
          where?: ProviderReadRunWhere;
          select?: Record<string, true>;
          orderBy?: { createdAt?: "asc" | "desc" };
          take?: number;
        }) => {
          const sorted = filterRuns(runs, where).sort((left, right) => {
            const direction = orderBy?.createdAt === "asc" ? 1 : -1;
            return direction * (left.createdAt.getTime() - right.createdAt.getTime());
          });
          const limited = take === undefined ? sorted : sorted.slice(0, take);
          if (!select) return limited;
          return limited.map((run) =>
            Object.fromEntries(
              Object.keys(select).map((key) => [
                key,
                run[key as keyof ProviderReadRunRecord],
              ]),
            ),
          );
        },
        count: async ({ where }: { where?: ProviderReadRunWhere }) =>
          filterRuns(runs, where).length,
        findUnique: async ({
          where,
        }: {
          where: {
            tenantId_idempotencyKey: { tenantId: string; idempotencyKey: string };
          };
        }) =>
          runs.find(
            (item) =>
              item.tenantId === where.tenantId_idempotencyKey.tenantId &&
              item.idempotencyKey ===
                where.tenantId_idempotencyKey.idempotencyKey,
          ) ?? null,
        create: async ({
          data,
        }: {
          data: Omit<ProviderReadRunRecord, "id" | "createdAt" | "updatedAt">;
        }) => {
          if (failNextCreateWithDuplicate) {
            failNextCreateWithDuplicate = false;
            if (options.seedRunOnDuplicate) seedRun(options.seedRunOnDuplicate);
            const error = new Error("Unique constraint failed");
            Object.assign(error, { code: "P2002" });
            throw error;
          }
          const existing = runs.find(
            (item) =>
              item.tenantId === data.tenantId &&
              item.idempotencyKey === data.idempotencyKey,
          );
          if (existing) {
            throw new Error("duplicate provider read run");
          }
          const row = {
            id: `provider_read_run_${runs.length + 1}`,
            ...data,
            createdAt: new Date("2026-06-06T00:00:00.000Z"),
            updatedAt: new Date("2026-06-06T00:00:00.000Z"),
          };
          runs.push(row);
          return row;
        },
      },
    } as unknown as PrismaService,
    audit: {
      log: async (caseId: string | null, action: string, details: unknown) => {
        auditEntries.push({ caseId, action, details });
      },
    } as unknown as AuditService,
    seedRun,
  };
  return persistence;
}

class PoisonTaobaoAdapter extends MockTaobaoAdapter {
  readCallCount = 0;

  override async getOrder(): Promise<null> {
    this.readCallCount += 1;
    throw new Error("provider getOrder must not be called");
  }

  override async queryLogistics(): Promise<{ status: string; detail: string } | null> {
    this.readCallCount += 1;
    throw new Error("provider queryLogistics must not be called");
  }
}

class RecordingCredentialResolver {
  calls: Array<{
    tenantId: string;
    channel: string;
    credentialRef: string;
  }> = [];

  async resolve(input: {
    tenantId: string;
    channel: string;
    credentialRef: string;
  }) {
    this.calls.push(input);
    return {
      status: "not_implemented",
      source: "secret",
      credentialRefFingerprint: "credential_ref_fingerprint_123",
      credentialRefConfigured: false,
      credentialMaterialLoaded: false,
      secretValueReturned: false,
      reason: "test credential resolver does not return secret material",
    };
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

function testSha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableTestJson(value: unknown): string {
  return JSON.stringify(sortTestJson(value));
}

function sortTestJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortTestJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortTestJson(item)]),
    );
  }
  return value;
}

type ProviderReadRunWhere = {
  tenantId?: string;
  status?: string;
  createdAt?: { gte?: Date; lte?: Date };
};

function filterRuns(
  runs: ProviderReadRunRecord[],
  where: ProviderReadRunWhere | undefined,
) {
  return runs.filter((run) => {
    if (where?.tenantId && run.tenantId !== where.tenantId) return false;
    if (where?.status && run.status !== where.status) return false;
    if (where?.createdAt?.gte && run.createdAt < where.createdAt.gte) {
      return false;
    }
    if (where?.createdAt?.lte && run.createdAt > where.createdAt.lte) {
      return false;
    }
    return true;
  });
}
