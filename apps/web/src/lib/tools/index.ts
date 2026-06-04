import { mockDb, type Order } from '../../app/db';

export type ToolResult = {
  success: boolean;
  message?: string;
  data?: Order;
};

export class ToolRegistry {
  
  static modifyAddress(orderId: string, newAddress: string, db: typeof mockDb): ToolResult {
    const order = db.orders.find(o => o.orderId === orderId);
    if (!order) return { success: false, message: `Order ${orderId} not found in DB.` };
    
    // Guardrail: Cannot modify shipped orders
    if (order.status === '已发货') {
      return { success: false, message: `GUARDRAIL_BLOCKED: Order ${orderId} is already shipped.` };
    }

    order.address = newAddress;
    return { success: true, message: `Address updated to ${newAddress}`, data: order };
  }

  static issueCoupon(orderId: string, amount: number, db: typeof mockDb): ToolResult {
    const order = db.orders.find(o => o.orderId === orderId);
    if (!order) return { success: false, message: `Order ${orderId} not found in DB.` };

    // Guardrail: Dynamic 10% proportional limit
    const maxAllowed = order.price * 0.10;
    if (amount > maxAllowed) {
      return { 
        success: false, 
        message: `GUARDRAIL_BLOCKED: Amount ${amount} exceeds max automatic coupon limit (${maxAllowed}).` 
      };
    }

    order.compensation = { type: 'coupon', amount, status: 'auto_approved' };
    return { success: true, message: `Coupon for ${amount} issued successfully.`, data: order };
  }

  static applyForCashCompensation(orderId: string, amount: number, db: typeof mockDb): ToolResult {
    const order = db.orders.find(o => o.orderId === orderId);
    if (!order) return { success: false, message: `Order ${orderId} not found in DB.` };

    // Guardrail: Strict non-refundable item check
    if (!order.isRefundable) {
      return {
        success: false,
        message: `GUARDRAIL_BLOCKED: Item '${order.item}' is marked as strict non-refundable. Cash compensation absolutely denied.`
      };
    }

    order.compensation = { type: 'cash', amount, status: 'pending_human_review' };
    return { 
      success: true, 
      message: `Cash compensation application for ${amount} submitted to Human Finance Team. Pending review.`,
      data: order 
    };
  }
}
