import assert from "node:assert";
import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, it } from "node:test";
import {
  CommerceActionSchema,
  ProviderReadRequestSchema,
  ProviderReadResponseSchema,
  ProviderWriteApprovalRequestSchema,
  ProviderWriteExecutionAttemptListItemSchema,
  ProviderWriteExecutionAttemptRequestSchema,
  ProviderWriteExecutionAttemptResponseSchema,
  ProviderWriteKillSwitchStatusSchema,
  ProviderWriteKillSwitchUpdateRequestSchema,
  ProviderWriteLivePilotRunLedgerDraftSchema,
  ProviderWriteLiveExecutorStatusSchema,
  ProviderWriteRequestSchema,
  ProviderWriteRejectionRequestSchema,
  ProviderWriteResponseSchema,
  type CommerceChannel,
  type ExecuteActionRequest,
  type ProviderReadRequest,
  type ProviderWriteKillSwitchUpdateRequest,
  type ProviderWriteRequest,
} from "@smart-cs-agent/shared";
import type { ProviderAdapterContract } from "../adapters/adapters.interface";
import { ProviderAdapterRegistry } from "../adapters/provider-adapter-registry.service";
import { ProviderCredentialResolverService } from "../adapters/provider-credential-resolver.service";
import { ProviderCredentialStoreService } from "../adapters/provider-credential-store.service";
import { ProviderReadonlyClientHarnessService } from "../adapters/provider-readonly-client-harness.service";
import { MockTaobaoAdapter } from "../adapters/mock-taobao.adapter";
import type { AuditService } from "../audit/audit.service";
import { loadApiConfig } from "../config/api-config";
import { ApiConfigService } from "../config/api-config.service";
import type { PrismaService } from "../prisma/prisma.service";
import { OpsService } from "./ops.service";

describe("OpsService provider adapter contract", () => {
  const originalProviderReadonlyAdapters = process.env.PROVIDER_READONLY_ADAPTERS;
  const originalProviderWriteReviewAdapters =
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS;
  const originalProviderWriteExecutionKillSwitch =
    process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH;
  const originalProviderWritePayloadEscrowMode =
    process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE;
  const originalProviderWriteLiveExecutorEnabled =
    process.env.PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED;
  const originalProviderWriteDryRunRehearsalSha256 =
    process.env.PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256;
  const originalProviderWriteApprovalSha256 =
    process.env.PROVIDER_WRITE_APPROVAL_SHA256;
  const originalProviderCredentials = process.env.PROVIDER_CREDENTIALS;

  afterEach(() => {
    if (originalProviderReadonlyAdapters === undefined) {
      delete process.env.PROVIDER_READONLY_ADAPTERS;
    } else {
      process.env.PROVIDER_READONLY_ADAPTERS = originalProviderReadonlyAdapters;
    }
    if (originalProviderWriteReviewAdapters === undefined) {
      delete process.env.PROVIDER_WRITE_REVIEW_ADAPTERS;
    } else {
      process.env.PROVIDER_WRITE_REVIEW_ADAPTERS =
        originalProviderWriteReviewAdapters;
    }
    if (originalProviderWriteExecutionKillSwitch === undefined) {
      delete process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH;
    } else {
      process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH =
        originalProviderWriteExecutionKillSwitch;
    }
    if (originalProviderWritePayloadEscrowMode === undefined) {
      delete process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE;
    } else {
      process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE =
        originalProviderWritePayloadEscrowMode;
    }
    if (originalProviderWriteLiveExecutorEnabled === undefined) {
      delete process.env.PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED;
    } else {
      process.env.PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED =
        originalProviderWriteLiveExecutorEnabled;
    }
    if (originalProviderWriteDryRunRehearsalSha256 === undefined) {
      delete process.env.PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256;
    } else {
      process.env.PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256 =
        originalProviderWriteDryRunRehearsalSha256;
    }
    if (originalProviderWriteApprovalSha256 === undefined) {
      delete process.env.PROVIDER_WRITE_APPROVAL_SHA256;
    } else {
      process.env.PROVIDER_WRITE_APPROVAL_SHA256 =
        originalProviderWriteApprovalSha256;
    }
    if (originalProviderCredentials === undefined) {
      delete process.env.PROVIDER_CREDENTIALS;
    } else {
      process.env.PROVIDER_CREDENTIALS = originalProviderCredentials;
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

  it("queues human-reviewed provider write requests without provider network execution", async () => {
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["modify_address", "issue_coupon"],
      },
    ]);
    const persistence = createProviderOperationPersistence();
    const adapter = new PoisonTaobaoAdapter();
    const service = new OpsService(
      new ProviderAdapterRegistry(adapter),
      persistence.prisma,
      persistence.audit,
    );

    const response = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "modify_address",
      payload: {
        orderId: "secret_order_1",
        addressFingerprint: "address_fp_123456",
      },
      idempotencyKey: "secret_order_idem_1",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "approval_required");
    assert.strictEqual(response.networkExecution, "not_started");
    assert.strictEqual(response.providerMutationExecuted, false);
    assert.strictEqual(response.customerVisibleMessageSent, false);
    assert.strictEqual(response.requiresHuman, true);
    assert.strictEqual(response.retryable, false);
    assert.strictEqual(adapter.writeCallCount, 0);
    assert.strictEqual(persistence.writeRequests.length, 1);
    assert.strictEqual(persistence.writeRequests[0].id, response.writeRequestId);
    assert.strictEqual(persistence.writeRequests[0].tenantId, "tenant_1");
    assert.strictEqual(persistence.writeRequests[0].operatorId, "operator_1");
    assert.strictEqual(persistence.writeRequests[0].caseId, "case_1");
    assert.strictEqual(persistence.writeRequests[0].channel, "taobao");
    assert.strictEqual(persistence.writeRequests[0].action, "modify_address");
    assert.strictEqual(persistence.writeRequests[0].status, "approval_required");
    assert.match(persistence.writeRequests[0].idempotencyKeyHash, /^[a-f0-9]{64}$/);
    assert.match(persistence.writeRequests[0].payloadHash, /^[a-f0-9]{64}$/);
    assert.match(persistence.writeRequests[0].requestHash, /^[a-f0-9]{64}$/);
    assert.deepStrictEqual(persistence.writeRequests[0].payloadKeys, {
      hasOrderId: true,
      hasLogisticsId: false,
      hasAddressFingerprint: true,
      hasCouponAmountCents: false,
    });
    assert.strictEqual(
      JSON.stringify(persistence.writeRequests[0]).includes("secret_order_1"),
      false,
    );
    assert.strictEqual(
      JSON.stringify(persistence.writeRequests[0]).includes("secret_order_idem_1"),
      false,
    );
    assert.strictEqual(persistence.auditEntries.length, 1);
    assert.strictEqual(persistence.auditEntries[0].caseId, "case_1");
    assert.strictEqual(
      persistence.auditEntries[0].action,
      "provider_write.approval_required",
    );
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries[0]).includes("secret_order_1"),
      false,
    );
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries[0]).includes("secret_order_idem_1"),
      false,
    );
  });

  it("blocks provider write requests when review adapters are not configured", async () => {
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const response = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: { orderId: "secret_order_1", couponAmountCents: 2000 },
      idempotencyKey: "write_blocked",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "blocked");
    assert.strictEqual(response.networkExecution, "not_started");
    assert.strictEqual(response.providerMutationExecuted, false);
    assert.strictEqual(response.requiresHuman, true);
    assert.match(response.operatorVisibleResult, /provider write review/i);
    assert.strictEqual(persistence.writeRequests.length, 1);
    assert.strictEqual(persistence.writeRequests[0].status, "blocked");
    assert.strictEqual(
      JSON.stringify(persistence.writeRequests).includes("secret_order_1"),
      false,
    );
  });

  it("keeps provider write payload escrow disabled by default", async () => {
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["modify_address"],
      },
    ]);
    delete process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE;
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "modify_address",
      payload: {
        orderId: "secret_order_pr62_default",
        addressFingerprint: "address_fp_pr62_default",
      },
      idempotencyKey: "secret_idem_pr62_default",
      operatorId: "operator_1",
    });

    const row = persistence.writeRequests[0];
    assert.strictEqual(row.payloadEscrowStatus, "not_stored");
    assert.strictEqual(row.payloadEscrowMode, "disabled");
    assert.strictEqual(row.payloadEscrowEnvelopeFingerprint, null);
    assert.strictEqual(row.payloadEscrowCreatedAt, null);
    assert.match(row.payloadEscrowFingerprint ?? "", /^[a-f0-9]{64}$/);
    assert.strictEqual(JSON.stringify(row).includes("secret_order_pr62_default"), false);
    assert.strictEqual(JSON.stringify(row).includes("address_fp_pr62_default"), false);
    assert.strictEqual(JSON.stringify(row).includes("secret_idem_pr62_default"), false);
  });

  it("records sealed metadata fingerprints without raw provider write payloads", async () => {
    process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE = "sealed_metadata";
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["modify_address"],
      },
    ]);
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "modify_address",
      payload: {
        orderId: "secret_order_pr62_sealed",
        addressFingerprint: "address_fp_pr62_sealed",
      },
      idempotencyKey: "secret_idem_pr62_sealed",
      operatorId: "operator_1",
    });

    const row = persistence.writeRequests[0];
    assert.strictEqual(row.payloadEscrowStatus, "sealed_metadata");
    assert.strictEqual(row.payloadEscrowMode, "sealed_metadata");
    assert.match(row.payloadEscrowFingerprint ?? "", /^[a-f0-9]{64}$/);
    assert.match(row.payloadEscrowEnvelopeFingerprint ?? "", /^[a-f0-9]{64}$/);
    assert.ok(row.payloadEscrowCreatedAt instanceof Date);
    assert.strictEqual(JSON.stringify(row).includes("secret_order_pr62_sealed"), false);
    assert.strictEqual(JSON.stringify(row).includes("address_fp_pr62_sealed"), false);
    assert.strictEqual(JSON.stringify(row).includes("secret_idem_pr62_sealed"), false);
    assert.strictEqual(JSON.stringify(row).includes("providerPayload"), false);
    assert.strictEqual(JSON.stringify(row).includes("secret://"), false);
    assert.strictEqual(JSON.stringify(row).includes("vault://"), false);
  });

  it("rejects unsafe provider write request and response shapes", () => {
    assert.throws(() =>
      ProviderWriteRequestSchema.parse({
        caseId: "case_1",
        channel: "taobao",
        action: "refund",
        payload: { orderId: "order_1" },
        idempotencyKey: "write_unsafe_1",
      }),
    );
    assert.throws(() =>
      ProviderWriteRequestSchema.parse({
        caseId: "case_1",
        channel: "taobao",
        action: "modify_address",
        payload: { orderId: "order_1", newAddress: "raw address" },
        idempotencyKey: "write_unsafe_2",
      }),
    );
    assert.throws(() =>
      ProviderWriteResponseSchema.parse({
        writeRequestId: "write_1",
        status: "approval_required",
        networkExecution: "not_started",
        providerMutationExecuted: true,
        customerVisibleMessageSent: false,
        operatorVisibleResult: "unsafe",
        requiresHuman: true,
        retryable: false,
      }),
    );
    assert.throws(() =>
      ProviderWriteApprovalRequestSchema.parse({
        reasonCode: "policy_verified",
        rawNote: "secret_order_1 raw address",
      }),
    );
    assert.throws(() =>
      ProviderWriteRejectionRequestSchema.parse({
        reasonCode: "free_text_customer_phone_13800000000",
      }),
    );
    assert.throws(() =>
      ProviderWriteExecutionAttemptRequestSchema.parse({
        idempotencyKey: "execution_1",
        rawNote: "secret_order_1 raw address",
      }),
    );
    assert.throws(() =>
      ProviderWriteExecutionAttemptResponseSchema.parse({
        attemptId: "attempt_1",
        writeRequestId: "write_1",
        status: "dry_run_recorded",
        networkExecution: "not_started",
        providerMutationExecuted: true,
        customerVisibleMessageSent: false,
        payloadEscrowOpened: false,
        operatorVisibleResult: "unsafe",
        requiresHuman: true,
        retryable: false,
      }),
    );
    assert.throws(() =>
      ProviderWriteExecutionAttemptListItemSchema.parse({
        id: "attempt_1",
        providerWriteRequestId: "write_1",
        operatorId: "admin_1",
        channel: "taobao",
        action: "issue_coupon",
        status: "dry_run_recorded",
        networkExecution: "started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        payloadEscrowStatus: "not_stored",
        payloadEscrowOpened: false,
        requestFingerprint: "abcdef123456",
        attemptFingerprint: "123456abcdef",
        policyReason: null,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
      }),
    );
    assert.throws(() =>
      ProviderWriteExecutionAttemptListItemSchema.parse({
        id: "attempt_1",
        providerWriteRequestId: "write_1",
        operatorId: "admin_1",
        channel: "taobao",
        action: "issue_coupon",
        status: "dry_run_recorded",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        payloadEscrowStatus: "not_stored",
        payloadEscrowOpened: false,
        requestFingerprint: "abcdef123456",
        attemptFingerprint: "123456abcdef",
        policyReason: null,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
        operatorVisibleResult: "free text must not enter list rows",
        orderId: "secret_order_1",
        providerPayload: { secret: true },
        operatorApiKey: "secret_key",
      }),
    );
    assert.throws(() =>
      ProviderWriteLiveExecutorStatusSchema.parse({
        liveExecutorEnabled: true,
        startupMode: "guarded_ready",
        startupGuardSatisfied: true,
        dryRunRehearsalEvidenceConfigured: true,
        providerWriteApprovalEvidenceConfigured: true,
        executionKillSwitchEnabled: true,
        payloadEscrowMode: "sealed_metadata",
        reviewAdapterCount: 1,
        credentialRefCount: 1,
        missingStartupGates: [],
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        payloadEscrowOpened: false,
        evidenceHash: "a".repeat(64),
        credentialRef: "secret://smartcs/taobao/tenant_1",
      }),
    );
  });

  it("reports live executor control-plane status without provider writes or secret material", () => {
    const apiConfigService = new ApiConfigService(
      loadApiConfig(
        {
          DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
          PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED: "true",
          PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256: "a".repeat(64),
          PROVIDER_WRITE_APPROVAL_SHA256: "b".repeat(64),
          PROVIDER_WRITE_EXECUTION_KILL_SWITCH: "true",
          PROVIDER_WRITE_PAYLOAD_ESCROW_MODE: "sealed_metadata",
          PROVIDER_WRITE_REVIEW_ADAPTERS: JSON.stringify([
            {
              channel: "taobao",
              tenantId: "tenant_1",
              allowedActions: ["issue_coupon"],
            },
          ]),
          PROVIDER_CREDENTIALS: JSON.stringify([
            { credentialRef: "secret://smartcs/taobao/tenant_1" },
          ]),
        },
        { includeDotEnv: false },
      ),
    );
    const adapter = new PoisonTaobaoAdapter();
    const service = new OpsService(
      new ProviderAdapterRegistry(adapter),
      undefined,
      undefined,
      undefined,
      undefined,
      apiConfigService,
    );

    const status = service.getProviderWriteLiveExecutorStatus();

    assert.strictEqual(status.liveExecutorEnabled, true);
    assert.strictEqual(status.startupMode, "guarded_ready");
    assert.strictEqual(status.startupGuardSatisfied, true);
    assert.strictEqual(status.networkExecution, "not_started");
    assert.strictEqual(status.providerMutationExecuted, false);
    assert.strictEqual(status.customerVisibleMessageSent, false);
    assert.strictEqual(status.payloadEscrowOpened, false);
    assert.strictEqual(adapter.writeCallCount, 0);
    const serialized = JSON.stringify(status);
    assert.strictEqual(serialized.includes("secret://"), false);
    assert.strictEqual(serialized.includes("tenant_1"), false);
    assert.strictEqual(serialized.includes("aaaaaaaa"), false);
    assert.strictEqual(serialized.includes("bbbbbbbb"), false);
  });

  it("reports live executor control-plane status from the startup snapshot instead of the current env", () => {
    const apiConfigService = new ApiConfigService(
      loadApiConfig(
        {
          DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
          PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED: "false",
        },
        { includeDotEnv: false },
      ),
    );
    process.env.PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED = "true";
    process.env.PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256 = "a".repeat(64);
    process.env.PROVIDER_WRITE_APPROVAL_SHA256 = "b".repeat(64);
    process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH = "true";
    process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE = "sealed_metadata";
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["issue_coupon"],
      },
    ]);
    process.env.PROVIDER_CREDENTIALS = JSON.stringify([
      { credentialRef: "secret://smartcs/taobao/tenant_1" },
    ]);
    const adapter = new PoisonTaobaoAdapter();
    const service = new OpsService(
      new ProviderAdapterRegistry(adapter),
      undefined,
      undefined,
      undefined,
      undefined,
      apiConfigService,
    );

    const status = service.getProviderWriteLiveExecutorStatus();

    assert.strictEqual(status.liveExecutorEnabled, false);
    assert.strictEqual(status.startupMode, "disabled");
    assert.strictEqual(status.startupGuardSatisfied, false);
    assert.deepStrictEqual(status.missingStartupGates, []);
    assert.strictEqual(status.reviewAdapterCount, 0);
    assert.strictEqual(status.credentialRefCount, 0);
    assert.strictEqual(status.networkExecution, "not_started");
    assert.strictEqual(status.providerMutationExecuted, false);
    assert.strictEqual(status.customerVisibleMessageSent, false);
    assert.strictEqual(status.payloadEscrowOpened, false);
    assert.strictEqual(adapter.writeCallCount, 0);
    const serialized = JSON.stringify(status);
    assert.strictEqual(serialized.includes("secret://"), false);
    assert.strictEqual(serialized.includes("tenant_1"), false);
    assert.strictEqual(serialized.includes("aaaaaaaa"), false);
    assert.strictEqual(serialized.includes("bbbbbbbb"), false);
  });

  it("reports provider write kill switch status without provider writes or secret material", async () => {
    process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH = "true";
    const persistence = createProviderOperationPersistence();
    const adapter = new PoisonTaobaoAdapter();
    const service = new OpsService(
      new ProviderAdapterRegistry(adapter),
      persistence.prisma,
      persistence.audit,
    );

    ProviderWriteKillSwitchStatusSchema.parse({
      envKillSwitchEnabled: true,
      emergencyStopEngaged: false,
      effectiveKillSwitchEnabled: true,
      source: "env",
      latestEvent: null,
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
    });
    const status = await service.getProviderWriteKillSwitchStatus("tenant_1");

    assert.strictEqual(status.envKillSwitchEnabled, true);
    assert.strictEqual(status.emergencyStopEngaged, false);
    assert.strictEqual(status.effectiveKillSwitchEnabled, true);
    assert.strictEqual(status.source, "env");
    assert.strictEqual(status.latestEvent, null);
    assert.strictEqual(status.networkExecution, "not_started");
    assert.strictEqual(status.providerMutationExecuted, false);
    assert.strictEqual(status.customerVisibleMessageSent, false);
    assert.strictEqual(adapter.writeCallCount, 0);
    assert.strictEqual(JSON.stringify(status).includes("secret://"), false);
    assert.strictEqual(JSON.stringify(status).includes("rawPayload"), false);
  });

  it("records provider write emergency stop events idempotently with sanitized audit details", async () => {
    process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH = "false";
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );
    const request: ProviderWriteKillSwitchUpdateRequest =
      ProviderWriteKillSwitchUpdateRequestSchema.parse({
        action: "engage",
        reasonCode: "incident_response",
        idempotencyKey: "secret_kill_switch_idempotency_key_1",
      });

    const first = await service.updateProviderWriteKillSwitch({
      tenantId: "tenant_1",
      operatorId: "admin_1",
      ...request,
    });
    const second = await service.updateProviderWriteKillSwitch({
      tenantId: "tenant_1",
      operatorId: "admin_1",
      ...request,
    });

    assert.strictEqual(first.emergencyStopEngaged, true);
    assert.strictEqual(first.effectiveKillSwitchEnabled, true);
    assert.strictEqual(first.source, "emergency_stop");
    assert.strictEqual(first.latestEvent?.action, "engage");
    assert.strictEqual(first.latestEvent?.reasonCode, "incident_response");
    assert.strictEqual(first.latestEvent?.operatorId, "admin_1");
    assert.match(first.latestEvent?.stateFingerprint ?? "", /^[a-f0-9]{12}$/);
    assert.deepStrictEqual(second, first);
    assert.strictEqual(persistence.killSwitchEvents.length, 1);
    assert.strictEqual(persistence.auditEntries.length, 1);
    assert.strictEqual(
      persistence.auditEntries[0].action,
      "provider_write_kill_switch.engage",
    );
    const serialized = JSON.stringify({
      first,
      second,
      rows: persistence.killSwitchEvents,
      audit: persistence.auditEntries,
    });
    assert.strictEqual(
      serialized.includes("secret_kill_switch_idempotency_key_1"),
      false,
    );
    assert.strictEqual(serialized.includes("providerPayload"), false);
    assert.strictEqual(serialized.includes("credentialRef"), false);
  });

  it("blocks provider write execution attempts while the persisted emergency stop is engaged", async () => {
    process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH = "false";
    const persistence = createProviderOperationPersistence();
    persistence.seedWriteRequest({
      id: "provider_write_request_1",
      tenantId: "tenant_1",
      operatorId: "operator_1",
      caseId: "case_1",
      channel: "taobao",
      action: "issue_coupon",
      status: "approved",
      requestHash: testSha256("request_1"),
      reviewFingerprint: testSha256("review_1"),
    });
    persistence.seedKillSwitchEvent({
      tenantId: "tenant_1",
      operatorId: "admin_1",
      action: "engage",
      reasonCode: "provider_anomaly",
      idempotencyKeyHash: testSha256("ks_1"),
    });
    const adapter = new PoisonTaobaoAdapter();
    const service = new OpsService(
      new ProviderAdapterRegistry(adapter),
      persistence.prisma,
      persistence.audit,
    );

    const response = await service.executeProviderWriteAttempt({
      tenantId: "tenant_1",
      requestId: "provider_write_request_1",
      operatorId: "admin_2",
      idempotencyKey: "secret_execution_idem_1",
    });

    assert.strictEqual(response.status, "blocked");
    assert.match(response.operatorVisibleResult, /emergency stop/i);
    assert.strictEqual(response.networkExecution, "not_started");
    assert.strictEqual(response.providerMutationExecuted, false);
    assert.strictEqual(response.customerVisibleMessageSent, false);
    assert.strictEqual(response.payloadEscrowOpened, false);
    assert.strictEqual(adapter.writeCallCount, 0);
    assert.strictEqual(persistence.writeExecutionAttempts.length, 1);
    assert.strictEqual(
      persistence.writeExecutionAttempts[0].policyReason,
      "emergency_stop_engaged",
    );
    assert.strictEqual(
      JSON.stringify(persistence.writeExecutionAttempts).includes(
        "secret_execution_idem_1",
      ),
      false,
    );
  });

  it("reuses provider write requests for duplicate idempotency keys", async () => {
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["issue_coupon"],
      },
    ]);
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );
    const request: ProviderWriteRequest = {
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: { orderId: "secret_order_1", couponAmountCents: 2000 },
      idempotencyKey: "write_idem_1",
      operatorId: "operator_1",
    };

    const first = await service.requestProviderWrite(request);
    const second = await service.requestProviderWrite(request);

    assert.strictEqual(second.writeRequestId, first.writeRequestId);
    assert.strictEqual(second.status, "approval_required");
    assert.strictEqual(persistence.writeRequests.length, 1);
    assert.strictEqual(persistence.auditEntries.length, 1);
  });

  it("fails closed when a provider write idempotency key is reused for a different payload", async () => {
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["issue_coupon"],
      },
    ]);
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: { orderId: "secret_order_1", couponAmountCents: 2000 },
      idempotencyKey: "write_idem_2",
      operatorId: "operator_1",
    });
    const conflict = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: { orderId: "secret_order_1", couponAmountCents: 3000 },
      idempotencyKey: "write_idem_2",
      operatorId: "operator_1",
    });

    assert.strictEqual(conflict.status, "failed");
    assert.strictEqual(conflict.networkExecution, "not_started");
    assert.strictEqual(conflict.providerMutationExecuted, false);
    assert.match(conflict.operatorVisibleResult, /idempotency/i);
    assert.strictEqual(persistence.writeRequests.length, 1);
    assert.strictEqual(persistence.auditEntries.length, 2);
    assert.strictEqual(
      persistence.auditEntries[1].action,
      "provider_write.failed",
    );
    assert.strictEqual(JSON.stringify(conflict).includes("3000"), false);
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries[1]).includes("3000"),
      false,
    );
  });

  it("blocks provider write requests before persistence when cases cross tenants", async () => {
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_2",
        allowedActions: ["modify_address"],
      },
    ]);
    const persistence = createProviderOperationPersistence({
      cases: [{ id: "case_1", merchantId: "tenant_1" }],
    });
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const response = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_2",
      channel: "taobao",
      action: "modify_address",
      payload: {
        orderId: "secret_order_1",
        addressFingerprint: "address_fp_123456",
      },
      idempotencyKey: "write_cross_tenant",
      operatorId: "operator_2",
    });

    assert.strictEqual(response.status, "blocked");
    assert.match(response.operatorVisibleResult, /authenticated tenant/i);
    assert.strictEqual(persistence.writeRequests.length, 0);
    assert.strictEqual(persistence.auditEntries.length, 1);
    assert.strictEqual(persistence.auditEntries[0].caseId, null);
    assert.strictEqual(
      persistence.auditEntries[0].action,
      "provider_write.blocked",
    );
  });

  it("approves queued provider write requests with two-person review without provider execution", async () => {
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["modify_address"],
      },
    ]);
    const adapter = new PoisonTaobaoAdapter();
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(adapter),
      persistence.prisma,
      persistence.audit,
    );

    const queued = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "modify_address",
      payload: {
        orderId: "secret_order_approval",
        addressFingerprint: "address_fp_approval_123",
      },
      idempotencyKey: "secret_idem_approval",
      operatorId: "operator_1",
    });
    const approved = await service.approveProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      reviewerOperatorId: "admin_2",
      reasonCode: "policy_verified",
    });

    assert.strictEqual(approved.writeRequestId, queued.writeRequestId);
    assert.strictEqual(approved.status, "approved");
    assert.strictEqual(approved.networkExecution, "not_started");
    assert.strictEqual(approved.providerMutationExecuted, false);
    assert.strictEqual(approved.customerVisibleMessageSent, false);
    assert.strictEqual(approved.requiresHuman, true);
    assert.strictEqual(approved.retryable, false);
    assert.strictEqual(adapter.writeCallCount, 0);
    assert.strictEqual(persistence.writeRequests[0].status, "approved");
    assert.strictEqual(
      persistence.writeRequests[0].reviewerOperatorId,
      "admin_2",
    );
    assert.strictEqual(
      persistence.writeRequests[0].reviewReasonCode,
      "policy_verified",
    );
    assert.ok(persistence.writeRequests[0].reviewedAt instanceof Date);
    assert.match(
      persistence.writeRequests[0].reviewFingerprint ?? "",
      /^[a-f0-9]{64}$/,
    );
    assert.strictEqual(
      persistence.writeRequests[0].payloadEscrowStatus,
      "not_stored",
    );
    assert.match(
      persistence.writeRequests[0].payloadEscrowFingerprint ?? "",
      /^[a-f0-9]{64}$/,
    );
    assert.strictEqual(persistence.auditEntries.length, 2);
    assert.strictEqual(
      persistence.auditEntries[1].action,
      "provider_write.approved",
    );
    assert.strictEqual(JSON.stringify(approved).includes("secret_order_approval"), false);
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries[1]).includes("secret_order_approval"),
      false,
    );
    assert.strictEqual(
      JSON.stringify(persistence.writeRequests[0]).includes("secret_idem_approval"),
      false,
    );
  });

  it("preserves sealed payload escrow metadata through human review", async () => {
    process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE = "sealed_metadata";
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["issue_coupon"],
      },
    ]);
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const requested = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: {
        orderId: "secret_order_pr62_review",
        couponAmountCents: 2000,
      },
      idempotencyKey: "secret_idem_pr62_review",
      operatorId: "operator_1",
    });
    const originalFingerprint = persistence.writeRequests[0].payloadEscrowFingerprint;
    const originalEnvelope =
      persistence.writeRequests[0].payloadEscrowEnvelopeFingerprint;
    const originalMode = persistence.writeRequests[0].payloadEscrowMode;
    const originalCreatedAt = persistence.writeRequests[0].payloadEscrowCreatedAt;

    await service.approveProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: requested.writeRequestId,
      reviewerOperatorId: "admin_1",
      reasonCode: "policy_verified",
    });

    const row = persistence.writeRequests[0];
    assert.strictEqual(row.payloadEscrowStatus, "sealed_metadata");
    assert.strictEqual(row.payloadEscrowFingerprint, originalFingerprint);
    assert.strictEqual(row.payloadEscrowEnvelopeFingerprint, originalEnvelope);
    assert.strictEqual(row.payloadEscrowMode, originalMode);
    assert.strictEqual(row.payloadEscrowCreatedAt, originalCreatedAt);
    assert.strictEqual(JSON.stringify(row).includes("secret_order_pr62_review"), false);
  });

  it("blocks provider write self-approval and leaves the request pending", async () => {
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["issue_coupon"],
      },
    ]);
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const queued = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: { orderId: "secret_order_self_approval", couponAmountCents: 2000 },
      idempotencyKey: "secret_idem_self_approval",
      operatorId: "admin_1",
    });
    const blocked = await service.approveProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      reviewerOperatorId: "admin_1",
      reasonCode: "merchant_approved",
    });

    assert.strictEqual(blocked.status, "blocked");
    assert.match(blocked.operatorVisibleResult, /two-person review/i);
    assert.strictEqual(persistence.writeRequests[0].status, "approval_required");
    assert.strictEqual(persistence.writeRequests[0].reviewerOperatorId, null);
    assert.strictEqual(persistence.auditEntries.length, 2);
    assert.strictEqual(
      persistence.auditEntries[1].action,
      "provider_write.blocked",
    );
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries[1]).includes("secret_order_self_approval"),
      false,
    );
  });

  it("rejects queued provider write requests without provider execution", async () => {
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["urge_logistics"],
      },
    ]);
    const adapter = new PoisonTaobaoAdapter();
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(adapter),
      persistence.prisma,
      persistence.audit,
    );

    const queued = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "urge_logistics",
      payload: { logisticsId: "secret_logistics_reject" },
      idempotencyKey: "secret_idem_reject",
      operatorId: "operator_1",
    });
    const rejected = await service.rejectProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      reviewerOperatorId: "admin_2",
      reasonCode: "insufficient_context",
    });

    assert.strictEqual(rejected.status, "rejected");
    assert.strictEqual(rejected.networkExecution, "not_started");
    assert.strictEqual(rejected.providerMutationExecuted, false);
    assert.strictEqual(rejected.customerVisibleMessageSent, false);
    assert.strictEqual(adapter.writeCallCount, 0);
    assert.strictEqual(persistence.writeRequests[0].status, "rejected");
    assert.strictEqual(
      persistence.writeRequests[0].reviewReasonCode,
      "insufficient_context",
    );
    assert.strictEqual(
      persistence.auditEntries.at(-1)?.action,
      "provider_write.rejected",
    );
    assert.strictEqual(
      JSON.stringify(persistence).includes("secret_logistics_reject"),
      false,
    );
  });

  it("fails closed when reviewing provider write requests outside the tenant or terminal state", async () => {
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["issue_coupon"],
      },
    ]);
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );
    const queued = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: { orderId: "secret_order_terminal", couponAmountCents: 2000 },
      idempotencyKey: "secret_idem_terminal",
      operatorId: "operator_1",
    });

    const crossTenant = await service.approveProviderWriteRequest({
      tenantId: "tenant_2",
      requestId: queued.writeRequestId,
      reviewerOperatorId: "admin_2",
      reasonCode: "policy_verified",
    });
    const approved = await service.approveProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      reviewerOperatorId: "admin_2",
      reasonCode: "policy_verified",
    });
    const repeated = await service.rejectProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      reviewerOperatorId: "admin_3",
      reasonCode: "duplicate_request",
    });

    assert.strictEqual(crossTenant.status, "failed");
    assert.match(crossTenant.operatorVisibleResult, /not found/i);
    assert.strictEqual(approved.status, "approved");
    assert.strictEqual(repeated.status, "failed");
    assert.match(repeated.operatorVisibleResult, /already reviewed/i);
    assert.strictEqual(persistence.writeRequests[0].status, "approved");
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries).includes("secret_order_terminal"),
      false,
    );
  });

  it("blocks approved provider write execution attempts by default kill switch without provider execution", async () => {
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["issue_coupon"],
      },
    ]);
    const adapter = new PoisonTaobaoAdapter();
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(adapter),
      persistence.prisma,
      persistence.audit,
    );

    const queued = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: { orderId: "secret_order_execute_blocked", couponAmountCents: 2000 },
      idempotencyKey: "secret_write_execute_blocked",
      operatorId: "operator_1",
    });
    await service.approveProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      reviewerOperatorId: "admin_2",
      reasonCode: "policy_verified",
    });

    const attempt = await service.executeProviderWriteAttempt({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      operatorId: "admin_2",
      idempotencyKey: "secret_execution_attempt_blocked",
    });

    assert.strictEqual(attempt.writeRequestId, queued.writeRequestId);
    assert.strictEqual(attempt.status, "blocked");
    assert.strictEqual(attempt.networkExecution, "not_started");
    assert.strictEqual(attempt.providerMutationExecuted, false);
    assert.strictEqual(attempt.customerVisibleMessageSent, false);
    assert.strictEqual(attempt.payloadEscrowOpened, false);
    assert.strictEqual(attempt.requiresHuman, true);
    assert.strictEqual(attempt.retryable, true);
    assert.match(attempt.operatorVisibleResult, /kill switch/i);
    assert.strictEqual(adapter.writeCallCount, 0);
    assert.strictEqual(persistence.writeExecutionAttempts.length, 1);
    assert.strictEqual(persistence.writeExecutionAttempts[0].status, "blocked");
    assert.strictEqual(
      persistence.writeExecutionAttempts[0].policyReason,
      "execution_kill_switch_enabled",
    );
    assert.strictEqual(
      persistence.auditEntries.at(-1)?.action,
      "provider_write_execution.blocked",
    );
    assert.strictEqual(
      JSON.stringify(persistence).includes("secret_order_execute_blocked"),
      false,
    );
    assert.strictEqual(
      JSON.stringify(persistence).includes("secret_execution_attempt_blocked"),
      false,
    );
  });

  it("records provider write dry-run execution attempts when the kill switch is explicitly disabled", async () => {
    process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH = "false";
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["modify_address"],
      },
    ]);
    const adapter = new PoisonTaobaoAdapter();
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(adapter),
      persistence.prisma,
      persistence.audit,
    );

    const queued = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "modify_address",
      payload: {
        orderId: "secret_order_execute_dry_run",
        addressFingerprint: "address_fp_execute_123",
      },
      idempotencyKey: "secret_write_execute_dry_run",
      operatorId: "operator_1",
    });
    await service.approveProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      reviewerOperatorId: "admin_2",
      reasonCode: "customer_confirmed",
    });

    const attempt = await service.executeProviderWriteAttempt({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      operatorId: "admin_2",
      idempotencyKey: "secret_execution_attempt_dry_run",
    });
    const replay = await service.executeProviderWriteAttempt({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      operatorId: "admin_2",
      idempotencyKey: "secret_execution_attempt_dry_run",
    });

    assert.strictEqual(attempt.status, "dry_run_recorded");
    assert.strictEqual(attempt.networkExecution, "not_started");
    assert.strictEqual(attempt.providerMutationExecuted, false);
    assert.strictEqual(attempt.customerVisibleMessageSent, false);
    assert.strictEqual(attempt.payloadEscrowOpened, false);
    assert.strictEqual(adapter.writeCallCount, 0);
    assert.strictEqual(replay.attemptId, attempt.attemptId);
    assert.strictEqual(persistence.writeExecutionAttempts.length, 1);
    assert.strictEqual(
      persistence.writeExecutionAttempts[0].payloadEscrowStatus,
      "not_stored",
    );
    assert.strictEqual(
      persistence.writeExecutionAttempts[0].payloadEscrowOpened,
      false,
    );
    assert.match(
      persistence.writeExecutionAttempts[0].attemptFingerprint,
      /^[a-f0-9]{64}$/,
    );
    assert.strictEqual(
      persistence.auditEntries.at(-1)?.action,
      "provider_write_execution.dry_run_recorded",
    );
    assert.strictEqual(
      JSON.stringify(persistence).includes("secret_order_execute_dry_run"),
      false,
    );
    assert.strictEqual(
      JSON.stringify(persistence).includes("secret_execution_attempt_dry_run"),
      false,
    );
  });

  it("blocks sealed escrow execution attempts without opening escrow or violating attempt invariants", async () => {
    process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE = "sealed_metadata";
    process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH = "false";
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["issue_coupon"],
      },
    ]);
    const persistence = createProviderOperationPersistence();
    const adapter = new PoisonTaobaoAdapter();
    const service = new OpsService(
      new ProviderAdapterRegistry(adapter),
      persistence.prisma,
      persistence.audit,
    );

    const requested = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: {
        orderId: "secret_order_pr62_exec",
        couponAmountCents: 2000,
      },
      idempotencyKey: "secret_idem_pr62_exec_request",
      operatorId: "operator_1",
    });
    await service.approveProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: requested.writeRequestId,
      reviewerOperatorId: "admin_1",
      reasonCode: "policy_verified",
    });

    const attempt = await service.executeProviderWriteAttempt({
      tenantId: "tenant_1",
      requestId: requested.writeRequestId,
      operatorId: "admin_2",
      idempotencyKey: "secret_idem_pr62_exec_attempt",
    });

    assert.strictEqual(attempt.status, "blocked");
    assert.match(attempt.operatorVisibleResult, /payload escrow/i);
    assert.strictEqual(attempt.networkExecution, "not_started");
    assert.strictEqual(attempt.payloadEscrowOpened, false);
    assert.strictEqual(attempt.providerMutationExecuted, false);
    assert.strictEqual(attempt.customerVisibleMessageSent, false);
    assert.strictEqual(adapter.writeCallCount, 0);
    assert.strictEqual(persistence.writeExecutionAttempts.length, 1);
    assert.strictEqual(
      persistence.writeExecutionAttempts[0].payloadEscrowStatus,
      "not_stored",
    );
    assert.strictEqual(
      persistence.writeExecutionAttempts[0].payloadEscrowOpened,
      false,
    );
    assert.strictEqual(
      persistence.writeExecutionAttempts[0].networkExecution,
      "not_started",
    );
    assert.strictEqual(
      persistence.writeExecutionAttempts[0].providerMutationExecuted,
      false,
    );
    assert.strictEqual(
      persistence.writeExecutionAttempts[0].customerVisibleMessageSent,
      false,
    );
    assert.strictEqual(
      persistence.auditEntries.at(-1)?.action,
      "provider_write_execution.blocked",
    );
    assert.strictEqual(JSON.stringify(persistence).includes("secret_order_pr62_exec"), false);
    assert.strictEqual(
      JSON.stringify(persistence).includes("secret_idem_pr62_exec_attempt"),
      false,
    );
  });

  it("blocks execution attempts for provider write requests that are not approved", async () => {
    process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH = "false";
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["urge_logistics"],
      },
    ]);
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const queued = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "urge_logistics",
      payload: { logisticsId: "secret_logistics_execute_unapproved" },
      idempotencyKey: "secret_write_execute_unapproved",
      operatorId: "operator_1",
    });
    const attempt = await service.executeProviderWriteAttempt({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      operatorId: "admin_2",
      idempotencyKey: "secret_execution_attempt_unapproved",
    });

    assert.strictEqual(attempt.status, "blocked");
    assert.match(attempt.operatorVisibleResult, /not approved/i);
    assert.strictEqual(persistence.writeExecutionAttempts.length, 1);
    assert.strictEqual(
      persistence.writeExecutionAttempts[0].policyReason,
      "request_not_approved",
    );
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries).includes(
        "secret_logistics_execute_unapproved",
      ),
      false,
    );
  });

  it("scopes provider write execution attempt idempotency to each write request", async () => {
    process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH = "false";
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["issue_coupon"],
      },
    ]);
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const first = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: { orderId: "secret_order_execute_one", couponAmountCents: 1000 },
      idempotencyKey: "secret_write_execute_one",
      operatorId: "operator_1",
    });
    await service.approveProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: first.writeRequestId,
      reviewerOperatorId: "admin_2",
      reasonCode: "policy_verified",
    });
    const second = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: { orderId: "secret_order_execute_two", couponAmountCents: 2000 },
      idempotencyKey: "secret_write_execute_two",
      operatorId: "operator_1",
    });
    await service.approveProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: second.writeRequestId,
      reviewerOperatorId: "admin_2",
      reasonCode: "policy_verified",
    });

    await service.executeProviderWriteAttempt({
      tenantId: "tenant_1",
      requestId: first.writeRequestId,
      operatorId: "admin_2",
      idempotencyKey: "shared_execution_key",
    });
    const conflict = await service.executeProviderWriteAttempt({
      tenantId: "tenant_1",
      requestId: second.writeRequestId,
      operatorId: "admin_2",
      idempotencyKey: "shared_execution_key",
    });

    assert.strictEqual(conflict.status, "dry_run_recorded");
    assert.strictEqual(conflict.networkExecution, "not_started");
    assert.strictEqual(conflict.providerMutationExecuted, false);
    assert.strictEqual(conflict.customerVisibleMessageSent, false);
    assert.strictEqual(conflict.payloadEscrowOpened, false);
    assert.strictEqual(persistence.writeExecutionAttempts.length, 2);
    assert.notStrictEqual(
      persistence.writeExecutionAttempts[0].providerWriteRequestId,
      persistence.writeExecutionAttempts[1].providerWriteRequestId,
    );
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries).includes("secret_order_execute_two"),
      false,
    );
  });

  it("fails closed when provider write execution attempt idempotency is reused after request fingerprint drift", async () => {
    process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH = "false";
    process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["issue_coupon"],
      },
    ]);
    const persistence = createProviderOperationPersistence();
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const queued = await service.requestProviderWrite({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: { orderId: "secret_order_execute_drift", couponAmountCents: 1000 },
      idempotencyKey: "secret_write_execute_drift",
      operatorId: "operator_1",
    });
    await service.approveProviderWriteRequest({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      reviewerOperatorId: "admin_2",
      reasonCode: "policy_verified",
    });

    const first = await service.executeProviderWriteAttempt({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      operatorId: "admin_2",
      idempotencyKey: "secret_execution_attempt_drift",
    });
    persistence.writeRequests[0].reviewFingerprint =
      "tampered_review_fingerprint";
    const drift = await service.executeProviderWriteAttempt({
      tenantId: "tenant_1",
      requestId: queued.writeRequestId,
      operatorId: "admin_2",
      idempotencyKey: "secret_execution_attempt_drift",
    });

    assert.strictEqual(first.status, "dry_run_recorded");
    assert.strictEqual(drift.status, "failed");
    assert.match(drift.operatorVisibleResult, /idempotency/i);
    assert.strictEqual(drift.networkExecution, "not_started");
    assert.strictEqual(drift.providerMutationExecuted, false);
    assert.strictEqual(drift.customerVisibleMessageSent, false);
    assert.strictEqual(drift.payloadEscrowOpened, false);
    assert.strictEqual(persistence.writeExecutionAttempts.length, 1);
    assert.strictEqual(
      JSON.stringify(persistence.auditEntries).includes("secret_order_execute_drift"),
      false,
    );
  });

  it("lists sanitized provider write execution attempts for one tenant with filters", async () => {
    const persistence = createProviderOperationPersistence();
    persistence.seedWriteExecutionAttempt({
      id: "attempt_old",
      tenantId: "tenant_1",
      providerWriteRequestId: "provider_write_request_1",
      operatorId: "admin_1",
      channel: "taobao",
      action: "issue_coupon",
      status: "blocked",
      idempotencyKeyHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      requestHash:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      attemptFingerprint:
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      policyReason: "execution_kill_switch_enabled",
      createdAt: new Date("2026-06-06T00:00:00.000Z"),
    });
    persistence.seedWriteExecutionAttempt({
      id: "attempt_latest",
      tenantId: "tenant_1",
      providerWriteRequestId: "provider_write_request_2",
      operatorId: "admin_2",
      channel: "douyin",
      action: "urge_logistics",
      status: "dry_run_recorded",
      idempotencyKeyHash:
        "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      requestHash:
        "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      attemptFingerprint:
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      policyReason: null,
      createdAt: new Date("2026-06-06T00:05:00.000Z"),
    });
    persistence.seedWriteExecutionAttempt({
      id: "attempt_other_tenant",
      tenantId: "tenant_2",
      providerWriteRequestId: "provider_write_request_3",
      operatorId: "admin_3",
      channel: "taobao",
      action: "modify_address",
      status: "blocked",
      idempotencyKeyHash:
        "1111111111111111111111111111111111111111111111111111111111111111",
      requestHash:
        "2222222222222222222222222222222222222222222222222222222222222222",
      attemptFingerprint:
        "3333333333333333333333333333333333333333333333333333333333333333",
      policyReason: "request_not_approved",
      createdAt: new Date("2026-06-06T00:10:00.000Z"),
    });
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const attempts = await service.listProviderWriteExecutionAttempts({
      tenantId: "tenant_1",
      limit: 10,
    });
    const filtered = await service.listProviderWriteExecutionAttempts({
      tenantId: "tenant_1",
      status: "blocked",
      providerWriteRequestId: "provider_write_request_1",
      limit: 10,
    });

    assert.deepStrictEqual(
      attempts.map((attempt) => attempt.id),
      ["attempt_latest", "attempt_old"],
    );
    assert.strictEqual(attempts[0].networkExecution, "not_started");
    assert.strictEqual(attempts[0].providerMutationExecuted, false);
    assert.strictEqual(attempts[0].customerVisibleMessageSent, false);
    assert.strictEqual(attempts[0].payloadEscrowStatus, "not_stored");
    assert.strictEqual(attempts[0].payloadEscrowOpened, false);
    assert.strictEqual(attempts[0].requestFingerprint, "eeeeeeeeeeee");
    assert.strictEqual(attempts[0].attemptFingerprint, "ffffffffffff");
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, "attempt_old");
    assert.strictEqual("requestHash" in attempts[0], false);
    assert.strictEqual("idempotencyKeyHash" in attempts[0], false);
    assert.strictEqual(JSON.stringify(attempts).includes("tenant_2"), false);
    assert.strictEqual(
      JSON.stringify(attempts).includes(
        "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      ),
      false,
    );
  });

  it("exports a sanitized provider write live pilot run ledger draft", async () => {
    const persistence = createProviderOperationPersistence();
    persistence.seedWriteRequest({
      id: "provider_write_request_1",
      tenantId: "tenant_1",
      operatorId: "operator_1",
      caseId: "case_1",
      channel: "taobao",
      action: "issue_coupon",
      status: "approved",
      requestHash: testSha256("request_1"),
      reviewFingerprint: testSha256("review_1"),
    });
    persistence.seedWriteExecutionAttempt({
      id: "attempt_1",
      tenantId: "tenant_1",
      providerWriteRequestId: "provider_write_request_1",
      operatorId: "admin_1",
      channel: "taobao",
      action: "issue_coupon",
      status: "dry_run_recorded",
      idempotencyKeyHash: testSha256("secret_idem_1"),
      requestHash: testSha256("attempt_request_1"),
      attemptFingerprint: testSha256("attempt_1"),
      policyReason: null,
      createdAt: new Date("2026-06-08T10:15:00.000Z"),
    });
    persistence.seedWriteExecutionAttempt({
      id: "attempt_other_tenant",
      tenantId: "tenant_2",
      providerWriteRequestId: "provider_write_request_2",
      operatorId: "admin_2",
      channel: "taobao",
      action: "issue_coupon",
      status: "blocked",
      idempotencyKeyHash: testSha256("secret_idem_2"),
      requestHash: testSha256("attempt_request_2"),
      attemptFingerprint: testSha256("attempt_2"),
      policyReason: "execution_kill_switch_enabled",
      createdAt: new Date("2026-06-08T10:20:00.000Z"),
    });
    const adapter = new PoisonTaobaoAdapter();
    const service = new OpsService(
      new ProviderAdapterRegistry(adapter),
      persistence.prisma,
      persistence.audit,
    );

    const draft = await service.getProviderWriteLivePilotRunLedgerDraft({
      tenantId: "tenant_1",
      channel: "taobao",
      from: new Date("2026-06-08T10:00:00.000Z"),
      to: new Date("2026-06-08T11:00:00.000Z"),
      now: new Date("2026-06-08T11:15:00.000Z"),
      freezeWindowActive: true,
      changeTicket: "chg-20260608-live-pilot",
    });

    ProviderWriteLivePilotRunLedgerDraftSchema.parse(draft);
    assert.strictEqual(
      draft.schemaVersion,
      "smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1",
    );
    assert.strictEqual(draft.target.channel, "taobao");
    assert.match(draft.target.tenantFingerprint, /^[a-f0-9]{12}$/);
    assert.match(draft.target.changeTicketFingerprint ?? "", /^[a-f0-9]{12}$/);
    assert.strictEqual(draft.summary.totalRuns, 1);
    assert.strictEqual(draft.summary.dryRunRecordedRuns, 1);
    assert.strictEqual(draft.summary.readyForSafeLedger, false);
    assert.deepStrictEqual(draft.summary.missingSafeLedgerInputs, [
      "artifact_bindings",
      "live_provider_mutation_evidence",
      "manual_closeout_review",
    ]);
    assert.strictEqual(draft.runRecords.length, 1);
    assert.strictEqual(draft.runRecords[0].riskLevel, "low");
    assert.strictEqual(draft.runRecords[0].status, "dry_run_recorded");
    assert.strictEqual(draft.runRecords[0].networkExecution, "not_started");
    assert.strictEqual(draft.runRecords[0].providerMutationExecuted, false);
    assert.strictEqual(draft.runRecords[0].customerVisibleMessageSent, false);
    assert.strictEqual(draft.runRecords[0].payloadEscrowOpened, false);
    assert.match(draft.runRecords[0].runFingerprint, /^[a-f0-9]{64}$/);
    assert.match(draft.runRecords[0].requestFingerprint, /^[a-f0-9]{12}$/);
    assert.match(
      draft.runRecords[0].executionAttemptFingerprint,
      /^[a-f0-9]{12}$/,
    );
    assert.match(draft.runRecords[0].operatorFingerprint ?? "", /^[a-f0-9]{12}$/);
    assert.match(draft.runRecords[0].reviewerFingerprint ?? "", /^[a-f0-9]{12}$/);
    assert.strictEqual(draft.evidenceReadiness.draftOnly, true);
    assert.strictEqual(draft.evidenceReadiness.canPassPr69SafeLedger, false);
    assert.strictEqual(draft.safety.networkExecutedByExporter, false);
    assert.strictEqual(draft.safety.providerWriteExecutedByExporter, false);
    assert.strictEqual(adapter.writeCallCount, 0);
    const serialized = JSON.stringify(draft);
    assert.strictEqual(serialized.includes("tenant_1"), false);
    assert.strictEqual(serialized.includes("provider_write_request_1"), false);
    assert.strictEqual(serialized.includes("secret_idem_1"), false);
    assert.strictEqual(serialized.includes("secret_idem_2"), false);
    assert.strictEqual(serialized.includes("tenant_2"), false);

    const missingLiveEvidence = structuredClone(draft);
    missingLiveEvidence.summary.missingSafeLedgerInputs = ["artifact_bindings"];
    assert.throws(() =>
      ProviderWriteLivePilotRunLedgerDraftSchema.parse(missingLiveEvidence),
    );

    const unsafePolicyReason = structuredClone(draft);
    (unsafePolicyReason.runRecords[0] as { policyReason: unknown }).policyReason =
      "customer mentioned raw order order_123";
    assert.throws(() =>
      ProviderWriteLivePilotRunLedgerDraftSchema.parse(unsafePolicyReason),
    );

    const emptyWithoutPilotRecords = structuredClone(draft);
    emptyWithoutPilotRecords.summary.totalRuns = 0;
    emptyWithoutPilotRecords.summary.dryRunRecordedRuns = 0;
    emptyWithoutPilotRecords.runRecords = [];
    emptyWithoutPilotRecords.summary.missingSafeLedgerInputs = [
      "artifact_bindings",
      "live_provider_mutation_evidence",
      "manual_closeout_review",
    ];
    assert.throws(() =>
      ProviderWriteLivePilotRunLedgerDraftSchema.parse(emptyWithoutPilotRecords),
    );
  });

  it("keeps provider write live pilot run ledger drafts inside the requested channel and window", async () => {
    const persistence = createProviderOperationPersistence();
    persistence.seedWriteExecutionAttempt({
      id: "attempt_inside",
      tenantId: "tenant_1",
      providerWriteRequestId: "provider_write_request_1",
      operatorId: "admin_1",
      channel: "taobao",
      action: "modify_address",
      status: "blocked",
      idempotencyKeyHash: testSha256("inside"),
      requestHash: testSha256("inside_request"),
      attemptFingerprint: testSha256("inside_attempt"),
      policyReason: "execution_kill_switch_enabled",
      createdAt: new Date("2026-06-08T10:30:00.000Z"),
    });
    persistence.seedWriteExecutionAttempt({
      id: "attempt_before_window",
      tenantId: "tenant_1",
      providerWriteRequestId: "provider_write_request_2",
      operatorId: "admin_1",
      channel: "taobao",
      action: "modify_address",
      status: "blocked",
      idempotencyKeyHash: testSha256("before"),
      requestHash: testSha256("before_request"),
      attemptFingerprint: testSha256("before_attempt"),
      policyReason: "execution_kill_switch_enabled",
      createdAt: new Date("2026-06-08T09:30:00.000Z"),
    });
    persistence.seedWriteExecutionAttempt({
      id: "attempt_other_channel",
      tenantId: "tenant_1",
      providerWriteRequestId: "provider_write_request_3",
      operatorId: "admin_1",
      channel: "douyin",
      action: "modify_address",
      status: "blocked",
      idempotencyKeyHash: testSha256("other_channel"),
      requestHash: testSha256("other_channel_request"),
      attemptFingerprint: testSha256("other_channel_attempt"),
      policyReason: "execution_kill_switch_enabled",
      createdAt: new Date("2026-06-08T10:40:00.000Z"),
    });
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const draft = await service.getProviderWriteLivePilotRunLedgerDraft({
      tenantId: "tenant_1",
      channel: "taobao",
      from: new Date("2026-06-08T10:00:00.000Z"),
      to: new Date("2026-06-08T11:00:00.000Z"),
      now: new Date("2026-06-08T11:15:00.000Z"),
      freezeWindowActive: true,
    });

    assert.strictEqual(draft.summary.totalRuns, 1);
    assert.strictEqual(draft.summary.blockedRuns, 1);
    assert.strictEqual(draft.runRecords[0].createdAt, "2026-06-08T10:30:00.000Z");
    const serialized = JSON.stringify(draft);
    assert.strictEqual(serialized.includes("attempt_before_window"), false);
    assert.strictEqual(serialized.includes("attempt_other_channel"), false);
  });

  it("fails closed instead of truncating provider write live pilot run ledger drafts", async () => {
    const persistence = createProviderOperationPersistence();
    for (let index = 0; index < 51; index += 1) {
      persistence.seedWriteExecutionAttempt({
        id: `attempt_${index}`,
        tenantId: "tenant_1",
        providerWriteRequestId: `provider_write_request_${index}`,
        operatorId: "admin_1",
        channel: "taobao",
        action: "issue_coupon",
        status: "blocked",
        idempotencyKeyHash: testSha256(`idempotency_${index}`),
        requestHash: testSha256(`request_${index}`),
        attemptFingerprint: testSha256(`attempt_${index}`),
        policyReason: "execution_kill_switch_enabled",
        createdAt: new Date(`2026-06-08T10:${String(index).padStart(2, "0")}:00.000Z`),
      });
    }
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    await assert.rejects(
      () =>
        service.getProviderWriteLivePilotRunLedgerDraft({
          tenantId: "tenant_1",
          channel: "taobao",
          from: new Date("2026-06-08T10:00:00.000Z"),
          to: new Date("2026-06-08T11:00:00.000Z"),
          now: new Date("2026-06-08T11:15:00.000Z"),
          freezeWindowActive: true,
        }),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.strictEqual(error.getStatus(), 400);
        return true;
      },
    );
  });

  it("does not import review metadata from provider write requests in another channel", async () => {
    const persistence = createProviderOperationPersistence();
    persistence.seedWriteRequest({
      id: "provider_write_request_cross_channel",
      tenantId: "tenant_1",
      operatorId: "operator_1",
      caseId: "case_1",
      channel: "douyin",
      action: "issue_coupon",
      status: "approved",
      requestHash: testSha256("request_cross_channel"),
      reviewFingerprint: testSha256("review_cross_channel"),
    });
    persistence.seedWriteExecutionAttempt({
      id: "attempt_cross_channel",
      tenantId: "tenant_1",
      providerWriteRequestId: "provider_write_request_cross_channel",
      operatorId: "admin_1",
      channel: "taobao",
      action: "issue_coupon",
      status: "blocked",
      idempotencyKeyHash: testSha256("cross_channel"),
      requestHash: testSha256("cross_channel_request"),
      attemptFingerprint: testSha256("cross_channel_attempt"),
      policyReason: "execution_kill_switch_enabled",
      createdAt: new Date("2026-06-08T10:30:00.000Z"),
    });
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
    );

    const draft = await service.getProviderWriteLivePilotRunLedgerDraft({
      tenantId: "tenant_1",
      channel: "taobao",
      from: new Date("2026-06-08T10:00:00.000Z"),
      to: new Date("2026-06-08T11:00:00.000Z"),
      now: new Date("2026-06-08T11:15:00.000Z"),
      freezeWindowActive: true,
    });

    assert.strictEqual(draft.summary.totalRuns, 1);
    assert.strictEqual(draft.summary.allRunsReviewed, false);
    assert.strictEqual(draft.runRecords[0].reviewerFingerprint, null);
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

  it("audits readonly sandbox harness execution without network or provider data", async () => {
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
        PROVIDER_CREDENTIALS: JSON.stringify([{ credentialRef }]),
      }),
    );
    const harness = new ProviderReadonlyClientHarnessService({
      PROVIDER_READ_TIMEOUT_MS: "2500",
      PROVIDER_READ_MAX_RETRIES: "2",
    });
    const service = new OpsService(
      new ProviderAdapterRegistry(),
      persistence.prisma,
      persistence.audit,
      credentialResolver,
      harness,
    );

    const response = await service.executeProviderRead({
      caseId: "case_1",
      tenantId: "tenant_1",
      channel: "taobao",
      readCapability: "query_logistics",
      lookup: { orderId: "order_harness_must_not_leak" },
      idempotencyKey: "read_harness_audit",
      operatorId: "operator_1",
    });

    assert.strictEqual(response.status, "policy_accepted");
    assert.strictEqual(response.networkExecution, "not_implemented");
    assert.strictEqual(response.providerDataReturned, false);
    const auditDetails = persistence.auditEntries[0].details as {
      providerReadExecution?: {
        executionMode?: string;
        providerRequestPrepared?: boolean;
        networkAttempted?: boolean;
        providerDataReturned?: boolean;
        timeoutMs?: number;
        maxRetries?: number;
      };
    };
    assert.deepStrictEqual(auditDetails.providerReadExecution, {
      executionMode: "sandbox_noop",
      credentialResolutionStatus: "configured",
      credentialRefConfigured: true,
      providerRequestPrepared: true,
      networkExecution: "not_implemented",
      networkAttempted: false,
      providerDataReturned: false,
      providerResponseCaptured: false,
      attemptCount: 0,
      timeoutMs: 2500,
      maxRetries: 2,
      reason:
        "Readonly provider request prepared for sandbox harness; provider network execution is not implemented in this build.",
    });
    const serializedEvidence = JSON.stringify({
      response,
      runs: persistence.runs,
      auditEntries: persistence.auditEntries,
    });
    assert.strictEqual(serializedEvidence.includes("order_harness_must_not_leak"), false);
    assert.strictEqual(serializedEvidence.includes("credential_ref_must_not_leak"), false);
    assert.strictEqual(serializedEvidence.includes("secret://"), false);
    assert.strictEqual(serializedEvidence.includes("providerPayload"), false);
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

type ProviderWriteRequestRecord = {
  id: string;
  tenantId: string;
  operatorId: string | null;
  caseId: string;
  channel: string;
  action: string;
  idempotencyKeyHash: string;
  payloadHash: string;
  payloadKeys: unknown;
  requestHash: string;
  status: string;
  networkExecution: string;
  providerMutationExecuted: boolean;
  customerVisibleMessageSent: boolean;
  operatorVisibleResult: string;
  policyReason: string | null;
  reviewerOperatorId: string | null;
  reviewedAt: Date | null;
  reviewReasonCode: string | null;
  reviewFingerprint: string | null;
  payloadEscrowStatus: string;
  payloadEscrowFingerprint: string | null;
  payloadEscrowEnvelopeFingerprint: string | null;
  payloadEscrowMode: string | null;
  payloadEscrowCreatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProviderWriteExecutionAttemptRecord = {
  id: string;
  tenantId: string;
  providerWriteRequestId: string;
  operatorId: string | null;
  channel: string;
  action: string;
  status: "dry_run_recorded" | "blocked" | "failed";
  idempotencyKeyHash: string;
  requestHash: string;
  attemptFingerprint: string;
  payloadEscrowStatus: string;
  payloadEscrowOpened: boolean;
  networkExecution: string;
  providerMutationExecuted: boolean;
  customerVisibleMessageSent: boolean;
  operatorVisibleResult: string;
  policyReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProviderWriteKillSwitchEventRecord = {
  id: string;
  tenantId: string;
  operatorId: string | null;
  action: "engage" | "release";
  reasonCode:
    | "incident_response"
    | "provider_anomaly"
    | "operator_error"
    | "launch_rehearsal"
    | "post_incident_restore";
  idempotencyKeyHash: string;
  stateFingerprint: string;
  envKillSwitchEnabled: boolean;
  emergencyStopEngaged: boolean;
  effectiveKillSwitchEnabled: boolean;
  networkExecution: string;
  providerMutationExecuted: boolean;
  customerVisibleMessageSent: boolean;
  createdAt: Date;
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

type SeedProviderWriteExecutionAttemptInput = {
  id: string;
  tenantId: string;
  providerWriteRequestId: string;
  operatorId: string | null;
  channel: string;
  action: string;
  status: "dry_run_recorded" | "blocked" | "failed";
  idempotencyKeyHash: string;
  requestHash: string;
  attemptFingerprint: string;
  policyReason: string | null;
  createdAt: Date;
};

type SeedProviderWriteRequestInput = {
  id: string;
  tenantId: string;
  operatorId: string | null;
  caseId: string;
  channel: string;
  action: string;
  status: string;
  requestHash: string;
  reviewFingerprint: string | null;
};

type SeedProviderWriteKillSwitchEventInput = {
  tenantId: string;
  operatorId: string | null;
  action: "engage" | "release";
  reasonCode: ProviderWriteKillSwitchEventRecord["reasonCode"];
  idempotencyKeyHash: string;
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

function createProviderOperationPersistence(
  options: {
    cases?: ProviderReadCaseRecord[];
  } = {},
) {
  const writeRequests: ProviderWriteRequestRecord[] = [];
  const writeExecutionAttempts: ProviderWriteExecutionAttemptRecord[] = [];
  const killSwitchEvents: ProviderWriteKillSwitchEventRecord[] = [];
  const cases = options.cases ?? [{ id: "case_1", merchantId: "tenant_1" }];
  const auditEntries: Array<{
    caseId: string | null;
    action: string;
    details: unknown;
  }> = [];
  const seedWriteExecutionAttempt = (
    input: SeedProviderWriteExecutionAttemptInput,
  ) => {
    writeExecutionAttempts.push({
      id: input.id,
      tenantId: input.tenantId,
      providerWriteRequestId: input.providerWriteRequestId,
      operatorId: input.operatorId,
      channel: input.channel,
      action: input.action,
      status: input.status,
      idempotencyKeyHash: input.idempotencyKeyHash,
      requestHash: input.requestHash,
      attemptFingerprint: input.attemptFingerprint,
      payloadEscrowStatus: "not_stored",
      payloadEscrowOpened: false,
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      operatorVisibleResult: "seeded",
      policyReason: input.policyReason,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
  };
  const seedWriteRequest = (input: SeedProviderWriteRequestInput) => {
    writeRequests.push({
      id: input.id,
      tenantId: input.tenantId,
      operatorId: input.operatorId,
      caseId: input.caseId,
      channel: input.channel,
      action: input.action,
      idempotencyKeyHash: testSha256(`${input.id}:idempotency`),
      payloadHash: testSha256(`${input.id}:payload`),
      payloadKeys: {
        hasOrderId: false,
        hasLogisticsId: false,
        hasAddressFingerprint: false,
        hasCouponAmountCents: input.action === "issue_coupon",
      },
      requestHash: input.requestHash,
      status: input.status,
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      operatorVisibleResult: "seeded",
      policyReason: null,
      reviewerOperatorId: "reviewer_1",
      reviewedAt: new Date("2026-06-06T00:01:00.000Z"),
      reviewReasonCode: "policy_verified",
      reviewFingerprint: input.reviewFingerprint,
      payloadEscrowStatus: "not_stored",
      payloadEscrowFingerprint: testSha256(`${input.id}:escrow`),
      payloadEscrowEnvelopeFingerprint: null,
      payloadEscrowMode: "disabled",
      payloadEscrowCreatedAt: null,
      createdAt: new Date("2026-06-06T00:00:00.000Z"),
      updatedAt: new Date("2026-06-06T00:01:00.000Z"),
    });
  };
  const seedKillSwitchEvent = (input: SeedProviderWriteKillSwitchEventInput) => {
    const emergencyStopEngaged = input.action === "engage";
    const envKillSwitchEnabled = process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH !== "false";
    const effectiveKillSwitchEnabled =
      envKillSwitchEnabled || emergencyStopEngaged;
    killSwitchEvents.push({
      id: `provider_write_kill_switch_event_${killSwitchEvents.length + 1}`,
      tenantId: input.tenantId,
      operatorId: input.operatorId,
      action: input.action,
      reasonCode: input.reasonCode,
      idempotencyKeyHash: input.idempotencyKeyHash,
      stateFingerprint: testSha256(
        stableTestJson({
          tenantId: input.tenantId,
          action: input.action,
          reasonCode: input.reasonCode,
          idempotencyKeyHash: input.idempotencyKeyHash,
        }),
      ),
      envKillSwitchEnabled,
      emergencyStopEngaged,
      effectiveKillSwitchEnabled,
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      createdAt: input.createdAt ?? new Date("2026-06-06T00:03:00.000Z"),
    });
  };

  const persistence = {
    writeRequests,
    writeExecutionAttempts,
    killSwitchEvents,
    auditEntries,
    seedWriteExecutionAttempt,
    seedWriteRequest,
    seedKillSwitchEvent,
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
      providerWriteRequest: {
        findMany: async ({
          where,
          orderBy,
          take,
        }: {
          where?: ProviderWriteRequestWhere;
          orderBy?: { createdAt?: "asc" | "desc" };
          take?: number;
        }) => {
          const sorted = filterWriteRequests(writeRequests, where).sort(
            (left, right) => {
              const direction = orderBy?.createdAt === "asc" ? 1 : -1;
              return direction * (left.createdAt.getTime() - right.createdAt.getTime());
            },
          );
          return take === undefined ? sorted : sorted.slice(0, take);
        },
        findUnique: async ({
          where,
        }: {
          where: {
            tenantId_idempotencyKeyHash: {
              tenantId: string;
              idempotencyKeyHash: string;
            };
          };
        }) =>
          writeRequests.find(
            (item) =>
              item.tenantId === where.tenantId_idempotencyKeyHash.tenantId &&
              item.idempotencyKeyHash ===
                where.tenantId_idempotencyKeyHash.idempotencyKeyHash,
          ) ?? null,
        findFirst: async ({
          where,
        }: {
          where?: ProviderWriteRequestWhere;
        }) => filterWriteRequests(writeRequests, where)[0] ?? null,
        create: async ({
          data,
        }: {
          data: Omit<ProviderWriteRequestRecord, "id" | "createdAt" | "updatedAt">;
        }) => {
          const existing = writeRequests.find(
            (item) =>
              item.tenantId === data.tenantId &&
              item.idempotencyKeyHash === data.idempotencyKeyHash,
          );
          if (existing) {
            const error = new Error("Unique constraint failed");
            Object.assign(error, { code: "P2002" });
            throw error;
          }
          const row = {
            id: `provider_write_request_${writeRequests.length + 1}`,
            ...data,
            createdAt: new Date("2026-06-06T00:00:00.000Z"),
            updatedAt: new Date("2026-06-06T00:00:00.000Z"),
          };
          writeRequests.push(row);
          return row;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where?: ProviderWriteRequestWhere;
          data: Partial<ProviderWriteRequestRecord>;
        }) => {
          const matches = filterWriteRequests(writeRequests, where);
          for (const row of matches) {
            Object.assign(row, data, {
              updatedAt: new Date("2026-06-06T00:01:00.000Z"),
            });
          }
          return { count: matches.length };
        },
      },
      providerWriteExecutionAttempt: {
        findMany: async ({
          where,
          orderBy,
          take,
        }: {
          where?: ProviderWriteExecutionAttemptWhere;
          orderBy?: { createdAt?: "asc" | "desc" };
          take?: number;
        }) => {
          const sorted = filterWriteExecutionAttempts(
            writeExecutionAttempts,
            where,
          ).sort((left, right) => {
            const direction = orderBy?.createdAt === "asc" ? 1 : -1;
            return direction * (left.createdAt.getTime() - right.createdAt.getTime());
          });
          return take === undefined ? sorted : sorted.slice(0, take);
        },
        findUnique: async ({
          where,
        }: {
          where: {
            tenantId_providerWriteRequestId_idempotencyKeyHash: {
              tenantId: string;
              providerWriteRequestId: string;
              idempotencyKeyHash: string;
            };
          };
        }) =>
          writeExecutionAttempts.find(
            (item) =>
              item.tenantId ===
                where.tenantId_providerWriteRequestId_idempotencyKeyHash
                  .tenantId &&
              item.providerWriteRequestId ===
                where.tenantId_providerWriteRequestId_idempotencyKeyHash
                  .providerWriteRequestId &&
              item.idempotencyKeyHash ===
                where.tenantId_providerWriteRequestId_idempotencyKeyHash
                  .idempotencyKeyHash,
          ) ?? null,
        create: async ({
          data,
        }: {
          data: Omit<
            ProviderWriteExecutionAttemptRecord,
            "id" | "createdAt" | "updatedAt"
          >;
        }) => {
          const existing = writeExecutionAttempts.find(
            (item) =>
              item.tenantId === data.tenantId &&
              item.providerWriteRequestId === data.providerWriteRequestId &&
              item.idempotencyKeyHash === data.idempotencyKeyHash,
          );
          if (existing) {
            const error = new Error("Unique constraint failed");
            Object.assign(error, { code: "P2002" });
            throw error;
          }
          const row = {
            id: `provider_write_execution_attempt_${
              writeExecutionAttempts.length + 1
            }`,
            ...data,
            createdAt: new Date("2026-06-06T00:02:00.000Z"),
            updatedAt: new Date("2026-06-06T00:02:00.000Z"),
          };
          writeExecutionAttempts.push(row);
          return row;
        },
      },
      providerWriteKillSwitchEvent: {
        findFirst: async ({
          where,
          orderBy,
        }: {
          where: { tenantId: string };
          orderBy?: { createdAt?: "asc" | "desc" };
        }) => {
          const matches = killSwitchEvents
            .filter((item) => item.tenantId === where.tenantId)
            .sort((left, right) => {
              const direction = orderBy?.createdAt === "asc" ? 1 : -1;
              return direction * (left.createdAt.getTime() - right.createdAt.getTime());
            });
          return matches[0] ?? null;
        },
        findUnique: async ({
          where,
        }: {
          where: {
            tenantId_idempotencyKeyHash: {
              tenantId: string;
              idempotencyKeyHash: string;
            };
          };
        }) =>
          killSwitchEvents.find(
            (item) =>
              item.tenantId === where.tenantId_idempotencyKeyHash.tenantId &&
              item.idempotencyKeyHash ===
                where.tenantId_idempotencyKeyHash.idempotencyKeyHash,
          ) ?? null,
        create: async ({
          data,
        }: {
          data: Omit<ProviderWriteKillSwitchEventRecord, "id" | "createdAt">;
        }) => {
          const existing = killSwitchEvents.find(
            (item) =>
              item.tenantId === data.tenantId &&
              item.idempotencyKeyHash === data.idempotencyKeyHash,
          );
          if (existing) {
            const error = new Error("Unique constraint failed");
            Object.assign(error, { code: "P2002" });
            throw error;
          }
          const row = {
            id: `provider_write_kill_switch_event_${killSwitchEvents.length + 1}`,
            ...data,
            createdAt: new Date("2026-06-06T00:03:00.000Z"),
          };
          killSwitchEvents.push(row);
          return row;
        },
      },
    } as unknown as PrismaService,
    audit: {
      log: async (caseId: string | null, action: string, details: unknown) => {
        auditEntries.push({ caseId, action, details });
      },
    } as unknown as AuditService,
  };
  return persistence;
}

class PoisonTaobaoAdapter extends MockTaobaoAdapter {
  readCallCount = 0;
  writeCallCount = 0;

  override async getOrder(): Promise<null> {
    this.readCallCount += 1;
    throw new Error("provider getOrder must not be called");
  }

  override async queryLogistics(): Promise<{ status: string; detail: string } | null> {
    this.readCallCount += 1;
    throw new Error("provider queryLogistics must not be called");
  }

  override async changeAddress(): Promise<boolean> {
    this.writeCallCount += 1;
    throw new Error("provider changeAddress must not be called");
  }

  override async issueCoupon(): Promise<boolean> {
    this.writeCallCount += 1;
    throw new Error("provider issueCoupon must not be called");
  }

  override async sendMessage(): Promise<boolean> {
    this.writeCallCount += 1;
    throw new Error("provider sendMessage must not be called");
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

type ProviderWriteRequestWhere = {
  id?: string;
  tenantId?: string;
  status?: string;
  channel?: string;
};

type ProviderWriteExecutionAttemptWhere = {
  tenantId?: string;
  channel?: string;
  status?: string;
  providerWriteRequestId?: string;
  createdAt?: {
    gte?: Date;
    lte?: Date;
  };
};

function filterWriteRequests(
  writeRequests: ProviderWriteRequestRecord[],
  where: ProviderWriteRequestWhere | undefined,
) {
  return writeRequests.filter((request) => {
    if (where?.id && request.id !== where.id) return false;
    if (where?.tenantId && request.tenantId !== where.tenantId) return false;
    if (where?.status && request.status !== where.status) return false;
    if (where?.channel && request.channel !== where.channel) return false;
    return true;
  });
}

function filterWriteExecutionAttempts(
  attempts: ProviderWriteExecutionAttemptRecord[],
  where: ProviderWriteExecutionAttemptWhere | undefined,
) {
  return attempts.filter((attempt) => {
    if (where?.tenantId && attempt.tenantId !== where.tenantId) return false;
    if (where?.channel && attempt.channel !== where.channel) return false;
    if (where?.status && attempt.status !== where.status) return false;
    if (
      where?.providerWriteRequestId &&
      attempt.providerWriteRequestId !== where.providerWriteRequestId
    ) {
      return false;
    }
    if (where?.createdAt?.gte && attempt.createdAt < where.createdAt.gte) {
      return false;
    }
    if (where?.createdAt?.lte && attempt.createdAt > where.createdAt.lte) {
      return false;
    }
    return true;
  });
}
