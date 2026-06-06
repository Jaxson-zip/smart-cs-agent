import assert from "node:assert";
import { describe, it } from "node:test";
import { ProviderCredentialResolverService } from "./provider-credential-resolver.service";
import { ProviderCredentialStoreService } from "./provider-credential-store.service";

describe("ProviderCredentialResolverService", () => {
  it("returns only sanitized credential resolution metadata", async () => {
    const resolver = new ProviderCredentialResolverService();
    const credentialRef =
      "secret://smartcs/taobao/tenant_1/credential_ref_must_not_leak";

    const result = await resolver.resolve({
      tenantId: "tenant_1",
      channel: "taobao",
      credentialRef,
    });

    assert.strictEqual(result.status, "not_implemented");
    assert.strictEqual(result.credentialRefConfigured, false);
    assert.strictEqual(result.credentialMaterialLoaded, false);
    assert.strictEqual(result.secretValueReturned, false);
    assert.strictEqual(result.source, "secret");
    assert.match(result.credentialRefFingerprint, /^[a-f0-9]{12}$/);
    const serialized = JSON.stringify(result);
    assert.strictEqual(serialized.includes("credential_ref_must_not_leak"), false);
    assert.strictEqual(serialized.includes("secret://"), false);
    assert.strictEqual(serialized.includes("actual_provider_token"), false);
  });

  it("detects configured provider credential refs without loading material", async () => {
    const resolver = new ProviderCredentialResolverService(
      new ProviderCredentialStoreService({
        PROVIDER_CREDENTIALS: JSON.stringify([
          {
            credentialRef: "secret://smartcs/taobao/tenant_1",
          },
        ]),
      }),
    );

    const result = await resolver.resolve({
      tenantId: "tenant_1",
      channel: "taobao",
      credentialRef: "secret://smartcs/taobao/tenant_1",
    });

    assert.strictEqual(result.status, "configured");
    assert.strictEqual(result.credentialRefConfigured, true);
    assert.strictEqual(result.credentialMaterialLoaded, false);
    assert.strictEqual(result.secretValueReturned, false);
    const serialized = JSON.stringify(result);
    assert.strictEqual(serialized.includes("actual_provider_token_must_not_leak"), false);
    assert.strictEqual(serialized.includes("secret://smartcs/taobao/tenant_1"), false);
  });

  it("reports missing or invalid credential store state without leaking input", async () => {
    const missingResolver = new ProviderCredentialResolverService(
      new ProviderCredentialStoreService({
        PROVIDER_CREDENTIALS: JSON.stringify([
          {
            credentialRef: "secret://smartcs/taobao/tenant_other",
          },
        ]),
      }),
    );
    const invalidResolver = new ProviderCredentialResolverService(
      new ProviderCredentialStoreService({
        PROVIDER_CREDENTIALS: "{not-json",
      }),
    );

    const missing = await missingResolver.resolve({
      tenantId: "tenant_1",
      channel: "taobao",
      credentialRef: "secret://smartcs/taobao/tenant_1",
    });
    const invalid = await invalidResolver.resolve({
      tenantId: "tenant_1",
      channel: "taobao",
      credentialRef: "secret://smartcs/taobao/tenant_1",
    });

    assert.strictEqual(missing.status, "missing");
    assert.strictEqual(missing.credentialRefConfigured, false);
    assert.strictEqual(missing.credentialMaterialLoaded, false);
    assert.strictEqual(invalid.status, "invalid");
    assert.strictEqual(invalid.credentialRefConfigured, false);
    assert.strictEqual(invalid.credentialMaterialLoaded, false);
    const serialized = JSON.stringify({ missing, invalid });
    assert.strictEqual(serialized.includes("actual_provider_token_must_not_leak"), false);
    assert.strictEqual(serialized.includes("{not-json"), false);
    assert.strictEqual(serialized.includes("secret://"), false);
  });

  it("reports malformed credential refs as invalid without echoing them", async () => {
    const resolver = new ProviderCredentialResolverService(
      new ProviderCredentialStoreService({
        PROVIDER_CREDENTIALS: JSON.stringify([
          { credentialRef: "secret://smartcs/taobao/tenant_1" },
        ]),
      }),
    );

    const result = await resolver.resolve({
      tenantId: "tenant_1",
      channel: "taobao",
      credentialRef: "actual_provider_token_must_not_leak",
    });

    assert.strictEqual(result.status, "invalid");
    assert.strictEqual(result.source, "unknown");
    assert.strictEqual(result.credentialRefConfigured, false);
    assert.strictEqual(result.credentialMaterialLoaded, false);
    assert.strictEqual(result.secretValueReturned, false);
    assert.match(result.credentialRefFingerprint, /^[a-f0-9]{12}$/);
    assert.strictEqual(
      JSON.stringify(result).includes("actual_provider_token_must_not_leak"),
      false,
    );
  });
});
