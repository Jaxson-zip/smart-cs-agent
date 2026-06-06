import { Injectable } from "@nestjs/common";
import type {
  CommerceAction,
  CommerceChannel,
  ExecuteActionRequest,
  IntegrationStatus,
} from "@smart-cs-agent/shared";
import type { ProviderAdapterContract } from "./adapters.interface";
import { MockDouyinAdapter } from "./mock-douyin.adapter";
import { MockTaobaoAdapter } from "./mock-taobao.adapter";

type ActionPolicyResult =
  | { allowed: true }
  | { allowed: false; reason: string; retryable: boolean };

const COMMERCE_WRITE_ACTIONS = new Set<CommerceAction>([
  "modify_address",
  "issue_coupon",
  "escalate_coupon",
  "urge_logistics",
  "refund",
  "update_invoice",
]);

const CONTRACT_VERSION = "provider-adapter-contract-v1";

@Injectable()
export class ProviderAdapterRegistry {
  private readonly contracts: ProviderAdapterContract[];

  constructor(
    taobaoAdapter: MockTaobaoAdapter = new MockTaobaoAdapter(),
    douyinAdapter: MockDouyinAdapter = new MockDouyinAdapter(),
  ) {
    this.contracts = [
      taobaoAdapter,
      douyinAdapter,
      disabledContract("shopify", ["handoff"]),
      disabledContract("wechat", ["handoff"]),
      disabledContract("email", ["handoff"]),
    ];
  }

  listIntegrations(): IntegrationStatus[] {
    return this.contracts.map(toIntegrationStatus);
  }

  getContract(channel: CommerceChannel): ProviderAdapterContract | undefined {
    return this.contracts.find((contract) => contract.channel === channel);
  }

  evaluateActionPolicy(request: ExecuteActionRequest): ActionPolicyResult {
    if (request.action === "handoff") {
      return { allowed: true };
    }

    const contract = this.getContract(request.channel);
    if (!contract) {
      return {
        allowed: false,
        reason: "No provider adapter contract is registered for this channel.",
        retryable: false,
      };
    }

    if (!contract.capabilities.includes(request.action)) {
      return {
        allowed: false,
        reason: "Provider adapter contract does not expose this capability.",
        retryable: false,
      };
    }

    if (COMMERCE_WRITE_ACTIONS.has(request.action)) {
      if (!contract.realCommerceActionsEnabled || contract.writePolicy !== "human_review_required") {
        return {
          allowed: false,
          reason:
            "Blocked by provider write policy: real commerce writes are not enabled for this adapter.",
          retryable: false,
        };
      }
    }

    if (!contract.customerVisibleActionsEnabled) {
      return {
        allowed: false,
        reason:
          "Blocked by provider write policy: customer-visible actions are disabled.",
        retryable: false,
      };
    }

    return { allowed: true };
  }
}

function toIntegrationStatus(contract: ProviderAdapterContract): IntegrationStatus {
  return {
    channel: contract.channel,
    connected: contract.connected,
    capabilities: contract.capabilities,
    health: contract.health,
    adapterMode: contract.mode,
    writePolicy: contract.writePolicy,
    customerVisibleActionsEnabled: contract.customerVisibleActionsEnabled,
    realCommerceActionsEnabled: contract.realCommerceActionsEnabled,
    contractVersion: contract.contractVersion,
    safetyNotes: contract.safetyNotes,
  };
}

function disabledContract(
  channel: CommerceChannel,
  capabilities: CommerceAction[],
): ProviderAdapterContract {
  return {
    channel,
    mode: "not_configured",
    writePolicy: "disabled",
    connected: false,
    health: "auth_required",
    capabilities,
    customerVisibleActionsEnabled: false,
    realCommerceActionsEnabled: false,
    contractVersion: CONTRACT_VERSION,
    safetyNotes: [
      "Provider adapter is not configured.",
      "Real customer-visible writes are disabled.",
    ],
  };
}
