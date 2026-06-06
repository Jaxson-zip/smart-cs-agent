import { Injectable, Logger } from '@nestjs/common';
import type { CommerceAction } from "@smart-cs-agent/shared";
import { CommerceAdapter, OrderInfo } from './adapters.interface';

@Injectable()
export class MockDouyinAdapter implements CommerceAdapter {
  private readonly logger = new Logger(MockDouyinAdapter.name);
  readonly channel = 'douyin';
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
    'Sandbox adapter only; never call real Douyin APIs.',
    'Real customer-visible writes are disabled.',
  ];

  async getOrder(orderId: string): Promise<OrderInfo | null> {
    this.logger.log(`[Douyin] getOrder: ${orderId}`);
    return { orderId, status: 'paid', totalAmount: 299.0 };
  }

  async changeAddress(orderId: string, newAddress: string): Promise<boolean> {
    this.logger.log(`[Douyin] changeAddress: ${orderId} -> ${newAddress}`);
    return true;
  }

  async issueCoupon(orderId: string, amount: number): Promise<boolean> {
    this.logger.log(`[Douyin] issueCoupon: ${orderId} amount ${amount}`);
    return true;
  }

  async queryLogistics(orderId: string): Promise<{ status: string; detail: string } | null> {
    this.logger.log(`[Douyin] queryLogistics: ${orderId}`);
    return { status: 'delivering', detail: '包裹正在运输中' };
  }

  async sendMessage(conversationId: string, text: string): Promise<boolean> {
    this.logger.log(`[Douyin] sendMessage: ${conversationId} text: ${text}`);
    return true;
  }
}
