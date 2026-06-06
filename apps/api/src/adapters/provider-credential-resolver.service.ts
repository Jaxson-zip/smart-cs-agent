import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { CommerceChannel } from "@smart-cs-agent/shared";
import { ProviderCredentialStoreService } from "./provider-credential-store.service";

export type ProviderCredentialResolutionRequest = {
  tenantId: string;
  channel: CommerceChannel;
  credentialRef: string;
};

export type ProviderCredentialResolution = {
  status: "configured" | "missing" | "invalid" | "not_implemented";
  source: "secret" | "vault" | "unknown";
  credentialRefFingerprint: string;
  credentialRefConfigured: boolean;
  credentialMaterialLoaded: false;
  secretValueReturned: false;
  reason: string;
};

@Injectable()
export class ProviderCredentialResolverService {
  constructor(
    private readonly credentialStore: ProviderCredentialStoreService = new ProviderCredentialStoreService(),
  ) {}

  async resolve(
    request: ProviderCredentialResolutionRequest,
  ): Promise<ProviderCredentialResolution> {
    if (!isCredentialRef(request.credentialRef)) {
      return {
        status: "invalid",
        source: "unknown",
        credentialRefFingerprint: fingerprintCredentialRef(
          request.credentialRef,
        ),
        credentialRefConfigured: false,
        credentialMaterialLoaded: false,
        secretValueReturned: false,
        reason: credentialResolutionReason("invalid"),
      };
    }

    const storeResolution = this.credentialStore.resolveCredentialRef(
      request.credentialRef,
    );
    return {
      status: storeResolution.status,
      source: credentialSource(request.credentialRef),
      credentialRefFingerprint: fingerprintCredentialRef(request.credentialRef),
      credentialRefConfigured: storeResolution.credentialRefConfigured,
      credentialMaterialLoaded: false,
      secretValueReturned: false,
      reason: credentialResolutionReason(storeResolution.status),
    };
  }
}

function credentialSource(credentialRef: string): "secret" | "vault" {
  return credentialRef.startsWith("vault://") ? "vault" : "secret";
}

function fingerprintCredentialRef(credentialRef: string) {
  return createHash("sha256").update(credentialRef).digest("hex").slice(0, 12);
}

function isCredentialRef(credentialRef: string) {
  return /^(secret|vault):\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/.test(
    credentialRef,
  );
}

function credentialResolutionReason(
  status: ProviderCredentialResolution["status"],
) {
  if (status === "configured") {
    return "Provider credential reference is configured; credential material loading and provider network execution are not implemented in this build.";
  }
  if (status === "missing") {
    return "Provider credential reference is missing from the configured credential inventory.";
  }
  if (status === "invalid") {
    return "Provider credential store configuration is invalid.";
  }
  return "Provider credential inventory is not configured; credential material loading is not implemented in this build.";
}
