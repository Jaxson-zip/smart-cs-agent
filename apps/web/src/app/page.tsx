"use client";

import { useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  Check,
  ChevronRight,
  CreditCard,
  Headphones,
  Home,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRoundCheck,
} from "lucide-react";
import type {
  AfterSalesAction,
  AfterSalesCase,
  AfterSalesCategory,
  RiskLevel,
} from "@smart-cs-agent/shared";

gsap.registerPlugin(useGSAP);

type ChannelId = "all" | "taobao" | "douyin" | "shopify";

type QueueStatus =
  | "waiting_confirm"
  | "customer_rejected"
  | "human_takeover"
  | "send_failed"
  | "auto_resolved";

type UiCase = AfterSalesCase & {
  status: QueueStatus;
  waitTime: string;
  product: string;
  amount: string;
  orderStatus: string;
  systemResult: string;
  facts: string[];
  operatorHint: string;
};

const channelTabs: Array<{ id: ChannelId; label: string }> = [
  { id: "all", label: "全部" },
  { id: "taobao", label: "淘宝" },
  { id: "douyin", label: "抖音" },
  { id: "shopify", label: "Shopify" },
];

const mockCases: UiCase[] = [
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
    customerReply:
      "非常抱歉影响您的送礼体验。我们可以为您补偿 30 元无门槛券，确认后会发放到您的淘宝账户。",
    actions: [{ type: "issue_coupon", amount: 30 }],
    waitTime: "02:18",
    product: "Nike Air Force 1 联名款",
    amount: "¥899",
    orderStatus: "已签收",
    systemResult:
      "订单未申请过补偿，商品本体未损坏，补偿金额低于店铺自动上限。需要客服确认后发送。",
    operatorHint: "中风险补偿，确认后可发送给客户。",
    facts: ["近 30 天无补偿记录", "商品本体未损坏", "补偿金额低于自动上限"],
  },
  {
    caseId: "C-1002",
    merchantId: "demo",
    channel: "taobao",
    customerName: "林女士",
    orderId: "TB73921",
    category: "compensation_rejected",
    riskLevel: "medium",
    automationMode: "human_confirm",
    status: "customer_rejected",
    customerMessage: "30 元太少了吧，鞋盒都这样了我还怎么送人？",
    customerReply:
      "我理解您觉得 30 元补偿不够。我们可以为您升级到 50 元无门槛券，确认后会发放到您的淘宝账户。",
    actions: [{ type: "issue_coupon", amount: 50 }],
    waitTime: "03:04",
    product: "Nike Air Force 1 联名款",
    amount: "¥899",
    orderStatus: "已签收",
    systemResult: "客户拒绝首次补偿。系统建议升级到 50 元券；如仍拒绝，转主管处理。",
    operatorHint: "这是第二轮协商。客户仍不接受时转主管。",
    facts: ["客户拒绝 30 元券", "允许二轮补偿", "超过二轮需主管确认"],
  },
  {
    caseId: "C-1003",
    merchantId: "demo",
    channel: "douyin",
    customerName: "陈先生",
    orderId: "DY11804",
    category: "address_change",
    riskLevel: "low",
    automationMode: "auto_execute",
    status: "auto_resolved",
    customerMessage: "还没发货的话帮我改到公司，公司前台可以代收。",
    customerReply: "可以的。订单尚未发货，地址已同步到仓库。",
    actions: [
      { type: "change_address", status: "success" },
      { type: "send_channel_reply", status: "success", replyText: "地址已修改成功。" },
    ],
    waitTime: "00:00",
    product: "通勤双肩包",
    amount: "¥329",
    orderStatus: "待发货",
    systemResult: "订单待发货，系统已自动修改地址并回传抖音原会话。",
    operatorHint: "低风险，系统已自动处理。",
    facts: ["订单待发货", "仓库未锁单", "已回传原渠道"],
  },
  {
    caseId: "C-1004",
    merchantId: "demo",
    channel: "shopify",
    customerName: "Mia",
    orderId: "SH44018",
    category: "refund_return",
    riskLevel: "high",
    automationMode: "human_takeover",
    status: "human_takeover",
    customerMessage: "The dress is custom made but it does not fit. I need a cash refund.",
    customerReply:
      "I checked your order. Because this is a made-to-measure item already in production, this request needs a manual review. A specialist will follow up in this channel.",
    actions: [{ type: "create_supervisor_review", reason: "高风险现金退款" }],
    waitTime: "07:05",
    product: "Made-to-measure dress",
    amount: "$420",
    orderStatus: "生产中",
    systemResult: "定制商品已进入生产，现金退款需主管审核，系统不会自动承诺退款。",
    operatorHint: "高风险退款，必须人工接管。",
    facts: ["定制商品", "已进入生产", "现金退款需主管确认"],
  },
];

const categoryText: Record<AfterSalesCategory, string> = {
  address_change: "修改地址",
  logistics: "物流问题",
  damage_compensation: "破损补偿",
  refund_return: "退款退货",
  compensation_rejected: "拒绝补偿",
  complaint_escalation: "投诉升级",
  unknown: "未知问题",
};

const riskText: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

const riskClass: Record<RiskLevel, string> = {
  low: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-rose-50 text-rose-700",
};

const statusText: Record<QueueStatus, string> = {
  waiting_confirm: "待确认回复",
  customer_rejected: "客户不接受",
  human_takeover: "需人工接管",
  send_failed: "发送失败",
  auto_resolved: "自动处理完成",
};

const statusClass: Record<QueueStatus, string> = {
  waiting_confirm: "bg-sky-50 text-sky-700",
  customer_rejected: "bg-violet-50 text-violet-700",
  human_takeover: "bg-rose-50 text-rose-700",
  send_failed: "bg-orange-50 text-orange-700",
  auto_resolved: "bg-emerald-50 text-emerald-700",
};

const actionLabels: Record<AfterSalesAction["type"], { label: string; Icon: typeof Home }> = {
  change_address: { label: "修改地址", Icon: Home },
  query_logistics: { label: "查物流", Icon: Truck },
  issue_coupon: { label: "发补偿券", Icon: CreditCard },
  create_handoff: { label: "转人工", Icon: UserRoundCheck },
  create_supervisor_review: { label: "主管审核", Icon: ShieldCheck },
  send_channel_reply: { label: "发回原渠道", Icon: Send },
};

export default function OperatorWorkbench() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedChannel, setSelectedChannel] = useState<ChannelId>("all");
  const attentionQueue = useMemo(
    () => mockCases.filter((item) => item.status !== "auto_resolved"),
    [],
  );
  const autoResolved = useMemo(
    () => mockCases.filter((item) => item.status === "auto_resolved"),
    [],
  );

  const visibleItems = useMemo(() => {
    if (selectedChannel === "all") return attentionQueue;
    return attentionQueue.filter((item) => item.channel === selectedChannel);
  }, [attentionQueue, selectedChannel]);

  const [selectedId, setSelectedId] = useState(attentionQueue[0]?.caseId);
  const selected = useMemo(
    () =>
      visibleItems.find((item) => item.caseId === selectedId) ??
      visibleItems[0] ??
      attentionQueue[0],
    [attentionQueue, selectedId, visibleItems],
  );

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>(
    Object.fromEntries(mockCases.map((item) => [item.caseId, item.customerReply ?? ""])),
  );
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [takeoverIds, setTakeoverIds] = useState<string[]>([]);

  useGSAP(
    () => {
      gsap.from("[data-enter]", {
        opacity: 0,
        y: 8,
        duration: 0.24,
        ease: "power2.out",
        stagger: 0.025,
      });
    },
    { scope: rootRef },
  );

  if (!selected) {
    return <main className="grid h-dvh place-items-center bg-slate-50">暂无待处理售后</main>;
  }

  const currentDraft = replyDrafts[selected.caseId] ?? "";
  const isSent = sentIds.includes(selected.caseId);
  const isTakeover =
    takeoverIds.includes(selected.caseId) || selected.automationMode === "human_takeover";

  function selectChannel(id: ChannelId) {
    setSelectedChannel(id);
    const nextList =
      id === "all" ? attentionQueue : attentionQueue.filter((item) => item.channel === id);
    if (nextList[0]) setSelectedId(nextList[0].caseId);
  }

  function sendReply() {
    if (!sentIds.includes(selected.caseId)) {
      setSentIds((items) => [...items, selected.caseId]);
    }
  }

  function handleTakeover() {
    if (!takeoverIds.includes(selected.caseId)) {
      setTakeoverIds((items) => [...items, selected.caseId]);
    }
  }

  const selectedStatus = isSent ? "系统已发送" : statusText[selected.status];

  return (
    <main ref={rootRef} className="h-dvh overflow-hidden bg-[#f5f7fa] text-slate-950">
      <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <aside
          data-enter
          className="hidden min-h-0 min-w-0 flex-col border-r border-slate-200 bg-white lg:flex"
        >
          <header className="shrink-0 border-b border-slate-200 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Smart CS Agent
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <h1 className="text-xl font-semibold">售后处理台</h1>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                沙盒接入中
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <Search size={15} />
              <span>搜索订单、客户、渠道</span>
            </div>
          </header>

          <section className="shrink-0 border-b border-slate-200 px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                渠道
              </span>
              <span className="text-xs text-slate-500">只看需处理</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {channelTabs.map((tab) => {
                const count =
                  tab.id === "all"
                    ? attentionQueue.length
                    : attentionQueue.filter((item) => item.channel === tab.id).length;
                return (
                  <button
                    key={tab.id}
                    onClick={() => selectChannel(tab.id)}
                    className={`rounded-md border px-3 py-2 text-left transition ${
                      selectedChannel === tab.id
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>{tab.label}</span>
                      <span>{count}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {visibleItems.map((item) => {
              const active = item.caseId === selected.caseId;
              return (
                <button
                  key={item.caseId}
                  onClick={() => setSelectedId(item.caseId)}
                  className={`mb-2 w-full rounded-md border px-4 py-3 text-left transition ${
                    active
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{item.customerName}</div>
                      <div className={active ? "mt-1 text-xs text-slate-300" : "mt-1 text-xs text-slate-500"}>
                        {item.channel} / {item.orderId}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                        active ? "bg-white/10 text-white" : statusClass[item.status]
                      }`}
                    >
                      {statusText[item.status]}
                    </span>
                  </div>
                  <p className={active ? "text-sm text-slate-200" : "text-sm text-slate-700"}>
                    {categoryText[item.category]}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className={active ? "text-slate-300" : "text-slate-500"}>
                      等待 {item.waitTime}
                    </span>
                    <span className={active ? "text-amber-200" : "text-amber-600"}>
                      {riskText[item.riskLevel]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <section className="shrink-0 border-t border-slate-200 p-3">
            <div className="rounded-md bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>自动处理记录</span>
                <span>{autoResolved.length}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">低风险售后不挤占客服主队列。</p>
            </div>
          </section>
        </aside>

        <section data-enter className="flex h-dvh min-h-0 min-w-0 flex-col bg-[#f8fafc]">
          <header className="flex min-h-[68px] shrink-0 flex-col justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center lg:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{categoryText[selected.category]}</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[selected.status]}`}>
                  {selectedStatus}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${riskClass[selected.riskLevel]}`}>
                  {riskText[selected.riskLevel]}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {selected.customerName} / {selected.channel} / {selected.orderId}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={handleTakeover}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Headphones size={15} />
                接管
              </button>
              <button className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                <ShieldCheck size={15} />
                转主管
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="mx-auto flex max-w-4xl flex-col gap-3">
                <div className="flex justify-start">
                  <div className="max-w-[84%] rounded-lg rounded-tl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
                    <div className="mb-1 text-xs text-slate-500">{selected.customerName}</div>
                    <p className="text-[15px] leading-7 text-slate-900">
                      {selected.customerMessage}
                    </p>
                  </div>
                </div>

                <div className="flex justify-start">
                  <div className="max-w-[84%] rounded-lg rounded-tl-sm bg-sky-50 px-4 py-3 ring-1 ring-sky-100">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-sky-700">
                      <Sparkles size={13} />
                      系统处理结论
                    </div>
                    <p className="text-[15px] leading-7 text-slate-800">
                      {selected.systemResult}
                    </p>
                  </div>
                </div>

                {isSent ? (
                  <div className="flex justify-end">
                    <div className="max-w-[84%] rounded-lg rounded-tr-sm bg-slate-950 px-4 py-3 text-white shadow-sm">
                      <div className="mb-1 text-xs text-slate-300">已发送给客户</div>
                      <p className="text-[15px] leading-7">{currentDraft}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
              <div className="mx-auto max-w-4xl">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles size={16} className="text-violet-600" />
                    {isSent ? "系统已发送" : isTakeover ? "接管后回复" : "待确认回复"}
                  </div>
                  <button
                    onClick={sendReply}
                    disabled={isSent || (isTakeover && selected.riskLevel === "high")}
                    className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSent ? <Check size={15} /> : <Send size={15} />}
                    {isSent
                      ? "已发送"
                      : isTakeover && selected.riskLevel === "high"
                        ? "需主管确认"
                        : "确认发送"}
                  </button>
                </div>
                <textarea
                  value={currentDraft}
                  onChange={(event) =>
                    setReplyDrafts((drafts) => ({
                      ...drafts,
                      [selected.caseId]: event.target.value,
                    }))
                  }
                  disabled={isSent}
                  className="h-24 w-full resize-none rounded-md border border-slate-200 bg-slate-50 p-3 text-[15px] leading-6 text-slate-900 outline-none focus:border-slate-400 disabled:bg-slate-100 disabled:text-slate-500 xl:h-28"
                  placeholder={isTakeover ? "请输入接管后的回复内容..." : "系统未提供待确认回复"}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {selected.actions?.map((action, index) => {
                    const { label, Icon } = actionLabels[action.type];
                    return (
                      <button
                        key={`${action.type}-${index}`}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Icon size={15} />
                        {label}
                      </button>
                    );
                  })}
                  <span className="ml-auto text-sm text-slate-500">{selected.operatorHint}</span>
                </div>
              </div>
            </footer>
          </div>
        </section>

        <aside
          data-enter
          className="hidden min-h-0 min-w-0 overflow-y-auto border-l border-slate-200 bg-white 2xl:block"
        >
          <header className="border-b border-slate-200 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Detail
            </p>
            <h3 className="mt-1 text-lg font-semibold">订单与风险</h3>
          </header>

          <div className="space-y-5 p-5">
            <section className="rounded-md border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="font-semibold">{selected.orderId}</h4>
                <ChevronRight size={16} className="text-slate-400" />
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">商品</dt>
                  <dd className="text-right font-medium">{selected.product}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">金额</dt>
                  <dd className="font-medium">{selected.amount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">状态</dt>
                  <dd className="font-medium">{selected.orderStatus}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">等待</dt>
                  <dd className="font-medium">{selected.waitTime}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-md border border-slate-200 p-4">
              <div className="mb-3 font-semibold">判断依据</div>
              <div className="space-y-3">
                {selected.facts.map((fact) => (
                  <div key={fact} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check size={14} className="mt-0.5 text-emerald-600" />
                    <span>{fact}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-slate-200 p-4">
              <div className="mb-2 font-semibold">处理边界</div>
              <p className="text-sm leading-6 text-slate-600">
                低风险由系统自动完成；中风险需要确认；高风险只允许人工接管或主管审核。
              </p>
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}
