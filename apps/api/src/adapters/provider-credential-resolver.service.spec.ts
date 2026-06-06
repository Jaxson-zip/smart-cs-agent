import assert from "node:assert";
import { describe, it } from "node:test";
import { ProviderCredentialResolverService } from "./provider-credential-resolver.service";

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
    assert.strictEqual(result.credentialMaterialLoaded, false);
    assert.strictEqual(result.secretValueReturned, false);
    assert.strictEqual(result.source, "secret");
    assert.match(result.credentialRefFingerprint, /^[a-f0-9]{12}$/);
    const serialized = JSON.stringify(result);
    assert.strictEqual(serialized.includes("credential_ref_must_not_leak"), false);
    assert.strictEqual(serialized.includes("secret://"), false);
    assert.strictEqual(serialized.includes("actual_provider_token"), false);
  });
});
