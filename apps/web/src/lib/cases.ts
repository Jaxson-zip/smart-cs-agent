import { AfterSalesCase, AfterSalesAction } from '@smart-cs-agent/shared';

type QueueStatus =
  | "waiting_confirm"
  | "customer_rejected"
  | "human_takeover"
  | "send_failed"
  | "auto_resolved";

export type UiCase = AfterSalesCase & {
  status: QueueStatus;
  waitTime: string;
  product: string;
  amount: string;
  orderStatus: string;
  systemResult: string;
  facts: string[];
  operatorHint: string;
  auditLogs?: Array<{ id: string; action: string; createdAt: string; details: Record<string, unknown> }>;
};

export const fallbackCases: UiCase[] = [
  {
    caseId: "C-1001",
    merchantId: "demo",
    channel: "taobao",
    customerName: "林女士",
    orderId: "TB73921",
    category: "damage_compensation",
    riskLevel: "medium",
    automationMode: "human_confirm",
    status: "waiting_confirm",
    customerMessage: "鞋盒压坏了，鞋子没问题，但是这是送人的，能不能补偿一下？",
    customerReply: "非常抱歉影响您的送礼体验。我们可以为您补偿 30 元无门槛券，确认后会发放到您的淘宝账户。",
    actions: [{ type: "issue_coupon", amount: 30 } as unknown as AfterSalesAction],
    waitTime: "02:18",
    product: "Nike Air Force 1 联名款",
    amount: "¥899",
    orderStatus: "已签收",
    systemResult: "订单未申请过补偿，商品本体未损坏，补偿金额低于店铺自动上限。需要客服确认后发送。",
    operatorHint: "中风险补偿，确认后可发送给客户。",
    facts: ["近 30 天无补偿记录", "商品本体未损坏", "补偿金额低于自动上限"],
  }
];

export function mapApiCaseToUiCase(apiCase: AfterSalesCase): UiCase {
  const isAuto = apiCase.automationMode === "auto_execute";
  let status: QueueStatus = isAuto ? "auto_resolved" : "waiting_confirm";
  if (apiCase.automationMode === "human_takeover") status = "human_takeover";
  if (apiCase.category === "compensation_rejected") status = "customer_rejected";

  return {
    ...apiCase,
    status,
    waitTime: "00:00",
    product: apiCase.orderId ? `Order ${apiCase.orderId}` : "Unknown Product",
    amount: "¥--",
    orderStatus: "Unknown",
    systemResult: `System classified this as ${apiCase.category} with ${apiCase.riskLevel} risk.`,
    operatorHint: isAuto ? "System auto handled." : "Operator review required.",
    facts: [],
  };
}
