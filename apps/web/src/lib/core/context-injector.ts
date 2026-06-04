import { mockDb } from '../../app/db';

export class ContextInjector {
  /**
   * 模拟在真实业务中，根据 UserID 提取用户画像和最近订单
   * 注入到 LLM 的 System Prompt 中，实现 "未问先知"
   */
  static injectUserContext(userId: string = "current_session_user"): string {
    // 模拟从数据库抓取该用户的所有活跃订单
    const recentOrders = mockDb.orders.map(order => ({
      orderId: order.orderId,
      item: order.item,
      status: order.status,
      price: order.price,
      isRefundable: order.isRefundable
    }));

    return `
[SYSTEM CONTEXT INJECTED]
CURRENT_USER_ID: ${userId}
RECENT_ORDERS: ${JSON.stringify(recentOrders, null, 2)}
INSTRUCTION: The user may refer to items implicitly (e.g., "that shirt"). Use the RECENT_ORDERS context to disambiguate which order they mean. Never ask for an order ID if it can be inferred from context.
`;
  }
}
