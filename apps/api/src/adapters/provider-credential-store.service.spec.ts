import assert from "node:assert";
import { describe, it } from "node:test";
import { ProviderCredentialStoreService } from "./provider-credential-store.service";

describe("ProviderCredentialStoreService", () => {
  it("reports not implemented when the credential inventory is absent", () => {
    const store = new ProviderCredentialStoreService({});

    assert.deepStrictEqual(
      store.resolveCredentialRef("secret://smartcs/taobao/tenant_1"),
      {
        status: "not_implemented",
        credentialRefConfigured: false,
        credentialMaterialLoaded: false,
      },
    );
  });

  it("detects configured credential refs without loading secret material", () => {
    const store = new ProviderCredentialStoreService({
      PROVIDER_CREDENTIALS: JSON.stringify([
        { credentialRef: "secret://smartcs/taobao/tenant_1" },
      ]),
    });

    assert.deepStrictEqual(
      store.resolveCredentialRef("secret://smartcs/taobao/tenant_1"),
      {
        status: "configured",
        credentialRefConfigured: true,
        credentialMaterialLoaded: false,
      },
    );
    assert.deepStrictEqual(
      store.resolveCredentialRef("secret://smartcs/douyin/tenant_1"),
      {
        status: "missing",
        credentialRefConfigured: false,
        credentialMaterialLoaded: false,
      },
    );
  });

  it("fails closed for invalid or secret-inlining credential inventories", () => {
    const invalidJsonStore = new ProviderCredentialStoreService({
      PROVIDER_CREDENTIALS: "{not-json",
    });
    const inlineSecretStore = new ProviderCredentialStoreService({
      PROVIDER_CREDENTIALS: JSON.stringify([
        {
          credentialRef: "secret://smartcs/taobao/tenant_1",
          material: "actual_provider_token_must_not_leak",
        },
      ]),
    });

    assert.deepStrictEqual(
      invalidJsonStore.resolveCredentialRef("secret://smartcs/taobao/tenant_1"),
      {
        status: "invalid",
        credentialRefConfigured: false,
        credentialMaterialLoaded: false,
      },
    );
    assert.deepStrictEqual(
      inlineSecretStore.resolveCredentialRef("secret://smartcs/taobao/tenant_1"),
      {
        status: "invalid",
        credentialRefConfigured: false,
        credentialMaterialLoaded: false,
      },
    );
  });
});
