"use client";

import { useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  AlertTriangle,
  Bot,
  Check,
  CreditCard,
  Headphones,
  Home,
  PackageCheck,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRoundCheck,
  Wand2,
} from "lucide-react";

gsap.registerPlugin(useGSAP);

type ChannelId = "all" | "taobao" | "douyin" | "shopify" | "wechat";
type WorkState = "needs_confirm" | "customer_declined" | "needs_human" | "manual";
type RiskLevel = "low" | "medium" | "high";
type ActionId =
  | "modifyAddress"
  | "issueCoupon"
  | "upgradeCoupon"
  | "urgeLogistics"
  | "refund"
  | "handoff";

type WorkItem = {
  id: string;
  channelId: Exclude<ChannelId, "all">;
  channel: string;
  customer: string;
  orderId: string;
  subject: string;
  state: WorkState;
  risk: RiskLevel;
  waitTime: string;
  product: string;
  amount: string;
  orderStatus: string;
  incoming: string;
  systemResult: string;
  reply: string;
  rewrite: string;
  operatorHint: string;
  actions: ActionId[];
  primaryAction: ActionId;
  facts: string[];
};

const channelTabs: Array<{ id: ChannelId; label: string; count: number }> = [
  { id: "all", label: "全部", count: 9 },
  { id: "taobao", label: "淘宝", count: 4 },
  { id: "douyin", label: "抖音", count: 2 },
  { id: "shopify", label: "Shopify", count: 1 },
  { id: "wechat", label: "微信", count: 2 },
];

const workItems: WorkItem[] = [
  {
    id: "W-1001",
    channelId: "taobao",
    channel: "淘宝",
    customer: "林女士",
    orderId: "TB73921",
    subject: "包装破损补偿",
    state: "needs_confirm",
    risk: "medium",
    waitTime: "02:18",
    product: "Nike Air Force 1 联名款",
    amount: "¥899",
    orderStatus: "已签收",
    incoming: "鞋盒压坏了，鞋子没问题，但这是送人的，能不能补偿一下？",
    systemResult: "系统已核对订单：商品未损坏，订单未补偿过，可发 30 元券。",
    reply:
      "非常抱歉影响您的送礼体验。我们可以为您补偿 30 元无门槛券，稍后会发放到您的淘宝账户。",
    rewrite:
      "真的很抱歉，送礼场景里包装受损确实会影响体验。我们可以先为您补偿 30 元无门槛券，确认后直接发到淘宝账户。",
    operatorHint: "中风险补偿，需要客服确认后发送。客户拒绝时可升级一次。",
    actions: ["issueCoupon", "upgradeCoupon", "handoff"],
    primaryAction: "issueCoupon",
    facts: ["近 30 天无补偿记录", "商品本体未损坏", "补偿金额低于店铺上限"],
  },
  {
    id: "W-1002",
    channelId: "taobao",
    channel: "淘宝",
    customer: "林女士",
    orderId: "TB73921",
    subject: "拒绝首次补偿",
    state: "customer_declined",
    risk: "medium",
    waitTime: "03:04",
    product: "Nike Air Force 1 联名款",
    amount: "¥899",
    orderStatus: "已签收",
    incoming: "30 元太少了吧，鞋盒都这样了我还怎么送人？",
    systemResult: "客户拒绝首次补偿。系统建议升级为 50 元券；如仍拒绝，转主管。",
    reply:
      "我理解您觉得 30 元补偿不够。我们可以为您升级到 50 元无门槛券，确认后会直接发放到您的淘宝账户。",
    rewrite:
      "您说得有道理，送人的商品包装受损确实比较影响体验。我帮您升级到 50 元无门槛券，确认后直接发放。",
    operatorHint: "这是第二轮协商。不要继续自动加价，仍拒绝就转主管。",
    actions: ["upgradeCoupon", "handoff"],
    primaryAction: "upgradeCoupon",
    facts: ["客户拒绝 30 元券", "允许二轮补偿", "超过二轮需主管确认"],
  },
  {
    id: "W-1003",
    channelId: "douyin",
    channel: "抖音",
    customer: "陈先生",
    orderId: "DY11804",
    subject: "修改收货地址",
    state: "needs_confirm",
    risk: "low",
    waitTime: "00:58",
    product: "通勤双肩包",
    amount: "¥329",
    orderStatus: "待发货",
    incoming: "还没发货的话帮我改到公司，公司前台可以代收。",
    systemResult: "订单待发货，仓库未锁单。缺少完整新地址，需要追问。",
    reply: "可以的，请您把新的完整公司地址、收件人和手机号发我，我马上帮您修改。",
    rewrite: "可以改的。麻烦您补充完整公司地址、收件人和手机号，我确认后为您同步到仓库。",
    operatorHint: "信息不完整，不能直接改地址。先追问客户。",
    actions: ["modifyAddress", "handoff"],
    primaryAction: "modifyAddress",
    facts: ["订单待发货", "仓库未锁单", "缺少完整地址"],
  },
  {
    id: "W-1004",
    channelId: "shopify",
    channel: "Shopify",
    customer: "Mia",
    orderId: "SH44018",
    subject: "定制商品退款",
    state: "needs_human",
    risk: "high",
    waitTime: "07:05",
    product: "Made-to-measure dress",
    amount: "$420",
    orderStatus: "生产中",
    incoming: "The dress is custom made but it does not fit. I need a cash refund.",
    systemResult: "定制商品已进入生产，现金退款需要主管审核。",
    reply:
      "I checked your order. Because this is a made-to-measure item already in production, this request needs a manual review. A specialist will follow up in this channel.",
    rewrite:
      "I understand your concern. Since this made-to-measure item is already in production, I will have a specialist review the best available option and follow up here.",
    operatorHint: "高风险退款，不允许自动发送退款承诺。",
    actions: ["refund", "handoff"],
    primaryAction: "handoff",
    facts: ["定制商品", "已进入生产", "现金退款需主管确认"],
  },
  {
    id: "W-1005",
    channelId: "wechat",
    channel: "微信",
    customer: "王女士",
    orderId: "WX50217",
    subject: "物流停滞",
    state: "needs_confirm",
    risk: "low",
    waitTime: "01:14",
    product: "儿童保温杯",
    amount: "¥219",
    orderStatus: "运输中",
    incoming: "物流三天没动了，是不是丢件了？",
    systemResult: "物流停滞 68 小时，未超过赔付阈值。建议催派并告知客户。",
    reply:
      "我已为您查询物流，目前包裹在中转站等待更新。我会同步提交催派，后续物流变化会在微信里通知您。",
    rewrite:
      "我刚帮您看了物流，包裹还在中转站等待更新。我现在先提交催派，后续有变化会第一时间在微信通知您。",
    operatorHint: "低风险，可确认发送并执行催派。",
    actions: ["urgeLogistics", "handoff"],
    primaryAction: "urgeLogistics",
    facts: ["物流停滞 68 小时", "未超过赔付时限", "客户无历史投诉"],
  },
];

const actionMeta: Record<ActionId, { label: string; icon: typeof Home }> = {
  modifyAddress: { label: "改地址", icon: Home },
  issueCoupon: { label: "发券", icon: CreditCard },
  upgradeCoupon: { label: "升级补偿", icon: CreditCard },
  urgeLogistics: { label: "催物流", icon: Truck },
  refund: { label: "退款申请", icon: PackageCheck },
  handoff: { label: "转人工", icon: UserRoundCheck },
};

const stateText: Record<WorkState, string> = {
  needs_confirm: "待确认",
  customer_declined: "客户拒绝",
  needs_human: "需主管",
  manual: "人工中",
};

const stateClass: Record<WorkState, string> = {
  needs_confirm: "bg-sky-50 text-sky-700",
  customer_declined: "bg-violet-50 text-violet-700",
  needs_human: "bg-rose-50 text-rose-700",
  manual: "bg-amber-50 text-amber-700",
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

export default function SupportInboxDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedChannel, setSelectedChannel] = useState<ChannelId>("all");
  const [selectedId, setSelectedId] = useState(workItems[0].id);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>(
    Object.fromEntries(workItems.map((item) => [item.id, item.reply])),
  );
  const [sentIds, setSentIds] = useState<string[]>([]);

  const visibleItems = useMemo(() => {
    if (selectedChannel === "all") return workItems;
    return workItems.filter((item) => item.channelId === selectedChannel);
  }, [selectedChannel]);

  const selected = useMemo(() => {
    return (
      visibleItems.find((item) => item.id === selectedId) ??
      visibleItems[0] ??
      workItems[0]
    );
  }, [selectedId, visibleItems]);

  const currentDraft = replyDrafts[selected.id] ?? selected.reply;
  const sent = sentIds.includes(selected.id);
  const needsApproval = selected.state === "needs_human";

  useGSAP(
    () => {
      gsap.from("[data-enter]", {
        opacity: 0,
        y: 8,
        duration: 0.25,
        ease: "power2.out",
        stagger: 0.03,
      });
    },
    { scope: rootRef },
  );

  function selectChannel(id: ChannelId) {
    setSelectedChannel(id);
    const next = id === "all" ? workItems[0] : workItems.find((item) => item.channelId === id);
    if (next) setSelectedId(next.id);
  }

  function sendReply() {
    if (!sentIds.includes(selected.id)) {
      setSentIds((items) => [...items, selected.id]);
    }
  }

  function rewriteReply() {
    setReplyDrafts((drafts) => ({
      ...drafts,
      [selected.id]: selected.rewrite,
    }));
  }

  return (
    <main
      ref={rootRef}
      className="h-dvh overflow-hidden bg-[#f5f7fa] text-slate-950"
    >
      <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <aside
          data-enter
          className="hidden min-h-0 min-w-0 flex-col border-r border-slate-200 bg-white lg:flex"
        >
          <header className="shrink-0 border-b border-slate-200 px-4 py-4">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Smart CS Agent
                </p>
                <h1 className="mt-1 text-xl font-semibold">待处理会话</h1>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                自动中
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <Search size={15} />
              <span>搜索客户、订单</span>
            </div>
          </header>

          <section className="shrink-0 border-b border-slate-200 px-3 py-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              只显示需要客服看的
            </div>
            <div className="grid grid-cols-3 gap-2">
              {channelTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => selectChannel(tab.id)}
                  className={`rounded-md border px-3 py-2 text-left transition ${
                    selectedChannel === tab.id
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="text-sm font-semibold">{tab.label}</div>
                  <div
                    className={`mt-1 text-xs ${
                      selectedChannel === tab.id ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    {tab.count}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <div className="grid shrink-0 grid-cols-3 border-b border-slate-200">
            {[
              ["待确认", 5],
              ["客户拒绝", 2],
              ["需主管", 2],
            ].map(([label, value]) => (
              <div key={label} className="border-r border-slate-100 px-4 py-3 last:border-r-0">
                <div className="text-lg font-semibold">{value}</div>
                <div className="mt-1 text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {visibleItems.map((item) => {
              const active = item.id === selected.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`mb-2 w-full rounded-md border px-4 py-3 text-left transition ${
                    active
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{item.customer}</div>
                      <div className={active ? "mt-1 text-xs text-slate-300" : "mt-1 text-xs text-slate-500"}>
                        {item.channel} / {item.orderId}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                        active ? "bg-white/10 text-white" : stateClass[item.state]
                      }`}
                    >
                      {stateText[item.state]}
                    </span>
                  </div>
                  <p className={active ? "text-sm text-slate-200" : "text-sm text-slate-700"}>
                    {item.subject}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className={active ? "text-slate-300" : "text-slate-500"}>
                      等待 {item.waitTime}
                    </span>
                    <span className={active ? "text-amber-200" : "text-amber-600"}>
                      {riskText[item.risk]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section data-enter className="flex h-dvh min-h-0 min-w-0 flex-col bg-[#f8fafc]">
          <header className="flex min-h-[64px] shrink-0 flex-col justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center lg:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{selected.customer}</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${stateClass[selected.state]}`}>
                  {stateText[selected.state]}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${riskClass[selected.risk]}`}>
                  {riskText[selected.risk]}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {selected.channel} / {selected.orderId} / {selected.subject}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
                    <div className="mb-1 text-xs text-slate-500">{selected.customer}</div>
                    <p className="text-[15px] leading-7 text-slate-900">{selected.incoming}</p>
                  </div>
                </div>

                <div className="flex justify-start">
                  <div className="max-w-[84%] rounded-lg rounded-tl-sm bg-sky-50 px-4 py-3 ring-1 ring-sky-100">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-sky-700">
                      <Bot size={13} />
                      系统处理
                    </div>
                    <p className="text-[15px] leading-7 text-slate-800">{selected.systemResult}</p>
                  </div>
                </div>

                {sent ? (
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
                    {sent
                      ? "系统已发送"
                      : needsApproval
                        ? "接管后回复"
                        : "待确认回复"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={rewriteReply}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Wand2 size={15} />
                      改写
                    </button>
                    <button
                      onClick={() => setSelectedId("W-1002")}
                      className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      <AlertTriangle size={15} />
                      客户不接受
                    </button>
                    <button
                      onClick={sendReply}
                      disabled={sent || needsApproval}
                      className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {sent ? <Check size={15} /> : <Send size={15} />}
                      {sent ? "已发送" : needsApproval ? "需主管确认" : "确认发送"}
                    </button>
                  </div>
                </div>
                <textarea
                  value={currentDraft}
                  onChange={(event) =>
                    setReplyDrafts((drafts) => ({
                      ...drafts,
                      [selected.id]: event.target.value,
                    }))
                  }
                  disabled={sent || needsApproval}
                  className="h-24 w-full resize-none rounded-md border border-slate-200 bg-slate-50 p-3 text-[15px] leading-6 text-slate-850 outline-none focus:border-slate-400 disabled:bg-slate-100 disabled:text-slate-500 xl:h-28"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {selected.actions.map((actionId) => {
                    const action = actionMeta[actionId];
                    const Icon = action.icon;
                    const primary = actionId === selected.primaryAction;

                    return (
                      <button
                        key={actionId}
                        className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
                          primary
                            ? "border-slate-950 bg-slate-950 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <Icon size={15} />
                        {action.label}
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
              Customer
            </p>
            <h3 className="mt-1 text-lg font-semibold">订单与客户</h3>
          </header>

          <div className="space-y-5 p-5">
            <section>
              <h4 className="mb-3 font-semibold">{selected.orderId}</h4>
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
                  <dt className="text-slate-500">订单状态</dt>
                  <dd className="font-medium">{selected.orderStatus}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">等待时间</dt>
                  <dd className="font-medium">{selected.waitTime}</dd>
                </div>
              </dl>
            </section>

            <section className="border-t border-slate-100 pt-5">
              <div className="mb-3 font-semibold">当前判断</div>
              <p className="rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                {selected.operatorHint}
              </p>
            </section>

            <section className="border-t border-slate-100 pt-5">
              <div className="mb-3 font-semibold">客户记录</div>
              <div className="space-y-3">
                {selected.facts.map((fact) => (
                  <div key={fact} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check size={14} className="mt-0.5 text-emerald-600" />
                    <span>{fact}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}
