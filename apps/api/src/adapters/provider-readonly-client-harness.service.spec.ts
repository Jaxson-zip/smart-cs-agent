import assert from "node:assert";
import { describe, it } from "node:test";
import type { ProviderReadRequest } from "@smart-cs-agent/shared";
import type { ProviderCredentialResolution } from "./provider-credential-resolver.service";
import { ProviderReadonlyClientHarnessService } from "./provider-readonly-client-harness.service";

describe("ProviderReadonlyClientHarnessService", () => {
  const request: ProviderReadRequest = {
    caseId: "case_1",
    tenantId: "tenant_1",
    channel: "taobao",
    readCapability: "get_order",
    lookup: { orderId: "order_must_not_leak" },
    idempotencyKey: "read_harness_1",
    operatorId: "operator_1",
  };
  const configuredCredential: ProviderCredentialResolution = {
    status: "configured",
    source: "secret",
    credentialRefFingerprint: "credential_ref_fingerprint_123",
    credentialRefConfigured: true,
    credentialMaterialLoaded: false,
    secretValueReturned: false,
    reason: "configured in test",
  };

  it("creates a no-network sandbox execution plan for configured readonly refs", async () => {
    const harness = new ProviderReadonlyClientHarnessService({
      PROVIDER_READ_TIMEOUT_MS: "2500",
      PROVIDER_READ_MAX_RETRIES: "2",
    });

    const result = await harness.planReadonlyRead({
      request,
      credentialResolution: configuredCredential,
    });

    assert.deepStrictEqual(result, {
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
    const serialized = JSON.stringify(result);
    assert.strictEqual(serialized.includes("order_must_not_leak"), false);
    assert.strictEqual(serialized.includes("credential_ref_fingerprint_123"), false);
    assert.strictEqual(serialized.includes("secret://"), false);
  });

  it("does not prepare a provider request when credentials are not ready", async () => {
    const harness = new ProviderReadonlyClientHarnessService({});

    const result = await harness.planReadonlyRead({
      request,
      credentialResolution: {
        ...configuredCredential,
        status: "missing",
        credentialRefConfigured: false,
      },
    });

    assert.strictEqual(result.executionMode, "credential_not_ready");
    assert.strictEqual(result.credentialResolutionStatus, "missing");
    assert.strictEqual(result.credentialRefConfigured, false);
    assert.strictEqual(result.providerRequestPrepared, false);
    assert.strictEqual(result.networkAttempted, false);
    assert.strictEqual(result.providerDataReturned, false);
    assert.strictEqual(result.providerResponseCaptured, false);
    assert.strictEqual(result.timeoutMs, 5000);
    assert.strictEqual(result.maxRetries, 0);
  });
});
