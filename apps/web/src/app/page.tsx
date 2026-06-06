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
  fetchChannelEventAuditSummary,
  fetchChannelEvents,
  fetchChannelEventOperationAudits,
  fetchApiReadiness,
  fetchChannelEventMetrics,
  createOperatorAccount,
  fetchCases,
  fetchCurrentOperator,
  fetchOperatorAccounts,
  ignoreChannelEvent,
  loginOperator,
  logoutOperator,
  replayChannelEvent,
  recoverStaleChannelEvents,
  updateOperatorAccount,
  type ApiReadiness,
  type ChannelEventAuditSummary,
  type ChannelEventOperationAudit,
  type ChannelEventQueueMetrics,
  type ChannelEventSummary,
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
type QueueOperationsSummary = {
  tone: "ok" | "warn" | "danger" | "muted";
  title: string;
  description: string;
  pendingCount: number;
  staleProcessingCount: number;
  oldestPendingAgeSeconds: number | null;
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
  const [channelEvents, setChannelEvents] = useState<ChannelEventSummary[]>([]);
  const [channelEventsLoading, setChannelEventsLoading] = useState(false);
  const [channelEventError, setChannelEventError] = useState("");
  const [queueReadiness, setQueueReadiness] = useState<ApiReadiness>();
  const [queueMetrics, setQueueMetrics] = useState<ChannelEventQueueMetrics>();
  const [queueOpsLoading, setQueueOpsLoading] = useState(false);
  const [queueOpsError, setQueueOpsError] = useState("");
  const [queueRecoveryMessage, setQueueRecoveryMessage] = useState("");
  const [queueRecoveryLoading, setQueueRecoveryLoading] = useState(false);
  const [queueOperationAudits, setQueueOperationAudits] = useState<
    ChannelEventOperationAudit[]
  >([]);
  const [queueAuditSummary, setQueueAuditSummary] =
    useState<ChannelEventAuditSummary>();
  const [selectedChannelEventId, setSelectedChannelEventId] = useState<string>();
  const [channelEventActionId, setChannelEventActionId] = useState("");
  const [channelEventActionError, setChannelEventActionError] = useState("");
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
        setChannelEventsLoading(true);
        setQueueOpsLoading(true);
        const [
          data,
          eventResult,
          readinessResult,
          metricsResult,
          auditResult,
          auditSummaryResult,
        ] = await Promise.all([
          fetchCases(),
          fetchChannelEvents()
            .then((events) => ({ ok: true as const, events }))
            .catch((error: unknown) => ({ ok: false as const, error })),
          fetchApiReadiness()
            .then((readiness) => ({ ok: true as const, readiness }))
            .catch((error: unknown) => ({ ok: false as const, error })),
          fetchChannelEventMetrics()
            .then((metrics) => ({ ok: true as const, metrics }))
            .catch((error: unknown) => ({ ok: false as const, error })),
          session.operator.role === "admin"
            ? fetchChannelEventOperationAudits()
                .then((audits) => ({ ok: true as const, audits }))
                .catch((error: unknown) => ({ ok: false as const, error }))
            : Promise.resolve({ ok: true as const, audits: [] }),
          session.operator.role === "admin"
            ? fetchChannelEventAuditSummary()
                .then((summary) => ({ ok: true as const, summary }))
                .catch((error: unknown) => ({ ok: false as const, error }))
            : Promise.resolve({ ok: true as const, summary: undefined }),
        ]);
        return {
          data,
          eventResult,
          readinessResult,
          metricsResult,
          auditResult,
          auditSummaryResult,
          operator: session.operator,
        };
      })
      .then((data) => {
        if (ignore) return;

        setOperator(data.operator);
        setChannelEventsLoading(false);
        setQueueOpsLoading(false);
        if (data.eventResult.ok) {
          setChannelEvents(data.eventResult.events);
          setChannelEventError("");
        } else {
          setChannelEvents([]);
          setChannelEventError(
            data.eventResult.error instanceof Error
              ? data.eventResult.error.message
              : "待接入消息暂时无法同步",
          );
        }

        if (data.readinessResult.ok) {
          setQueueReadiness(data.readinessResult.readiness);
        } else {
          setQueueReadiness({
            status: "unavailable",
            checkedAt: new Date().toISOString(),
          });
        }

        if (data.metricsResult.ok) {
          setQueueMetrics(data.metricsResult.metrics);
          setQueueOpsError("");
        } else {
          setQueueMetrics(undefined);
          setQueueOpsError(
            data.metricsResult.error instanceof Error
              ? data.metricsResult.error.message
              : "队列状态暂时无法同步",
          );
        }

        if (data.auditResult.ok) {
          setQueueOperationAudits(data.auditResult.audits);
        } else {
          setQueueOperationAudits([]);
        }

        if (data.auditSummaryResult.ok) {
          setQueueAuditSummary(data.auditSummaryResult.summary);
        } else {
          setQueueAuditSummary(undefined);
        }

        if (data.data.length === 0 && (!data.eventResult.ok || data.eventResult.events.length === 0)) {
          setCases([]);
          setDataState("empty");
          return;
        }

        setCases(data.data.map(mapApiCaseToUiCase));
        setDataState("ready");
      })
      .catch((error: unknown) => {
        if (ignore) return;
        setChannelEventsLoading(false);
        setQueueOpsLoading(false);

        if (error instanceof ApiError && error.status === 401) {
          setCases([]);
          setChannelEvents([]);
          setOperator(undefined);
          setQueueReadiness(undefined);
          setQueueMetrics(undefined);
          setQueueOperationAudits([]);
          setQueueAuditSummary(undefined);
          setDataState("login");
          return;
        }

        if (process.env.NEXT_PUBLIC_ENABLE_OFFLINE_DEMO === "true") {
          setQueueAuditSummary(undefined);
          setCases(fallbackCases);
          setDataState("fallback");
          return;
        }

        setCases([]);
        setChannelEvents([]);
        setQueueReadiness(undefined);
        setQueueMetrics(undefined);
        setQueueOperationAudits([]);
        setQueueAuditSummary(undefined);
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

  const filteredChannelEvents = useMemo(() => {
    if (selectedChannel === "all") return channelEvents;
    return channelEvents.filter((item) => normalizeChannel(item.channel) === selectedChannel);
  }, [channelEvents, selectedChannel]);

  const filteredAll = useMemo(() => {
    if (selectedChannel === "all") return cases;
    return cases.filter((item) => normalizeChannel(item.channel) === selectedChannel);
  }, [cases, selectedChannel]);

  const selectedChannelEvent = useMemo(
    () =>
      filteredChannelEvents.find((item) => item.id === selectedChannelEventId) ??
      (!selectedId ? filteredChannelEvents[0] : undefined),
    [filteredChannelEvents, selectedChannelEventId, selectedId],
  );

  const selected = useMemo(
    () =>
      filteredNeedAction.find((item) => item.caseId === selectedId) ??
      filteredNeedAction[0] ??
      filteredAll.find((item) => item.caseId === selectedId) ??
      filteredAll[0],
    [filteredAll, filteredNeedAction, selectedId],
  );

  const queueOperations = useMemo(
    () =>
      buildQueueOperationsSummary({
        readiness: queueReadiness,
        metrics: queueMetrics,
        loading: queueOpsLoading,
        error: queueOpsError,
      }),
    [queueMetrics, queueOpsError, queueOpsLoading, queueReadiness],
  );
  const canRecoverQueue =
    operator?.role === "admin" && (queueMetrics?.staleProcessingCount ?? 0) > 0;

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

  if (!selected && !selectedChannelEvent) {
    return null;
  }

  const currentDraft = selected
    ? replyDrafts[selected.caseId] ?? selected.customerReply ?? ""
    : "";
  const isSent = selected
    ? sentIds.includes(selected.caseId) || selected.status === "auto_resolved"
    : false;
  const isTakeover =
    selected
      ? takeoverIds.includes(selected.caseId) || selected.status === "human_takeover"
      : false;
  const canConfirmReplies = operator?.permissions.confirmReplies ?? false;
  const canTakeoverCases = operator?.permissions.takeoverCases ?? false;
  const selectedChannelMeta = getChannelMeta(
    selectedChannelEvent?.channel ?? selected?.channel ?? selectedChannel,
  );
  const canConfirm =
    Boolean(selected) &&
    canConfirmReplies &&
    selected?.status === "waiting_confirm" &&
    currentDraft.trim().length > 0;
  const headerStatus = selected
    ? selectedChannelEvent
      ? "待生成工单"
      : selected.status === "auto_resolved"
      ? "已自动处理 / 无需操作"
      : statusText[selected.status]
    : "待生成工单";

  function selectChannel(id: ChannelId) {
    setSelectedChannel(id);

    const nextList =
      id === "all"
        ? needActionCases
        : needActionCases.filter((item) => normalizeChannel(item.channel) === id);
    const nextEvents =
      id === "all"
        ? channelEvents
        : channelEvents.filter((item) => normalizeChannel(item.channel) === id);

    setSelectedId(nextList[0]?.caseId);
    setSelectedChannelEventId(nextList[0] ? undefined : nextEvents[0]?.id);
  }

  function confirmReply() {
    if (!selected) return;
    if (!canConfirm || sentIds.includes(selected.caseId)) return;
    setSentIds((items) => [...items, selected.caseId]);
  }

  function handleTakeover() {
    if (!selected) return;
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
    setChannelEvents([]);
    setQueueReadiness(undefined);
    setQueueMetrics(undefined);
    setQueueOperationAudits([]);
    setQueueAuditSummary(undefined);
    setQueueOpsError("");
    setQueueRecoveryMessage("");
    setSelectedId(undefined);
    setSelectedChannelEventId(undefined);
    setOperatorPanelOpen(false);
    setOperatorAccounts([]);
    setDataState("login");
  }

  async function handleReplayChannelEvent(event: ChannelEventSummary) {
    if (!canConfirmReplies) return;

    setChannelEventActionError("");
    setChannelEventActionId(event.id);

    try {
      const result = await replayChannelEvent(event.id);
      setChannelEvents((items) => items.filter((item) => item.id !== event.id));
      setSelectedChannelEventId(undefined);
      setSelectedId(result.caseId);
      loadCases();
    } catch (error) {
      setChannelEventActionError(
        error instanceof Error ? error.message : "待接入消息生成工单失败",
      );
    } finally {
      setChannelEventActionId("");
    }
  }

  async function handleIgnoreChannelEvent(event: ChannelEventSummary) {
    if (!canConfirmReplies) return;

    setChannelEventActionError("");
    setChannelEventActionId(event.id);

    try {
      await ignoreChannelEvent(event.id, "客服在工作台标记为不处理");
      setChannelEvents((items) => items.filter((item) => item.id !== event.id));
      setSelectedChannelEventId(undefined);
    } catch (error) {
      setChannelEventActionError(
        error instanceof Error ? error.message : "待接入消息忽略失败",
      );
    } finally {
      setChannelEventActionId("");
    }
  }

  async function handleRecoverQueue() {
    if (!canRecoverQueue || queueRecoveryLoading) return;

    setQueueRecoveryLoading(true);
    setQueueRecoveryMessage("");
    setQueueOpsError("");

    try {
      const result = await recoverStaleChannelEvents({
        olderThanMinutes: queueMetrics?.staleAfterMinutes ?? 15,
        limit: 50,
      });
      setQueueRecoveryMessage(`已恢复 ${result.recoveredCount} 条卡住消息`);
      loadCases();
    } catch (error) {
      setQueueOpsError(
        error instanceof Error ? error.message : "卡住的消息暂时无法恢复",
      );
    } finally {
      setQueueRecoveryLoading(false);
    }
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
            <div className="mb-3 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Inbox size={15} />
                  待接入消息
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {filteredChannelEvents.length}
                </span>
              </div>

              {channelEventError ? (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 ring-1 ring-amber-100">
                  {channelEventError}
                </div>
              ) : channelEventsLoading ? (
                <div className="rounded-lg bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
                  正在同步待接入消息
                </div>
              ) : filteredChannelEvents.length > 0 ? (
                <div className="space-y-2">
                  {filteredChannelEvents.map((event) => (
                    <ChannelEventQueueItem
                      key={event.id}
                      event={event}
                      active={event.id === selectedChannelEvent?.id}
                      onClick={() => {
                        setSelectedChannelEventId(event.id);
                        setSelectedId(undefined);
                        setChannelEventActionError("");
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
                  暂无待接入消息
                </div>
              )}
            </div>

            {filteredNeedAction.length > 0 ? (
              <div className="space-y-2">
                {filteredNeedAction.map((item) => (
                  <QueueItem
                    key={item.caseId}
                    item={item}
                    active={!selectedChannelEvent && item.caseId === selected?.caseId}
                    onClick={() => {
                      setSelectedId(item.caseId);
                      setSelectedChannelEventId(undefined);
                    }}
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
            <QueueOperationsPanel
              summary={queueOperations}
              autoResolvedCount={autoResolvedCases.length}
              auditSummary={queueAuditSummary}
              operationAudits={queueOperationAudits}
              recoveryMessage={queueRecoveryMessage}
              canRecover={canRecoverQueue}
              recovering={queueRecoveryLoading}
              onRecover={handleRecoverQueue}
            />
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
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                      selected && !selectedChannelEvent
                        ? statusClass[selected.status]
                        : "bg-blue-50 text-blue-700 ring-blue-100"
                    }`}
                  >
                    {headerStatus}
                  </span>
                  {selected && !selectedChannelEvent ? (
                    <span className={`text-xs font-semibold ${riskClass[selected.riskLevel]}`}>
                      {riskText[selected.riskLevel]}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2 truncate text-xl font-semibold tracking-tight">
                  {selectedChannelEvent
                    ? `待接入消息 · ${selectedChannelEvent.senderName}`
                    : selected
                      ? `${categoryText[selected.category]} · ${selected.customerName}`
                      : "待接入消息"}
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
                {selected && !selectedChannelEvent ? (
                  <>
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
                  </>
                ) : null}
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
                {selectedChannelEvent ? (
                  <>
                    <MessageBubble
                      align="left"
                      eyebrow={selectedChannelEvent.senderName}
                      body={selectedChannelEvent.text}
                    />
                    <MessageBubble
                      align="left"
                      tone="system"
                      eyebrow="接入前检查"
                      body="这条消息来自已接入渠道，尚未生成售后工单。确认需要处理后，可生成工单进入人工确认流程；重复或无效消息可以不处理。"
                    />
                    {channelEventActionError ? (
                      <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700 ring-1 ring-rose-100">
                        {channelEventActionError}
                      </div>
                    ) : null}
                  </>
                ) : selected ? (
                  <>
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
                  </>
                ) : null}

                {selected && showAudit ? (
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
                {selectedChannelEvent ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <Clock3 size={16} className="text-blue-600" />
                        等待接入处理
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        生成工单后进入人工确认流程；不处理会从待接入消息中移除。
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleIgnoreChannelEvent(selectedChannelEvent)}
                        disabled={!canConfirmReplies || channelEventActionId === selectedChannelEvent.id}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        <X size={15} />
                        不处理
                      </button>
                      <button
                        onClick={() => handleReplayChannelEvent(selectedChannelEvent)}
                        disabled={!canConfirmReplies || channelEventActionId === selectedChannelEvent.id}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-300"
                      >
                        <ClipboardCheck size={15} />
                        {channelEventActionId === selectedChannelEvent.id ? "正在生成" : "生成工单"}
                      </button>
                    </div>
                  </div>
                ) : selected ? (
                  <>
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
                          actionLabels[action.type as keyof typeof actionLabels] ??
                          actionLabels.send_channel_reply;
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
                  </>
                ) : null}
              </div>
            </footer>
          </div>
        </section>

        <aside className="hidden min-h-0 min-w-0 overflow-y-auto border-t border-slate-200 bg-white lg:block lg:border-l lg:border-t-0">
          <div className="space-y-4 p-4 xl:p-5">
            {selectedChannelEvent ? (
              <>
                <section className="rounded-xl bg-slate-950 p-4 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-300">当前处理</p>
                      <h3 className="mt-1 text-lg font-semibold">待接入消息</h3>
                    </div>
                    <Inbox className="text-blue-300" size={24} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    这条客户消息还未生成售后工单，生成后才会进入人工确认队列。
                  </p>
                </section>

                <InfoSection title="客户与渠道">
                  <InfoRow label="客户" value={selectedChannelEvent.senderName} />
                  <InfoRow label="渠道" value={getChannelMeta(selectedChannelEvent.channel).label} />
                  <InfoRow label="收到时间" value={formatShortTime(selectedChannelEvent.receivedAt)} />
                </InfoSection>

                <InfoSection title="客户消息">
                  <p className="text-sm leading-6 text-slate-600">{selectedChannelEvent.text}</p>
                </InfoSection>
              </>
            ) : selected ? (
              <>
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
                    <Metric
                      label="风险等级"
                      value={riskText[selected.riskLevel]}
                      emphasis={riskClass[selected.riskLevel]}
                    />
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
              </>
            ) : null}
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

function QueueOperationsPanel({
  summary,
  autoResolvedCount,
  auditSummary,
  operationAudits,
  recoveryMessage,
  canRecover,
  recovering,
  onRecover,
}: {
  summary: QueueOperationsSummary;
  autoResolvedCount: number;
  auditSummary?: ChannelEventAuditSummary;
  operationAudits: ChannelEventOperationAudit[];
  recoveryMessage: string;
  canRecover: boolean;
  recovering: boolean;
  onRecover: () => void;
}) {
  const toneClass = {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    warn: "bg-amber-50 text-amber-800 ring-amber-100",
    danger: "bg-rose-50 text-rose-700 ring-rose-100",
    muted: "bg-slate-50 text-slate-600 ring-slate-200",
  }[summary.tone];
  const Icon =
    summary.tone === "danger"
      ? AlertTriangle
      : summary.tone === "warn"
        ? Clock3
        : PackageCheck;
  const handledCount = auditSummary
    ? auditSummary.totals.replayedCount + auditSummary.totals.ignoredCount
    : 0;
  const topOperator = auditSummary?.byOperator[0];

  return (
    <div className="space-y-2">
      <div className={`rounded-lg px-3 py-2 ring-1 ${toneClass}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon size={15} className="shrink-0" />
            <span className="truncate text-sm font-semibold">{summary.title}</span>
          </div>
          <span className="shrink-0 text-xs font-semibold">
            {summary.pendingCount} 待接入
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-85">
          {summary.description}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <MiniQueueMetric label="已处理" value={String(autoResolvedCount)} />
        <MiniQueueMetric
          label="卡住"
          value={String(summary.staleProcessingCount)}
          tone={summary.staleProcessingCount > 0 ? "danger" : "normal"}
        />
        <MiniQueueMetric
          label="最久等待"
          value={formatDuration(summary.oldestPendingAgeSeconds)}
        />
      </div>

      {auditSummary ? (
        <div className="rounded-lg bg-white p-2.5 text-xs ring-1 ring-slate-200">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-700">近24小时</span>
            <span className="shrink-0 text-slate-400">
              {formatShortTime(auditSummary.measuredAt)}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <MiniQueueMetric
              label="生成工单"
              value={String(auditSummary.totals.replayedCount)}
            />
            <MiniQueueMetric
              label="不处理"
              value={String(auditSummary.totals.ignoredCount)}
            />
            <MiniQueueMetric
              label="恢复"
              value={String(auditSummary.totals.recoveredEventCount)}
            />
            <MiniQueueMetric label="合计" value={String(handledCount)} />
          </div>
          {topOperator ? (
            <div className="mt-2 truncate border-t border-slate-100 pt-2 text-slate-500">
              {topOperator.operatorId} 最近处理{" "}
              {formatShortTime(topOperator.lastActivityAt ?? auditSummary.measuredAt)}
            </div>
          ) : null}
        </div>
      ) : null}

      {canRecover ? (
        <button
          type="button"
          onClick={onRecover}
          disabled={recovering}
          className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-300"
        >
          <RefreshCw size={13} className={recovering ? "animate-spin" : ""} />
          {recovering ? "正在恢复" : "恢复卡住消息"}
        </button>
      ) : null}

      {recoveryMessage ? (
        <p className="text-xs leading-5 text-emerald-700">{recoveryMessage}</p>
      ) : null}

      {operationAudits.length > 0 ? (
        <div className="space-y-1.5 border-t border-slate-100 pt-2">
          <div className="text-xs font-semibold text-slate-500">最近处理记录</div>
          {operationAudits.slice(0, 2).map((audit) => (
            <div key={audit.id} className="text-xs leading-5 text-slate-600">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {audit.operatorId} 恢复 {audit.recoveredCount} 条卡住消息
                </span>
                <span className="shrink-0 text-slate-400">
                  {formatShortTime(audit.createdAt)}
                </span>
              </div>
              <div className="truncate text-slate-400">
                {formatRecoveryAuditStatus(audit)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MiniQueueMetric({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "danger";
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-slate-400">{label}</div>
      <div
        className={`mt-0.5 truncate font-semibold ${
          tone === "danger" ? "text-rose-700" : "text-slate-800"
        }`}
      >
        {value}
      </div>
    </div>
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

function ChannelEventQueueItem({
  event,
  active,
  onClick,
}: {
  event: ChannelEventSummary;
  active: boolean;
  onClick: () => void;
}) {
  const channel = getChannelMeta(event.channel);

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg p-2.5 text-left transition ${
        active
          ? "bg-blue-950 text-white"
          : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{event.senderName}</div>
          <p className={active ? "mt-1 truncate text-xs text-blue-100" : "mt-1 truncate text-xs text-slate-500"}>
            {event.text}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
            active ? "bg-white/10 text-white ring-white/15" : channel.badgeClass
          }`}
        >
          {channel.shortLabel}
        </span>
      </div>
      <div className={active ? "mt-2 text-xs text-blue-100" : "mt-2 text-xs text-slate-400"}>
        {formatShortTime(event.receivedAt)}
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

function buildQueueOperationsSummary({
  readiness,
  metrics,
  loading,
  error,
}: {
  readiness?: ApiReadiness;
  metrics?: ChannelEventQueueMetrics;
  loading: boolean;
  error: string;
}): QueueOperationsSummary {
  const queue = readiness?.channelQueue;
  const pendingCount = metrics?.pendingCount ?? queue?.pendingCount ?? 0;
  const staleProcessingCount =
    metrics?.staleProcessingCount ?? queue?.staleProcessingCount ?? 0;
  const oldestPendingAgeSeconds =
    metrics?.oldestPendingAgeSeconds ?? queue?.oldestPendingAgeSeconds ?? null;

  if (loading) {
    return {
      tone: "muted",
      title: "队列同步中",
      description: "正在刷新接入消息和处理状态。",
      pendingCount,
      staleProcessingCount,
      oldestPendingAgeSeconds,
    };
  }

  if (error || readiness?.status === "unavailable" || readiness?.status === "unhealthy") {
    return {
      tone: "danger",
      title: "队列状态不可用",
      description: error || "暂时无法确认接入消息是否积压，请稍后刷新。",
      pendingCount,
      staleProcessingCount,
      oldestPendingAgeSeconds,
    };
  }

  if (staleProcessingCount > 0) {
    return {
      tone: "danger",
      title: "有消息卡住",
      description: "有接入消息停留在处理中，管理员可先恢复后再处理。",
      pendingCount,
      staleProcessingCount,
      oldestPendingAgeSeconds,
    };
  }

  if (readiness?.status === "degraded" || queue?.status === "degraded") {
    return {
      tone: "warn",
      title: "接入消息积压",
      description: "待接入消息等待时间或数量偏高，请优先处理新消息。",
      pendingCount,
      staleProcessingCount,
      oldestPendingAgeSeconds,
    };
  }

  return {
    tone: "ok",
    title: "接入正常",
    description: "消息接入和处理节奏正常。",
    pendingCount,
    staleProcessingCount,
    oldestPendingAgeSeconds,
  };
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

function formatShortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRecoveryAuditStatus(audit: ChannelEventOperationAudit) {
  const recoveredBefore = formatShortTime(audit.recoveredBefore);
  const staleCount = audit.queueAfter?.staleProcessingCount ?? 0;

  if (audit.queueHealthyAfter || staleCount === 0) {
    return `恢复至 ${recoveredBefore} 前 · 队列已恢复`;
  }

  return `恢复至 ${recoveredBefore} 前 · 仍有 ${staleCount} 条卡住`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "-";
  if (seconds < 60) return `${seconds} 秒`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}小时${remainingMinutes}分` : `${hours}小时`;
}
