import { Injectable } from "@nestjs/common";
import {
  loadProviderCredentialRefs,
  type ProviderCredentialRefLoadResult,
} from "../config/api-config";

export type ProviderCredentialStoreResolution =
  | {
      status: "not_implemented";
      credentialRefConfigured: false;
      credentialMaterialLoaded: false;
    }
  | {
      status: "configured";
      credentialRefConfigured: true;
      credentialMaterialLoaded: false;
    }
  | {
      status: "missing";
      credentialRefConfigured: false;
      credentialMaterialLoaded: false;
    }
  | {
      status: "invalid";
      credentialRefConfigured: false;
      credentialMaterialLoaded: false;
    };

@Injectable()
export class ProviderCredentialStoreService {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  resolveCredentialRef(credentialRef: string): ProviderCredentialStoreResolution {
    const result = loadProviderCredentialRefs(this.env);
    return credentialStoreResolution(result, credentialRef);
  }
}

function credentialStoreResolution(
  result: ProviderCredentialRefLoadResult,
  credentialRef: string,
): ProviderCredentialStoreResolution {
  if (result.status === "not_configured") {
    return {
      status: "not_implemented",
      credentialRefConfigured: false,
      credentialMaterialLoaded: false,
    };
  }
  if (result.status === "invalid") {
    return {
      status: "invalid",
      credentialRefConfigured: false,
      credentialMaterialLoaded: false,
    };
  }
  return result.records.some((item) => item.credentialRef === credentialRef)
    ? {
        status: "configured",
        credentialRefConfigured: true,
        credentialMaterialLoaded: false,
      }
    : {
        status: "missing",
        credentialRefConfigured: false,
        credentialMaterialLoaded: false,
      };
}
