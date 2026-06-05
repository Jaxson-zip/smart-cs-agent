export interface OrderInfo {
  orderId: string;
  status: string;
  totalAmount: number;
}

export interface CommerceAdapter {
  channel: string;
  
  getOrder(orderId: string): Promise<OrderInfo | null>;
  changeAddress(orderId: string, newAddress: string): Promise<boolean>;
  issueCoupon(orderId: string, amount: number): Promise<boolean>;
  queryLogistics(orderId: string): Promise<{ status: string; detail: string } | null>;
  sendMessage(conversationId: string, text: string): Promise<boolean>;
}
