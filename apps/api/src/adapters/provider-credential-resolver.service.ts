import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { CommerceChannel } from "@smart-cs-agent/shared";

export type ProviderCredentialResolutionRequest = {
  tenantId: string;
  channel: CommerceChannel;
  credentialRef: string;
};

export type ProviderCredentialResolution = {
  status: "not_implemented";
  source: "secret" | "vault";
  credentialRefFingerprint: string;
  credentialMaterialLoaded: false;
  secretValueReturned: false;
  reason: string;
};

@Injectable()
export class ProviderCredentialResolverService {
  async resolve(
    request: ProviderCredentialResolutionRequest,
  ): Promise<ProviderCredentialResolution> {
    return {
      status: "not_implemented",
      source: credentialSource(request.credentialRef),
      credentialRefFingerprint: fingerprintCredentialRef(request.credentialRef),
      credentialMaterialLoaded: false,
      secretValueReturned: false,
      reason:
        "Provider credential resolution is a checked boundary; secret manager access is not implemented in this build.",
    };
  }
}

function credentialSource(credentialRef: string): "secret" | "vault" {
  return credentialRef.startsWith("vault://") ? "vault" : "secret";
}

function fingerprintCredentialRef(credentialRef: string) {
  return createHash("sha256").update(credentialRef).digest("hex").slice(0, 12);
}
