import { Injectable, Logger } from '@nestjs/common';
import { CommerceAdapter, OrderInfo } from './adapters.interface';

@Injectable()
export class MockTaobaoAdapter implements CommerceAdapter {
  private readonly logger = new Logger(MockTaobaoAdapter.name);
  readonly channel = 'taobao';

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
