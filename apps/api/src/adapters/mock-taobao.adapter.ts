import { Injectable, Logger } from '@nestjs/common';
import type { CommerceAction } from "@smart-cs-agent/shared";
import { CommerceAdapter, OrderInfo } from './adapters.interface';

@Injectable()
export class MockTaobaoAdapter implements CommerceAdapter {
  private readonly logger = new Logger(MockTaobaoAdapter.name);
  readonly channel = 'taobao';
  readonly mode = 'sandbox_mock';
  readonly writePolicy = 'sandbox_only';
  readonly connected = true;
  readonly health = 'normal';
  readonly capabilities: CommerceAction[] = [
    'modify_address',
    'issue_coupon',
    'urge_logistics',
    'handoff',
  ];
  readonly customerVisibleActionsEnabled = false;
  readonly realCommerceActionsEnabled = false;
  readonly contractVersion = 'provider-adapter-contract-v1';
  readonly safetyNotes = [
    'Sandbox adapter only; never call real Taobao APIs.',
    'Real customer-visible writes are disabled.',
  ];

  async getOrder(orderId: string): Promise<OrderInfo | null> {
    this.logger.log(`[Taobao] getOrder: ${orderId}`);
    return { orderId, status: 'paid', totalAmount: 199.0 };
  }

  async changeAddress(orderId: string, newAddress: string): Promise<boolean> {
    this.logger.log(`[Taobao] changeAddress: ${orderId} -> ${newAddress}`);
    return true;
  }

  async issueCoupon(orderId: string, amount: number): Promise<boolean> {
    this.logger.log(`[Taobao] issueCoupon: ${orderId} amount ${amount}`);
    return true;
  }

  async queryLogistics(orderId: string): Promise<{ status: string; detail: string } | null> {
    this.logger.log(`[Taobao] queryLogistics: ${orderId}`);
    return { status: 'delivering', detail: '包裹正在运输中' };
  }

  async sendMessage(conversationId: string, text: string): Promise<boolean> {
    this.logger.log(`[Taobao] sendMessage: ${conversationId} text: ${text}`);
    return true;
  }
}
