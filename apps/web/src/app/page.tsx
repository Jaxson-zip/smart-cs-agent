"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Headphones,
  History,
  Home,
  Inbox,
  LockKeyhole,
  LogIn,
  LogOut,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  TicketCheck,
  Truck,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { AfterSalesCategory, RiskLevel } from "@smart-cs-agent/shared";
import {
  ApiError,
  createOperatorAccount,
  fetchCases,
  fetchCurrentOperator,
  fetchOperatorAccounts,
  loginOperator,
  logoutOperator,
  updateOperatorAccount,
  type OperatorAccountSummary,
  type OperatorProfile,
} from "../lib/api";
import { fallbackCases, mapApiCaseToUiCase, type QueueStatus, type UiCase } from "../lib/cases";

type ChannelId = "all" | "wechat" | "taobao" | "douyin" | "shopify" | "email";
type DataState = "loading" | "login" | "ready" | "empty" | "fallback" | "error";
type NewOperatorForm = {
  username: string;
  password: string;
  operatorId: string;
  role: OperatorProfile["role"];
};

type ChannelMeta = {
  id: ChannelId;
  label: string;
  shortLabel: string;
  badgeClass: string;
};

const channelTabs: ChannelMeta[] = [
  {
    id: "all",
    label: "全部渠道",
    shortLabel: "全部",
    badgeClass: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  {
    id: "wechat",
    label: "企微",
    shortLabel: "企微",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
  {
    id: "taobao",
    label: "淘宝",
    shortLabel: "淘宝",
    badgeClass: "bg-orange-50 text-orange-700 ring-orange-100",
  },
  {
    id: "douyin",
    label: "抖音",
    shortLabel: "抖音",
    badgeClass: "bg-zinc-100 text-zinc-800 ring-zinc-200",
  },
  {
    id: "shopify",
    label: "独立站",
    shortLabel: "独立站",
    badgeClass: "bg-sky-50 text-sky-700 ring-sky-100",
  },
  {
    id: "email",
    label: "邮件",
    shortLabel: "邮件",
    badgeClass: "bg-violet-50 text-violet-700 ring-violet-100",
  },
];

const categoryText: Record<AfterSalesCategory, string> = {
  address_change: "修改地址",
  logistics: "物流问题",
  damage_compensation: "破损补偿",
  refund_return: "退款退货",
  compensation_rejected: "补偿协商",
  complaint_escalation: "投诉升级",
  unknown: "待判定",
};

const riskText: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

const statusText: Record<QueueStatus, string> = {
  auto_resolved: "已自动处理",
  waiting_confirm: "待确认",
  human_takeover: "需接管",
};

const roleText: Record<OperatorProfile["role"], string> = {
  admin: "管理员",
  operator: "客服",
  viewer: "只读",
};

const statusClass: Record<QueueStatus, string> = {
  auto_resolved: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  waiting_confirm: "bg-amber-50 text-amber-800 ring-amber-100",
  human_takeover: "bg-rose-50 text-rose-700 ring-rose-100",
};

const riskClass: Record<RiskLevel, string> = {
  low: "text-emerald-700",
  medium: "text-amber-700",
  high: "text-rose-700",
};

const actionLabels = {
  change_address: { label: "修改地址", Icon: Home },
  query_logistics: { label: "查看物流", Icon: Truck },
  issue_coupon: { label: "确认补偿", Icon: TicketCheck },
  create_handoff: { label: "接管工单", Icon: Headphones },
  create_supervisor_review: { label: "升级主管", Icon: ShieldAlert },
  send_channel_reply: { label: "回复客户", Icon: Send },
};

export default function OperatorWorkbench() {
  const [cases, setCases] = useState<UiCase[]>([]);
  const [dataState, setDataState] = useState<DataState>("loading");
  const [selectedChannel, setSelectedChannel] = useState<ChannelId>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [takeoverIds, setTakeoverIds] = useState<string[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [syncError, setSyncError] = useState("售后工单暂时无法同步，请稍后重试。");
  const [operator, setOperator] = useState<OperatorProfile>();
  const [operatorPanelOpen, setOperatorPanelOpen] = useState(false);
  const [operatorAccounts, setOperatorAccounts] = useState<OperatorAccountSummary[]>([]);
  const [operatorAccountsLoading, setOperatorAccountsLoading] = useState(false);
  const [operatorAccountsError, setOperatorAccountsError] = useState("");
  const [operatorAccountSaving, setOperatorAccountSaving] = useState("");
  const [newOperator, setNewOperator] = useState({
    username: "",
    password: "",
    operatorId: "",
    role: "operator",
  } satisfies NewOperatorForm);

  const loadCases = useCallback(() => {
    let ignore = false;

    fetchCurrentOperator()
      .then(async (session) => {
        const data = await fetchCases();
        return { data, operator: session.operator };
      })
      .then((data) => {
        if (ignore) return;

        setOperator(data.operator);

        if (data.data.length === 0) {
          setCases([]);
          setDataState("empty");
          return;
        }

        setCases(data.data.map(mapApiCaseToUiCase));
        setDataState("ready");
      })
      .catch((error: unknown) => {
        if (ignore) return;

        if (error instanceof ApiError && error.status === 401) {
          setCases([]);
          setOperator(undefined);
          setDataState("login");
          return;
        }

        if (process.env.NEXT_PUBLIC_ENABLE_OFFLINE_DEMO === "true") {
          setCases(fallbackCases);
          setDataState("fallback");
          return;
        }

        setCases([]);
        setSyncError(
          error instanceof Error
            ? error.message
            : "售后工单暂时无法同步，请稍后重试。",
        );
        setDataState("error");
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    return loadCases();
  }, [loadCases]);

  const loadOperatorAccounts = useCallback(async () => {
    if (!operator?.permissions.manageOperators) return;

    setOperatorAccountsLoading(true);
    setOperatorAccountsError("");

    try {
      setOperatorAccounts(await fetchOperatorAccounts());
    } catch (error) {
      setOperatorAccountsError(
        error instanceof Error ? error.message : "客服账号暂时无法同步",
      );
    } finally {
      setOperatorAccountsLoading(false);
    }
  }, [operator?.permissions.manageOperators]);

  const needActionCases = useMemo(
    () => cases.filter((item) => item.status !== "auto_resolved"),
    [cases],
  );

  const autoResolvedCases = useMemo(
    () => cases.filter((item) => item.status === "auto_resolved"),
    [cases],
  );

  const filteredNeedAction = useMemo(() => {
    if (selectedChannel === "all") return needActionCases;
    return needActionCases.filter((item) => normalizeChannel(item.channel) === selectedChannel);
  }, [needActionCases, selectedChannel]);

  const filteredAll = useMemo(() => {
    if (selectedChannel === "all") return cases;
    return cases.filter((item) => normalizeChannel(item.channel) === selectedChannel);
  }, [cases, selectedChannel]);

  const selected = useMemo(
    () =>
      filteredNeedAction.find((item) => item.caseId === selectedId) ??
      filteredNeedAction[0] ??
      filteredAll.find((item) => item.caseId === selectedId) ??
      filteredAll[0],
    [filteredAll, filteredNeedAction, selectedId],
  );

  if (dataState === "loading") {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] px-6 text-slate-700">
        <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
          正在同步售后工单
        </div>
      </main>
    );
  }

  if (dataState === "login") {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] px-5 text-slate-950">
        <section className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
              <LockKeyhole size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">客服工作台登录</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                登录后只会看到当前账号有权限处理的售后工单。
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">账号</span>
              <span className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-slate-400 focus-within:bg-white">
                <UserRound size={16} className="text-slate-400" />
                <input
                  value={loginForm.username}
                  onChange={(event) =>
                    setLoginForm((form) => ({
                      ...form,
                      username: event.target.value,
                    }))
                  }
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  autoComplete="username"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">密码</span>
              <span className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-slate-400 focus-within:bg-white">
                <LockKeyhole size={16} className="text-slate-400" />
                <input
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((form) => ({
                      ...form,
                      password: event.target.value,
                    }))
                  }
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  type="password"
                  autoComplete="current-password"
                />
              </span>
            </label>

            {loginError ? (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700 ring-1 ring-rose-100">
                {loginError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loginLoading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-400"
            >
              <LogIn size={16} />
              {loginLoading ? "正在登录" : "进入工作台"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (dataState === "error") {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] px-5 text-slate-950">
        <section className="w-full max-w-[460px] rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-700">
            <AlertTriangle size={22} />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">工单暂时无法同步</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{syncError}</p>
          <button
            onClick={() => {
              setDataState("loading");
              loadCases();
            }}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            重新同步
          </button>
        </section>
      </main>
    );
  }

  if (dataState === "empty") {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] px-6 text-slate-900">
        <section className="max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <Inbox className="mx-auto text-slate-400" size={36} />
          <h1 className="mt-4 text-lg font-semibold">当前没有待处理售后</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            新的客户售后进入后，会按风险自动分流到这里。
          </p>
        </section>
      </main>
    );
  }

  if (!selected) {
    return null;
  }

  const currentDraft = replyDrafts[selected.caseId] ?? selected.customerReply ?? "";
  const isSent = sentIds.includes(selected.caseId) || selected.status === "auto_resolved";
  const isTakeover =
    takeoverIds.includes(selected.caseId) || selected.status === "human_takeover";
  const canConfirmReplies = operator?.permissions.confirmReplies ?? false;
  const canTakeoverCases = operator?.permissions.takeoverCases ?? false;
  const selectedChannelMeta = getChannelMeta(selected.channel);
  const canConfirm =
    canConfirmReplies &&
    selected.status === "waiting_confirm" &&
    currentDraft.trim().length > 0;
  const headerStatus = selected.status === "auto_resolved" ? "已自动处理 / 无需操作" : statusText[selected.status];

  function selectChannel(id: ChannelId) {
    setSelectedChannel(id);

    const nextList =
      id === "all"
        ? needActionCases
        : needActionCases.filter((item) => normalizeChannel(item.channel) === id);

    setSelectedId(nextList[0]?.caseId);
  }

  function confirmReply() {
    if (!canConfirm || sentIds.includes(selected.caseId)) return;
    setSentIds((items) => [...items, selected.caseId]);
  }

  function handleTakeover() {
    if (!canTakeoverCases) return;
    if (takeoverIds.includes(selected.caseId)) return;
    setTakeoverIds((items) => [...items, selected.caseId]);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      const session = await loginOperator(loginForm.username.trim(), loginForm.password);
      setOperator(session.operator);
      setDataState("loading");
      loadCases();
    } catch {
      setLoginError("账号或密码不正确，或登录服务暂时不可用。");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await logoutOperator();
    setOperator(undefined);
    setCases([]);
    setSelectedId(undefined);
    setOperatorPanelOpen(false);
    setOperatorAccounts([]);
    setDataState("login");
  }

  async function openOperatorPanel() {
    setOperatorPanelOpen(true);
    await loadOperatorAccounts();
  }

  async function handleCreateOperator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newOperator.username || !newOperator.password || !newOperator.operatorId) {
      setOperatorAccountsError("请填写账号、密码和客服 ID");
      return;
    }

    setOperatorAccountSaving("create");
    setOperatorAccountsError("");

    try {
      await createOperatorAccount(newOperator);
      setNewOperator({
        username: "",
        password: "",
        operatorId: "",
        role: "operator",
      });
      await loadOperatorAccounts();
    } catch (error) {
      setOperatorAccountsError(
        error instanceof Error ? error.message : "客服账号创建失败",
      );
    } finally {
      setOperatorAccountSaving("");
    }
  }

  async function handleUpdateOperatorAccount(
    account: OperatorAccountSummary,
    input: {
      role?: OperatorProfile["role"];
      disabled?: boolean;
      revokeSessions?: boolean;
    },
  ) {
    setOperatorAccountSaving(account.operatorId);
    setOperatorAccountsError("");

    try {
      const updated = await updateOperatorAccount(account.operatorId, input);
      setOperatorAccounts((items) =>
        items.map((item) =>
          item.operatorId === updated.operatorId ? updated : item,
        ),
      );
    } catch (error) {
      setOperatorAccountsError(
        error instanceof Error ? error.message : "客服账号更新失败",
      );
    } finally {
      setOperatorAccountSaving("");
    }
  }

  return (
    <main className="cs-workbench h-dvh overflow-hidden bg-[#f4f6f8] text-slate-950">
      <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(180px,34dvh)_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)_312px] lg:grid-rows-1 xl:grid-cols-[300px_minmax(0,1fr)_336px]">
        <aside className="flex min-h-0 min-w-0 flex-col border-b border-slate-200 bg-white lg:border-b-0 lg:border-r">
          <header className="shrink-0 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">售后工作台</p>
                <h1 className="mt-0.5 text-xl font-semibold tracking-tight">工单队列</h1>
                {operator ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {operator.username} · {roleText[operator.role]}
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg bg-slate-950 px-3 py-1.5 text-right text-white">
                <div className="text-base font-semibold">{needActionCases.length}</div>
                <div className="text-[11px] text-slate-300">待处理</div>
              </div>
            </div>

            {dataState === "fallback" ? (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 ring-1 ring-amber-100">
                当前使用演示工单，数据暂未同步。
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 ring-1 ring-slate-200">
              <Search size={15} />
              <span className="truncate">搜索客户、订单、渠道</span>
            </div>
          </header>

          <section className="shrink-0 border-b border-slate-200 px-3 py-3">
            <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-2">
              {channelTabs.map((tab) => {
                const count =
                  tab.id === "all"
                    ? needActionCases.length
                    : needActionCases.filter((item) => normalizeChannel(item.channel) === tab.id).length;
                const active = selectedChannel === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => selectChannel(tab.id)}
                    className={`rounded-lg px-2.5 py-2 text-left text-sm transition ${
                      active
                        ? "bg-slate-950 text-white"
                        : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{tab.shortLabel}</span>
                      <span className={active ? "text-slate-300" : "text-slate-400"}>{count}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="min-h-[220px] flex-1 overflow-y-auto p-3 lg:min-h-0">
            {filteredNeedAction.length > 0 ? (
              <div className="space-y-2">
                {filteredNeedAction.map((item) => (
                  <QueueItem
                    key={item.caseId}
                    item={item}
                    active={item.caseId === selected.caseId}
                    onClick={() => setSelectedId(item.caseId)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid h-full min-h-[180px] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center">
                <div>
                  <ClipboardCheck className="mx-auto text-slate-400" size={28} />
                  <p className="mt-3 text-sm font-medium text-slate-700">该渠道暂无待处理</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    低风险售后会自动进入已处理记录。
                  </p>
                </div>
              </div>
            )}
          </div>

          <section className="shrink-0 border-t border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">已自动处理</span>
              <span className="font-semibold text-emerald-700">{autoResolvedCases.length}</span>
            </div>
          </section>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col bg-[#f7f9fb]">
          <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 xl:px-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${selectedChannelMeta.badgeClass}`}
                  >
                    {selectedChannelMeta.label}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusClass[selected.status]}`}>
                    {headerStatus}
                  </span>
                  <span className={`text-xs font-semibold ${riskClass[selected.riskLevel]}`}>
                    {riskText[selected.riskLevel]}
                  </span>
                </div>
                <h2 className="mt-2 truncate text-xl font-semibold tracking-tight">
                  {categoryText[selected.category]} · {selected.customerName}
                </h2>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2">
                {operator?.permissions.manageOperators ? (
                  <button
                    onClick={openOperatorPanel}
                    data-testid="open-operator-accounts"
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 sm:px-3"
                    aria-label="客服账号"
                  >
                    <UsersRound size={15} />
                    <span className="hidden sm:inline">客服账号</span>
                  </button>
                ) : null}
                <button
                  onClick={() => setShowAudit((value) => !value)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 sm:px-3"
                  aria-label="审计"
                >
                  <History size={15} />
                  <span className="hidden sm:inline">审计</span>
                  <ChevronDown
                    size={14}
                    className={`transition ${showAudit ? "rotate-180" : ""}`}
                  />
                </button>
                <button
                  onClick={handleTakeover}
                  disabled={selected.status === "auto_resolved" || !canTakeoverCases}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 sm:px-3"
                  aria-label="接管"
                >
                  <Headphones size={15} />
                  <span className="hidden sm:inline">接管</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 sm:px-3"
                  aria-label="退出"
                >
                  <LogOut size={15} />
                  <span className="hidden sm:inline">退出</span>
                </button>
              </div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 xl:px-5">
              <div className="mx-auto flex max-w-5xl flex-col gap-3">
                <MessageBubble
                  align="left"
                  eyebrow={selected.customerName}
                  body={selected.customerMessage}
                />

                <MessageBubble
                  align="left"
                  tone="system"
                  eyebrow="处理建议"
                  body={selected.systemResult}
                />

                {currentDraft ? (
                  <MessageBubble
                    align="right"
                    tone={isSent ? "sent" : "draft"}
                    eyebrow={isSent ? "已回复客户" : "待确认回复"}
                    body={currentDraft}
                  />
                ) : null}

                {showAudit ? (
                  <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <History size={15} />
                      审计记录
                    </div>
                    <div className="space-y-3">
                      {selected.auditLogs?.length ? (
                        selected.auditLogs.map((log) => (
                          <div key={log.id} className="border-l-2 border-slate-200 pl-3">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium text-slate-800">{log.title}</span>
                              <span className="text-xs text-slate-400">{log.time}</span>
                            </div>
                            <p className="mt-1 text-sm leading-6 text-slate-500">{log.summary}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">暂无审计记录。</p>
                      )}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 xl:px-5">
              <div className="mx-auto max-w-5xl">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    {selected.status === "human_takeover" ? (
                      <AlertTriangle size={16} className="text-rose-600" />
                    ) : selected.status === "auto_resolved" ? (
                      <Check size={16} className="text-emerald-600" />
                    ) : (
                      <Clock3 size={16} className="text-amber-600" />
                    )}
                    {selected.status === "auto_resolved"
                      ? "无需操作"
                      : isTakeover
                        ? "人工接管中"
                        : "等待客服确认"}
                  </div>

                  <button
                    onClick={confirmReply}
                    disabled={!canConfirm || isSent || isTakeover}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSent ? <Check size={15} /> : <Send size={15} />}
                    {isSent
                      ? "已确认"
                      : isTakeover
                        ? "需接管"
                        : canConfirmReplies
                          ? "确认回复"
                          : "无确认权限"}
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
                  disabled={isSent || selected.status === "auto_resolved"}
                  className="h-20 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-[15px] leading-6 text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white disabled:bg-slate-100 disabled:text-slate-500 xl:h-24"
                  placeholder="填写确认后要回复客户的内容"
                />

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {selected.actions?.map((action, index) => {
                    const labelInfo =
                      actionLabels[action.type as keyof typeof actionLabels] ?? actionLabels.send_channel_reply;
                    const { label, Icon } = labelInfo;

                    return (
                      <span
                        key={`${action.type}-${index}`}
                        className="inline-flex h-8 items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200"
                      >
                        <Icon size={14} />
                        {label}
                      </span>
                    );
                  })}

                  <span className="min-w-[220px] flex-1 text-sm leading-6 text-slate-500">
                    {canConfirmReplies || selected.status === "auto_resolved"
                      ? selected.operatorHint
                      : "当前账号仅可查看工单，请联系管理员调整权限。"}
                  </span>
                </div>
              </div>
            </footer>
          </div>
        </section>

        <aside className="hidden min-h-0 min-w-0 overflow-y-auto border-t border-slate-200 bg-white lg:block lg:border-l lg:border-t-0">
          <div className="space-y-4 p-4 xl:p-5">
            <section className="rounded-xl bg-slate-950 p-4 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-300">当前处理</p>
                  <h3 className="mt-1 text-lg font-semibold">{statusText[selected.status]}</h3>
                </div>
                {selected.status === "human_takeover" ? (
                  <ShieldAlert className="text-rose-300" size={24} />
                ) : selected.status === "waiting_confirm" ? (
                  <Clock3 className="text-amber-300" size={24} />
                ) : (
                  <PackageCheck className="text-emerald-300" size={24} />
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{selected.operatorHint}</p>
            </section>

            <InfoSection title="客户与订单">
              <InfoRow label="客户" value={selected.customerName} />
              <InfoRow label="订单" value={selected.orderId ?? "待同步"} />
              <InfoRow label="商品" value={selected.product} />
              <InfoRow label="金额" value={selected.amount} />
              <InfoRow label="状态" value={selected.orderStatus} />
            </InfoSection>

            <InfoSection title="分类与风险">
              <div className="grid grid-cols-2 gap-2">
                <Metric label="售后类型" value={categoryText[selected.category]} />
                <Metric label="风险等级" value={riskText[selected.riskLevel]} emphasis={riskClass[selected.riskLevel]} />
              </div>
              <div className="mt-3 space-y-2">
                {selected.facts.map((fact) => (
                  <div key={fact} className="flex items-start gap-2 text-sm leading-6 text-slate-600">
                    <Check className="mt-1 shrink-0 text-emerald-600" size={14} />
                    <span>{fact}</span>
                  </div>
                ))}
              </div>
            </InfoSection>

            <InfoSection title="处理摘要">
              <p className="text-sm leading-6 text-slate-600">{selected.systemResult}</p>
            </InfoSection>
          </div>
        </aside>
      </div>

      {operatorPanelOpen && operator?.permissions.manageOperators ? (
        <OperatorAccountsPanel
          accounts={operatorAccounts}
          form={newOperator}
          loading={operatorAccountsLoading}
          saving={operatorAccountSaving}
          error={operatorAccountsError}
          onClose={() => setOperatorPanelOpen(false)}
          onRefresh={loadOperatorAccounts}
          onCreate={handleCreateOperator}
          onFormChange={(field, value) =>
            setNewOperator((form) => ({ ...form, [field]: value }))
          }
          onUpdate={handleUpdateOperatorAccount}
        />
      ) : null}
    </main>
  );
}

function OperatorAccountsPanel({
  accounts,
  form,
  loading,
  saving,
  error,
  onClose,
  onRefresh,
  onCreate,
  onFormChange,
  onUpdate,
}: {
  accounts: OperatorAccountSummary[];
  form: NewOperatorForm;
  loading: boolean;
  saving: string;
  error: string;
  onClose: () => void;
  onRefresh: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onFormChange: (field: keyof NewOperatorForm, value: string) => void;
  onUpdate: (
    account: OperatorAccountSummary,
    input: {
      role?: OperatorProfile["role"];
      disabled?: boolean;
      revokeSessions?: boolean;
    },
  ) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/28 backdrop-blur-[2px]"
      data-testid="operator-accounts-panel"
    >
      <section className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl ring-1 ring-slate-200">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-medium text-slate-500">账号管理</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
              客服账号
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-wait disabled:text-slate-300"
              aria-label="刷新客服账号"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-lg bg-slate-950 text-white hover:bg-slate-800"
              aria-label="关闭客服账号"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700 ring-1 ring-rose-100">
              {error}
            </div>
          ) : null}

          <form
            onSubmit={onCreate}
            data-testid="operator-create-form"
            className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200"
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <UserPlus size={16} />
              新增客服
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledInput
                label="账号"
                value={form.username}
                onChange={(value) => onFormChange("username", value)}
                autoComplete="off"
              />
              <LabeledInput
                label="客服 ID"
                value={form.operatorId}
                onChange={(value) => onFormChange("operatorId", value)}
                autoComplete="off"
              />
              <LabeledInput
                label="初始密码"
                type="password"
                value={form.password}
                onChange={(value) => onFormChange("password", value)}
                autoComplete="new-password"
              />
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">
                  角色
                </span>
                <select
                  value={form.role}
                  onChange={(event) => onFormChange("role", event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                >
                  <option value="operator">客服</option>
                  <option value="viewer">只读</option>
                  <option value="admin">管理员</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={saving === "create"}
              className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-300"
            >
              <UserPlus size={15} />
              {saving === "create" ? "正在创建" : "创建账号"}
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {accounts.map((account) => {
              const isSaving = saving === account.operatorId;

              return (
                <div
                  key={account.operatorId}
                  data-operator-id={account.operatorId}
                  className="rounded-xl bg-white p-4 ring-1 ring-slate-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-950">
                          {account.username}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                            account.disabled
                              ? "bg-slate-100 text-slate-500 ring-slate-200"
                              : "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          }`}
                        >
                          {account.disabled ? "已停用" : "可使用"}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {account.operatorId} · 登录批次 {account.sessionVersion}
                      </p>
                    </div>
                    <select
                      value={account.role}
                      disabled={isSaving}
                      onChange={(event) =>
                        onUpdate(account, {
                          role: event.target.value as OperatorProfile["role"],
                        })
                      }
                      className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-slate-400 disabled:text-slate-400"
                    >
                      <option value="admin">管理员</option>
                      <option value="operator">客服</option>
                      <option value="viewer">只读</option>
                    </select>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      data-testid="operator-toggle-disabled"
                      onClick={() =>
                        onUpdate(account, { disabled: !account.disabled })
                      }
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-wait disabled:text-slate-400"
                    >
                      {account.disabled ? <Check size={15} /> : <X size={15} />}
                      {account.disabled ? "启用" : "停用"}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      data-testid="operator-revoke-session"
                      onClick={() => onUpdate(account, { revokeSessions: true })}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-wait disabled:text-slate-400"
                    >
                      <RefreshCw size={15} className={isSaving ? "animate-spin" : ""} />
                      撤销登录
                    </button>
                  </div>
                </div>
              );
            })}

            {!loading && accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                暂无客服账号
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-500">
        {label}
      </span>
      <input
        value={value}
        type={type}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
      />
    </label>
  );
}

function QueueItem({
  item,
  active,
  onClick,
}: {
  item: UiCase;
  active: boolean;
  onClick: () => void;
}) {
  const channel = getChannelMeta(item.channel);

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl p-3 text-left transition ${
        active
          ? "bg-slate-950 text-white shadow-sm"
          : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{item.customerName}</div>
          <div className={active ? "mt-1 text-xs text-slate-300" : "mt-1 text-xs text-slate-500"}>
            {item.orderId ?? "订单待同步"}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
            active ? "bg-white/10 text-white ring-white/15" : statusClass[item.status]
          }`}
        >
          {statusText[item.status]}
        </span>
      </div>

      <p className={active ? "truncate text-sm text-slate-200" : "truncate text-sm text-slate-700"}>
        {categoryText[item.category]}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 ring-1 ${
            active ? "bg-white/10 text-slate-200 ring-white/15" : channel.badgeClass
          }`}
        >
          {channel.shortLabel}
        </span>
        <span className={active ? "text-slate-300" : "text-slate-500"}>等待 {item.waitTime}</span>
      </div>
    </button>
  );
}

function MessageBubble({
  align,
  eyebrow,
  body,
  tone = "customer",
}: {
  align: "left" | "right";
  eyebrow: string;
  body: string;
  tone?: "customer" | "system" | "draft" | "sent";
}) {
  const toneClass = {
    customer: "bg-white text-slate-900 ring-slate-200",
    system: "bg-blue-50 text-slate-900 ring-blue-100",
    draft: "bg-white text-slate-900 ring-slate-300",
    sent: "bg-slate-950 text-white ring-slate-950",
  }[tone];

  const eyebrowClass = tone === "sent" ? "text-slate-300" : "text-slate-500";

  return (
    <div className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[86%] rounded-2xl px-4 py-3 text-[15px] leading-7 shadow-sm ring-1 ${toneClass} ${
          align === "right" ? "rounded-tr-md" : "rounded-tl-md"
        }`}
      >
        <div className={`mb-1 text-xs font-medium ${eyebrowClass}`}>{eyebrow}</div>
        <p>{body}</p>
      </div>
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-slate-100 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <span className="shrink-0 text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium leading-6 text-slate-800">{value}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  emphasis = "text-slate-900",
}: {
  label: string;
  value: string;
  emphasis?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${emphasis}`}>{value}</div>
    </div>
  );
}

function normalizeChannel(channel: string): ChannelId {
  const normalized = channel.toLowerCase();

  if (["wechat", "wecom", "weixin", "企微"].includes(normalized)) return "wechat";
  if (["taobao", "tmall", "淘宝", "天猫"].includes(normalized)) return "taobao";
  if (["douyin", "tiktok", "抖音"].includes(normalized)) return "douyin";
  if (["shopify", "site", "独立站"].includes(normalized)) return "shopify";
  if (["email", "mail", "邮件"].includes(normalized)) return "email";

  return "shopify";
}

function getChannelMeta(channel: string): ChannelMeta {
  const normalized = normalizeChannel(channel);
  return channelTabs.find((item) => item.id === normalized) ?? channelTabs[0];
}
