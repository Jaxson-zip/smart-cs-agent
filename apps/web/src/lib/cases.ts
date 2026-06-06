import type { AfterSalesAction, AfterSalesCase } from "@smart-cs-agent/shared";

export type QueueStatus = "auto_resolved" | "waiting_confirm" | "human_takeover";

export type UiAuditLog = {
  id: string;
  title: string;
  time: string;
  summary: string;
};

export type UiCase = AfterSalesCase & {
  status: QueueStatus;
  waitTime: string;
  product: string;
  amount: string;
  orderStatus: string;
  systemResult: string;
  facts: string[];
  operatorHint: string;
  auditLogs?: UiAuditLog[];
};

type ApiAuditLog = {
  id?: string;
  action?: string;
  createdAt?: string | Date;
  details?: Record<string, unknown> | null;
};

export type ApiAfterSalesCase = AfterSalesCase & {
  auditLogs?: ApiAuditLog[];
};

const fallbackActions = {
  address: [{ type: "change_address", status: "pending" }],
  logistics: [{ type: "query_logistics", status: "success" }],
  coupon: [{ type: "issue_coupon", amount: 30, status: "pending" }],
  handoff: [{ type: "create_handoff", reason: "高风险投诉需人工接管", status: "pending" }],
} satisfies Record<string, AfterSalesAction[]>;

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
    customerMessage:
      "鞋盒压坏了，鞋子没有问题，但这是送人的。能不能补偿一下？",
    customerReply:
      "非常抱歉影响您的送礼体验。我们可以为您补发 30 元无门槛券，确认后会发放到您的淘宝账户。",
    actions: fallbackActions.coupon,
    waitTime: "02:18",
    product: "Nike Air Force 1 联名款",
    amount: "¥899",
    orderStatus: "已签收",
    systemResult:
      "订单未申请过补偿，商品本体未损坏，建议发放小额补偿券。该处理需要客服确认。",
    operatorHint: "核对补偿金额后确认，系统会把话术同步给客户。",
    facts: ["近 30 天无补偿记录", "商品本体未损坏", "补偿金额低于店铺授权上限"],
    auditLogs: [
      {
        id: "A-1001",
        title: "完成售后分类",
        time: "10:42",
        summary: "识别为破损补偿，中风险，等待客服确认。",
      },
    ],
  },
  {
    caseId: "C-1002",
    merchantId: "demo",
    channel: "wechat",
    customerName: "周先生",
    orderId: "WX88204",
    category: "address_change",
    riskLevel: "low",
    automationMode: "auto_execute",
    status: "auto_resolved",
    customerMessage:
      "还没发货的话帮我把地址改到上海浦东新区世纪大道 88 号。",
    customerReply: "已经为您修改收货地址，订单会按新地址发出。",
    actions: fallbackActions.address,
    waitTime: "00:34",
    product: "儿童保温杯套装",
    amount: "¥129",
    orderStatus: "待发货",
    systemResult:
      "订单未发货，地址信息完整，已按客户要求自动修改。",
    operatorHint: "低风险事项已自动处理，无需客服操作。",
    facts: ["订单尚未出库", "客户提供地址完整", "地址变更在店铺规则范围内"],
    auditLogs: [
      {
        id: "A-1002",
        title: "自动完成地址修改",
        time: "10:39",
        summary: "已修改地址并回复客户，无需人工处理。",
      },
    ],
  },
  {
    caseId: "C-1003",
    merchantId: "demo",
    channel: "douyin",
    customerName: "陈女士",
    orderId: "DY56118",
    category: "complaint_escalation",
    riskLevel: "high",
    automationMode: "human_takeover",
    status: "human_takeover",
    customerMessage:
      "你们客服一直拖，我要投诉，也会去平台申请介入。",
    customerReply:
      "非常抱歉给您带来不好的体验。我已经为您转接人工专员处理，会优先核实订单并给出明确方案。",
    actions: fallbackActions.handoff,
    waitTime: "06:52",
    product: "美妆礼盒",
    amount: "¥459",
    orderStatus: "运输中",
    systemResult:
      "客户明确表达投诉和平台介入意向，已标记为高风险，需要人工接管。",
    operatorHint: "先安抚客户，再核实履约和补偿边界，必要时升级主管。",
    facts: ["客户有投诉意向", "订单仍在履约中", "可能影响店铺体验分"],
    auditLogs: [
      {
        id: "A-1003",
        title: "触发人工接管",
        time: "10:36",
        summary: "投诉升级风险较高，已进入人工接管队列。",
      },
    ],
  },
  {
    caseId: "C-1004",
    merchantId: "demo",
    channel: "taobao",
    customerName: "王先生",
    orderId: "TB55190",
    category: "logistics",
    riskLevel: "low",
    automationMode: "auto_execute",
    status: "auto_resolved",
    customerMessage: "快递怎么两天没有更新？帮我看下。",
    customerReply:
      "物流显示包裹已到达华东分拨中心，预计明天继续派送。我们会继续关注物流状态。",
    actions: fallbackActions.logistics,
    waitTime: "01:05",
    product: "男士冲锋衣",
    amount: "¥329",
    orderStatus: "运输中",
    systemResult:
      "物流轨迹正常延迟，已查询并回复客户预计派送时间。",
    operatorHint: "低风险物流查询已自动处理，无需客服操作。",
    facts: ["物流轨迹存在更新", "未超过承诺时效", "无需赔付或改派"],
    auditLogs: [
      {
        id: "A-1004",
        title: "自动回复物流状态",
        time: "10:31",
        summary: "已同步最新物流进展给客户。",
      },
    ],
  },
];

export function mapApiCaseToUiCase(apiCase: ApiAfterSalesCase): UiCase {
  const status = getStatus(apiCase);
  const isAuto = status === "auto_resolved";
  const isHigh = status === "human_takeover";

  return {
    ...apiCase,
    status,
    waitTime: formatWaitTime(apiCase.createdAt),
    product: apiCase.orderId ? `订单 ${apiCase.orderId}` : "订单信息待同步",
    amount: "待同步",
    orderStatus: isAuto ? "已处理" : "处理中",
    systemResult: buildSystemResult(apiCase),
    operatorHint: isAuto
      ? "低风险事项已自动处理，无需客服操作。"
      : isHigh
        ? "高风险事项需要人工接管，请先安抚客户并核实订单。"
        : "中风险事项等待客服确认后再回复客户。",
    facts: buildFacts(apiCase),
    auditLogs: apiCase.auditLogs?.map(mapAuditLog),
  };
}

function getStatus(apiCase: AfterSalesCase): QueueStatus {
  if (apiCase.riskLevel === "low" || apiCase.automationMode === "auto_execute") {
    return "auto_resolved";
  }

  if (apiCase.riskLevel === "high" || apiCase.automationMode === "human_takeover") {
    return "human_takeover";
  }

  return "waiting_confirm";
}

function buildSystemResult(apiCase: AfterSalesCase): string {
  if (apiCase.riskLevel === "low") {
    return "该售后风险较低，系统已按店铺规则完成处理并回复客户。";
  }

  if (apiCase.riskLevel === "high") {
    return "该售后存在投诉、拒绝方案或履约争议风险，需要人工接管。";
  }

  return "该售后可按建议方案处理，需要客服确认后再回复客户。";
}

function buildFacts(apiCase: AfterSalesCase): string[] {
  const facts = [
    `分类：${categoryLabel(apiCase.category)}`,
    `风险：${riskLabel(apiCase.riskLevel)}`,
  ];

  if (apiCase.orderId) {
    facts.push(`关联订单：${apiCase.orderId}`);
  }

  return facts;
}

function mapAuditLog(log: ApiAuditLog, index: number): UiAuditLog {
  return {
    id: log.id ?? `audit-${index}`,
    title: auditTitle(log.action),
    time: formatTime(log.createdAt),
    summary: auditSummary(log.action, log.details),
  };
}

function auditTitle(action?: string): string {
  const titles: Record<string, string> = {
    event_received: "收到客户消息",
    category_decision: "完成售后分类",
    risk_decision: "完成风险判断",
    action_executed: "执行处理动作",
    reply_sent: "同步客户回复",
    classify: "完成售后分类",
    route: "更新处理方式",
    handoff: "触发人工接管",
    reply: "生成客户回复",
    action: "更新处理记录",
    change_address: "修改收货地址",
    query_logistics: "查询物流进展",
    issue_coupon: "处理补偿方案",
    create_handoff: "转入人工接管",
    create_supervisor_review: "升级主管处理",
    send_channel_reply: "同步客户回复",
  };

  if (!action) return "更新处理记录";
  const normalized = action.toLowerCase();
  if (titles[normalized]) return titles[normalized];
  if (normalized.includes("category") || normalized.includes("classify")) return "完成售后分类";
  if (normalized.includes("risk")) return "完成风险判断";
  if (normalized.includes("address")) return "修改收货地址";
  if (normalized.includes("logistics")) return "查询物流进展";
  if (normalized.includes("coupon") || normalized.includes("compensation")) return "处理补偿方案";
  if (normalized.includes("handoff") || normalized.includes("takeover")) return "转入人工接管";
  if (normalized.includes("supervisor")) return "升级主管处理";
  if (normalized.includes("reply") || normalized.includes("message")) return "同步客户回复";

  return "更新处理记录";
}

function auditSummary(action?: string, details?: Record<string, unknown> | null): string {
  if (!details) return "已记录处理进展。";

  const actionDetail = details.action;
  if (isRecord(actionDetail)) {
    const type = typeof actionDetail.type === "string" ? actionDetail.type : undefined;
    const status = typeof actionDetail.status === "string" ? actionDetail.status : undefined;

    return `处理动作：${actionTypeLabel(type)}，状态：${actionStatusLabel(status)}。`;
  }

  if (typeof details.category === "string") {
    return `售后类型：${categoryLabel(details.category)}。`;
  }

  if (typeof details.riskLevel === "string") {
    const mode =
      typeof details.automationMode === "string"
        ? `，处理方式：${automationModeLabel(details.automationMode)}`
        : "";

    return `风险等级：${riskLabel(details.riskLevel)}${mode}。`;
  }

  if (typeof details.success === "boolean") {
    return details.success ? "已同步客户回复。" : "客户回复暂未同步。";
  }

  if (typeof details.text === "string") {
    return action === "reply_sent" ? "已同步客户回复。" : "已记录客户诉求。";
  }

  return "已记录处理进展。";
}

function formatWaitTime(createdAt?: string | Date): string {
  if (!createdAt) return "刚刚";

  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return "刚刚";

  const minutes = Math.max(0, Math.floor((Date.now() - created) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟`;

  const hours = Math.floor(minutes / 60);
  return `${hours} 小时`;
}

function formatTime(value?: string | Date): string {
  if (!value) return "刚刚";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    address_change: "修改地址",
    logistics: "物流问题",
    damage_compensation: "破损补偿",
    refund_return: "退款退货",
    compensation_rejected: "补偿协商",
    complaint_escalation: "投诉升级",
    unknown: "待判定",
  };

  return labels[category] ?? "待判定";
}

function riskLabel(riskLevel: string): string {
  const labels: Record<string, string> = {
    low: "低风险",
    medium: "中风险",
    high: "高风险",
  };

  return labels[riskLevel] ?? "待判断";
}

function automationModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    auto_execute: "自动处理",
    human_confirm: "客服确认",
    human_takeover: "人工接管",
  };

  return labels[mode] ?? "待确认";
}

function actionTypeLabel(type?: string): string {
  const labels: Record<string, string> = {
    change_address: "修改收货地址",
    query_logistics: "查询物流进展",
    issue_coupon: "发放补偿券",
    create_handoff: "转入人工接管",
    create_supervisor_review: "升级主管处理",
    send_channel_reply: "同步客户回复",
  };

  return type ? labels[type] ?? "更新处理记录" : "更新处理记录";
}

function actionStatusLabel(status?: string): string {
  const labels: Record<string, string> = {
    success: "已完成",
    failed: "未完成",
    pending: "待处理",
    simulated: "模拟完成",
  };

  return status ? labels[status] ?? "待处理" : "待处理";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
