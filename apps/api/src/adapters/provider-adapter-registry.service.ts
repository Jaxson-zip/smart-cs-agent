import { Injectable } from "@nestjs/common";
import type {
  CommerceAction,
  CommerceChannel,
  ExecuteActionRequest,
  IntegrationStatus,
  ProviderReadRequest,
  ProviderReadCapability,
} from "@smart-cs-agent/shared";
import { loadProviderReadonlyAdapterConfigs } from "../config/api-config";
import type { ProviderAdapterContract } from "./adapters.interface";
import { MockDouyinAdapter } from "./mock-douyin.adapter";
import { MockTaobaoAdapter } from "./mock-taobao.adapter";

type ActionPolicyResult =
  | { allowed: true }
  | { allowed: false; reason: string; retryable: boolean };

type ReadPolicyResult =
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
const READ_CAPABILITIES: ProviderReadCapability[] = [
  "get_order",
  "query_logistics",
];

@Injectable()
export class ProviderAdapterRegistry {
  private readonly contracts: ProviderAdapterContract[];
  private readonly readonlyContractKeys: Set<string>;

  constructor(
    taobaoAdapter: MockTaobaoAdapter = new MockTaobaoAdapter(),
    douyinAdapter: MockDouyinAdapter = new MockDouyinAdapter(),
  ) {
    this.readonlyContractKeys = new Set(
      loadProviderReadonlyAdapterConfigs().map((item) =>
        contractKey(item.tenantId, item.channel),
      ),
    );
    this.contracts = [
      taobaoAdapter,
      douyinAdapter,
      disabledContract("shopify", ["handoff"]),
      disabledContract("wechat", ["handoff"]),
      disabledContract("email", ["handoff"]),
    ];
  }

  listIntegrations(tenantId: string): IntegrationStatus[] {
    return this.contracts
      .map((contract) => this.contractForTenant(tenantId, contract))
      .map(toIntegrationStatus);
  }

  getContract(
    channel: CommerceChannel,
    tenantId: string,
  ): ProviderAdapterContract | undefined {
    const contract = this.contracts.find((item) => item.channel === channel);
    return contract ? this.contractForTenant(tenantId, contract) : undefined;
  }

  evaluateActionPolicy(request: ExecuteActionRequest): ActionPolicyResult {
    if (request.action === "handoff") {
      return { allowed: true };
    }

    const tenantId = request.tenantId ?? "";
    const contract = this.getContract(request.channel, tenantId);
    if (!contract) {
      return {
        allowed: false,
        reason: "No provider adapter contract is registered for this channel.",
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

    if (!contract.capabilities.includes(request.action)) {
      return {
        allowed: false,
        reason: "Provider adapter contract does not expose this capability.",
        retryable: false,
      };
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

  evaluateReadPolicy(request: ProviderReadRequest): ReadPolicyResult {
    const tenantId = request.tenantId ?? "";
    const contract = this.getContract(request.channel, tenantId);
    if (!contract) {
      return {
        allowed: false,
        reason: "No provider adapter contract is registered for this channel.",
        retryable: false,
      };
    }

    if (contract.mode !== "real_readonly" || contract.writePolicy !== "read_only") {
      return {
        allowed: false,
        reason:
          "Provider readonly credentials are not configured for this tenant and channel.",
        retryable: false,
      };
    }

    if (!contract.readCapabilities.includes(request.readCapability)) {
      return {
        allowed: false,
        reason: "Provider readonly contract does not expose this read capability.",
        retryable: false,
      };
    }

    return { allowed: true };
  }

  private contractForTenant(
    tenantId: string,
    contract: ProviderAdapterContract,
  ): ProviderAdapterContract {
    return this.readonlyContractKeys.has(contractKey(tenantId, contract.channel))
      ? readOnlyContract(contract.channel)
      : contract;
  }
}

function toIntegrationStatus(contract: ProviderAdapterContract): IntegrationStatus {
  return {
    channel: contract.channel,
    connected: contract.connected,
    capabilities: contract.capabilities,
    readCapabilities: contract.readCapabilities,
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
    readCapabilities: [],
    customerVisibleActionsEnabled: false,
    realCommerceActionsEnabled: false,
    contractVersion: CONTRACT_VERSION,
    safetyNotes: [
      "Provider adapter is not configured.",
      "Real customer-visible writes are disabled.",
    ],
  };
}

function readOnlyContract(channel: CommerceChannel): ProviderAdapterContract {
  return {
    channel,
    mode: "real_readonly",
    writePolicy: "read_only",
    connected: true,
    health: "normal",
    capabilities: ["handoff"],
    readCapabilities: READ_CAPABILITIES,
    customerVisibleActionsEnabled: false,
    realCommerceActionsEnabled: false,
    contractVersion: CONTRACT_VERSION,
    safetyNotes: [
      "Real provider readonly credential reference is configured.",
      "Only non-mutating order and logistics reads are allowed.",
      "Real commerce writes and customer-visible actions are disabled.",
    ],
  };
}

function contractKey(tenantId: string, channel: CommerceChannel) {
  return JSON.stringify([tenantId, channel]);
}
