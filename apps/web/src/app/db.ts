export type OrderStatus = '待发货' | '已发货' | '已退款';

export interface Order {
  orderId: string;
  item: string;
  status: OrderStatus;
  address: string;
  price: number;
  isRefundable: boolean;
  compensation?: {
    type: 'coupon' | 'cash';
    amount: number;
    status: 'auto_approved' | 'pending_human_review';
  };
}

// In-memory mock database
export const mockDb = {
  orders: [
    { 
      orderId: 'A101', 
      item: 'Apple iPhone 15 Pro Max', 
      status: '已发货', 
      address: '上海市浦东新区张江高科园区1号',
      price: 9999,
      isRefundable: true
    },
    { 
      orderId: 'B202', 
      item: 'Nike Air Force 1 联名款', 
      status: '待发货', 
      address: '北京市朝阳区三里屯太古里北区',
      price: 899,
      isRefundable: true
    },
    { 
      orderId: 'C303', 
      item: '汉服私人高级定制款 (刺绣版)', 
      status: '待发货', 
      address: '成都市武侯区锦里古街8号',
      price: 2999,
      isRefundable: false // 定制商品物理拦截不让退
    }
  ] as Order[]
};
