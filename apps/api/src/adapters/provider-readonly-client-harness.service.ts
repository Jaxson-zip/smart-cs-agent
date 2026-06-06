import { Injectable } from "@nestjs/common";
import type { ProviderReadRequest } from "@smart-cs-agent/shared";
import {
  loadProviderReadonlyHarnessConfig,
  type ProviderReadonlyHarnessConfig,
} from "../config/api-config";
import type { ProviderCredentialResolution } from "./provider-credential-resolver.service";

export type ProviderReadonlyClientHarnessInput = {
  request: ProviderReadRequest;
  credentialResolution?: ProviderCredentialResolution;
};

export type ProviderReadonlyClientHarnessResult = {
  executionMode: "sandbox_noop" | "credential_not_ready";
  credentialResolutionStatus:
    | ProviderCredentialResolution["status"]
    | "unavailable";
  credentialRefConfigured: boolean;
  providerRequestPrepared: boolean;
  networkExecution: "not_implemented";
  networkAttempted: false;
  providerDataReturned: false;
  providerResponseCaptured: false;
  attemptCount: 0;
  timeoutMs: number;
  maxRetries: number;
  reason: string;
};

@Injectable()
export class ProviderReadonlyClientHarnessService {
  private readonly config: ProviderReadonlyHarnessConfig;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    this.config = loadProviderReadonlyHarnessConfig(env);
  }

  async planReadonlyRead(
    input: ProviderReadonlyClientHarnessInput,
  ): Promise<ProviderReadonlyClientHarnessResult> {
    const credentialReady =
      input.credentialResolution?.status === "configured" &&
      input.credentialResolution.credentialRefConfigured;

    if (!credentialReady) {
      return {
        executionMode: "credential_not_ready",
        credentialResolutionStatus:
          input.credentialResolution?.status ?? "unavailable",
        credentialRefConfigured:
          input.credentialResolution?.credentialRefConfigured ?? false,
        providerRequestPrepared: false,
        networkExecution: "not_implemented",
        networkAttempted: false,
        providerDataReturned: false,
        providerResponseCaptured: false,
        attemptCount: 0,
        timeoutMs: this.config.timeoutMs,
        maxRetries: this.config.maxRetries,
        reason:
          "Readonly provider request was not prepared because credentials are not configured for sandbox harness execution.",
      };
    }

    return {
      executionMode: "sandbox_noop",
      credentialResolutionStatus:
        input.credentialResolution?.status ?? "unavailable",
      credentialRefConfigured:
        input.credentialResolution?.credentialRefConfigured ?? false,
      providerRequestPrepared: true,
      networkExecution: "not_implemented",
      networkAttempted: false,
      providerDataReturned: false,
      providerResponseCaptured: false,
      attemptCount: 0,
      timeoutMs: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
      reason:
        "Readonly provider request prepared for sandbox harness; provider network execution is not implemented in this build.",
    };
  }
}
