import type {
  CommerceAction,
  CommerceChannel,
  IntegrationStatus,
  ProviderAdapterMode,
  ProviderWritePolicy,
} from "@smart-cs-agent/shared";

export interface OrderInfo {
  orderId: string;
  status: string;
  totalAmount: number;
}

export interface ProviderAdapterContract {
  channel: CommerceChannel;
  mode: ProviderAdapterMode;
  writePolicy: ProviderWritePolicy;
  connected: boolean;
  health: IntegrationStatus["health"];
  capabilities: CommerceAction[];
  customerVisibleActionsEnabled: boolean;
  realCommerceActionsEnabled: boolean;
  contractVersion: string;
  safetyNotes: string[];
}

export interface CommerceAdapter extends ProviderAdapterContract {
  getOrder(orderId: string): Promise<OrderInfo | null>;
  changeAddress(orderId: string, newAddress: string): Promise<boolean>;
  issueCoupon(orderId: string, amount: number): Promise<boolean>;
  queryLogistics(orderId: string): Promise<{ status: string; detail: string } | null>;
  sendMessage(conversationId: string, text: string): Promise<boolean>;
}
