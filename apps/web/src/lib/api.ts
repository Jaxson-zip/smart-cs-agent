import type { AfterSalesCase } from "@smart-cs-agent/shared";
import type { ApiAfterSalesCase } from "./cases";

const OPERATOR_BFF_URL = "/api/operator";
const REQUEST_TIMEOUT_MS = 2500;

export type ApiReadiness = {
  status: "ok" | "degraded" | "unhealthy" | "unavailable";
  checkedAt: string;
  channelQueue?: ChannelQueueReadiness;
};

export type ChannelQueueReadiness = {
  status: "ok" | "degraded";
  pendingCount: number;
  processingCount: number;
  staleProcessingCount: number;
  oldestPendingAgeSeconds: number | null;
  reasons: string[];
};

export type ChannelEventQueueMetrics = {
  pendingCount: number;
  processingCount: number;
  staleProcessingCount: number;
  replayedCount: number;
  ignoredCount: number;
  oldestPendingReceivedAt: string | null;
  oldestPendingAgeSeconds: number | null;
  staleAfterMinutes: number;
  measuredAt: string;
};

export type ChannelEventRecoveryResult = {
  status: "recovered";
  recoveredCount: number;
  recoveredBefore: string;
  eventIds: string[];
};

export type OperatorLoginResult = {
  operator: OperatorProfile;
};

export type OperatorProfile = {
  username: string;
  tenantId: string;
  operatorId: string;
  role: "admin" | "operator" | "viewer";
  permissions: {
    viewCases: boolean;
    confirmReplies: boolean;
    takeoverCases: boolean;
    manageRules: boolean;
    manageOperators: boolean;
  };
};

export type OperatorAccountSummary = {
  username: string;
  tenantId: string;
  operatorId: string;
  role: OperatorProfile["role"];
  disabled: boolean;
  sessionVersion: number;
};

export type ChannelEventSummary = {
  id: string;
  channel: string;
  senderName: string;
  text: string;
  receivedAt: string;
  createdAt: string;
  reviewStatus: "pending";
};

export type ChannelEventReplayResult = {
  status: "replayed";
  eventId: string;
  caseId: string;
  automationMode: "human_confirm" | "human_takeover";
};

export type ChannelEventIgnoreResult = {
  status: "ignored";
  eventId: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function loginOperator(
  username: string,
  password: string,
): Promise<OperatorLoginResult> {
  const res = await fetchWithTimeout(`${OPERATOR_BFF_URL}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new ApiError("账号或密码不正确", res.status);
  }

  return res.json();
}

export async function fetchCurrentOperator(): Promise<OperatorLoginResult> {
  const res = await fetchWithTimeout(`${OPERATOR_BFF_URL}/me`);

  if (!res.ok) {
    throw new ApiError("请先登录客服工作台", res.status);
  }

  return res.json();
}

export async function logoutOperator(): Promise<void> {
  const res = await fetchWithTimeout(`${OPERATOR_BFF_URL}/logout`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new ApiError("退出登录失败", res.status);
  }
}

export async function fetchCases(): Promise<ApiAfterSalesCase[]> {
  const res = await fetchWithTimeout(`${OPERATOR_BFF_URL}/cases`);

  if (!res.ok) {
    throw new ApiError("售后工单暂时无法同步", res.status);
  }

  return res.json();
}

export async function fetchCaseDetails(caseId: string): Promise<AfterSalesCase> {
  const res = await fetchWithTimeout(
    `${OPERATOR_BFF_URL}/cases/${encodeURIComponent(caseId)}`,
  );

  if (!res.ok) {
    throw new ApiError("售后工单详情暂时无法同步", res.status);
  }

  return res.json();
}

export async function fetchApiReadiness(): Promise<ApiReadiness> {
  const checkedAt = new Date().toISOString();

  try {
    const res = await fetchWithTimeout(`${OPERATOR_BFF_URL}/readiness`);
    if (!res.ok) {
      return {
        status: "unavailable",
        checkedAt,
      };
    }

    const body: unknown = await res.json();

    return toApiReadiness(body, checkedAt);
  } catch {
    return {
      status: "unavailable",
      checkedAt,
    };
  }
}

export async function fetchOperatorAccounts(): Promise<OperatorAccountSummary[]> {
  const res = await fetchWithTimeout(`${OPERATOR_BFF_URL}/operators`);

  if (!res.ok) {
    throw new ApiError("客服账号暂时无法同步", res.status);
  }

  const body = (await res.json()) as { operators?: unknown };
  if (!Array.isArray(body.operators)) {
    throw new ApiError("客服账号数据格式异常", 502);
  }

  return body.operators.map(toOperatorAccountSummary);
}

export async function fetchChannelEvents(): Promise<ChannelEventSummary[]> {
  const res = await fetchWithTimeout(`${OPERATOR_BFF_URL}/channel-events`);

  if (!res.ok) {
    throw new ApiError("待接入消息暂时无法同步", res.status);
  }

  const body: unknown = await res.json();
  if (!Array.isArray(body)) {
    throw new ApiError("待接入消息数据格式异常", 502);
  }

  return body.map(toChannelEventSummary);
}

export async function fetchChannelEventMetrics(): Promise<ChannelEventQueueMetrics> {
  const res = await fetchWithTimeout(`${OPERATOR_BFF_URL}/channel-events/metrics`);

  if (!res.ok) {
    throw new ApiError("队列状态暂时无法同步", res.status);
  }

  return toChannelEventQueueMetrics(await res.json());
}

export async function recoverStaleChannelEvents(input: {
  olderThanMinutes?: number;
  limit?: number;
} = {}): Promise<ChannelEventRecoveryResult> {
  const res = await fetchWithTimeout(
    `${OPERATOR_BFF_URL}/channel-events/recover-stale`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );

  if (!res.ok) {
    throw new ApiError("卡住的消息暂时无法恢复", res.status);
  }

  return toChannelEventRecoveryResult(await res.json());
}

export async function replayChannelEvent(
  eventId: string,
): Promise<ChannelEventReplayResult> {
  const res = await fetchWithTimeout(
    `${OPERATOR_BFF_URL}/channel-events/${encodeURIComponent(eventId)}/replay`,
    { method: "POST" },
  );

  if (!res.ok) {
    throw new ApiError("待接入消息生成工单失败", res.status);
  }

  return toChannelEventReplayResult(await res.json());
}

export async function ignoreChannelEvent(
  eventId: string,
  note?: string,
): Promise<ChannelEventIgnoreResult> {
  const res = await fetchWithTimeout(
    `${OPERATOR_BFF_URL}/channel-events/${encodeURIComponent(eventId)}/ignore`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(note ? { note } : {}),
    },
  );

  if (!res.ok) {
    throw new ApiError("待接入消息忽略失败", res.status);
  }

  return toChannelEventIgnoreResult(await res.json());
}

export async function createOperatorAccount(input: {
  username: string;
  password: string;
  operatorId: string;
  role: OperatorProfile["role"];
}): Promise<OperatorAccountSummary> {
  const res = await fetchWithTimeout(`${OPERATOR_BFF_URL}/operators`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new ApiError("客服账号创建失败", res.status);
  }

  const body = (await res.json()) as { operator?: unknown };
  return toOperatorAccountSummary(body.operator);
}

export async function updateOperatorAccount(
  operatorId: string,
  input: {
    role?: OperatorProfile["role"];
    disabled?: boolean;
    revokeSessions?: boolean;
  },
): Promise<OperatorAccountSummary> {
  const res = await fetchWithTimeout(
    `${OPERATOR_BFF_URL}/operators/${encodeURIComponent(operatorId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );

  if (!res.ok) {
    throw new ApiError("客服账号更新失败", res.status);
  }

  const body = (await res.json()) as { operator?: unknown };
  return toOperatorAccountSummary(body.operator);
}

function toChannelEventSummary(value: unknown): ChannelEventSummary {
  if (!isRecord(value)) {
    throw new ApiError("待接入消息数据格式异常", 502);
  }

  return {
    id: readString(value, "id"),
    channel: readString(value, "channel"),
    senderName: readString(value, "senderName"),
    text: readString(value, "text"),
    receivedAt: readString(value, "receivedAt"),
    createdAt: readString(value, "createdAt"),
    reviewStatus: readChannelEventReviewStatus(value.reviewStatus),
  };
}

function toApiReadiness(value: unknown, checkedAt: string): ApiReadiness {
  if (!isRecord(value)) {
    return {
      status: "unavailable",
      checkedAt,
    };
  }

  const status =
    value.status === "ok" ||
    value.status === "degraded" ||
    value.status === "unhealthy"
      ? value.status
      : value.status === "ready"
        ? "ok"
        : "unavailable";
  const checks = isRecord(value.checks) ? value.checks : undefined;
  const channelQueue = checks?.channelQueue;

  return {
    status,
    checkedAt,
    channelQueue: isRecord(channelQueue)
      ? toChannelQueueReadiness(channelQueue)
      : undefined,
  };
}

function toChannelQueueReadiness(value: Record<string, unknown>): ChannelQueueReadiness {
  const status = value.status === "degraded" ? "degraded" : "ok";

  return {
    status,
    pendingCount: readFiniteNumber(value, "pendingCount"),
    processingCount: readFiniteNumber(value, "processingCount"),
    staleProcessingCount: readFiniteNumber(value, "staleProcessingCount"),
    oldestPendingAgeSeconds: readNullableFiniteNumber(
      value,
      "oldestPendingAgeSeconds",
    ),
    reasons: Array.isArray(value.reasons)
      ? value.reasons.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function toChannelEventQueueMetrics(value: unknown): ChannelEventQueueMetrics {
  if (!isRecord(value)) {
    throw new ApiError("队列状态数据格式异常", 502);
  }

  return {
    pendingCount: readFiniteNumber(value, "pendingCount"),
    processingCount: readFiniteNumber(value, "processingCount"),
    staleProcessingCount: readFiniteNumber(value, "staleProcessingCount"),
    replayedCount: readFiniteNumber(value, "replayedCount"),
    ignoredCount: readFiniteNumber(value, "ignoredCount"),
    oldestPendingReceivedAt: readNullableString(value, "oldestPendingReceivedAt"),
    oldestPendingAgeSeconds: readNullableFiniteNumber(
      value,
      "oldestPendingAgeSeconds",
    ),
    staleAfterMinutes: readFiniteNumber(value, "staleAfterMinutes"),
    measuredAt: readString(value, "measuredAt"),
  };
}

function toChannelEventRecoveryResult(value: unknown): ChannelEventRecoveryResult {
  if (!isRecord(value)) {
    throw new ApiError("卡住消息恢复结果格式异常", 502);
  }

  return {
    status: readLiteral(value.status, "recovered", "卡住消息恢复结果格式异常"),
    recoveredCount: readFiniteNumber(value, "recoveredCount"),
    recoveredBefore: readString(value, "recoveredBefore"),
    eventIds: Array.isArray(value.eventIds)
      ? value.eventIds.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function toChannelEventReplayResult(value: unknown): ChannelEventReplayResult {
  if (!isRecord(value)) {
    throw new ApiError("待接入消息生成结果格式异常", 502);
  }

  const automationMode = value.automationMode;
  if (automationMode !== "human_confirm" && automationMode !== "human_takeover") {
    throw new ApiError("待接入消息生成结果格式异常", 502);
  }

  return {
    status: readLiteral(value.status, "replayed", "待接入消息生成结果格式异常"),
    eventId: readString(value, "eventId"),
    caseId: readString(value, "caseId"),
    automationMode,
  };
}

function toChannelEventIgnoreResult(value: unknown): ChannelEventIgnoreResult {
  if (!isRecord(value)) {
    throw new ApiError("待接入消息忽略结果格式异常", 502);
  }

  return {
    status: readLiteral(value.status, "ignored", "待接入消息忽略结果格式异常"),
    eventId: readString(value, "eventId"),
  };
}

function toOperatorAccountSummary(value: unknown): OperatorAccountSummary {
  if (!isRecord(value)) {
    throw new ApiError("客服账号数据格式异常", 502);
  }

  return {
    username: readString(value, "username"),
    tenantId: readString(value, "tenantId"),
    operatorId: readString(value, "operatorId"),
    role: readOperatorRole(value.role),
    disabled: value.disabled === true,
    sessionVersion: readPositiveInteger(value, "sessionVersion"),
  };
}

function readChannelEventReviewStatus(value: unknown): "pending" {
  if (value === "pending") return value;
  throw new ApiError("待接入消息数据格式异常", 502);
}

function readLiteral<T extends string>(
  value: unknown,
  expected: T,
  errorMessage: string,
): T {
  if (value === expected) return expected;
  throw new ApiError(errorMessage, 502);
}

function readString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new ApiError("客服账号数据格式异常", 502);
  }
  return field;
}

function readNullableString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (field === null || field === undefined) return null;
  if (typeof field === "string") return field;
  throw new ApiError("队列状态数据格式异常", 502);
}

function readFiniteNumber(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== "number" || !Number.isFinite(field)) {
    throw new ApiError("队列状态数据格式异常", 502);
  }
  return field;
}

function readNullableFiniteNumber(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (field === null || field === undefined) return null;
  if (typeof field === "number" && Number.isFinite(field)) return field;
  throw new ApiError("队列状态数据格式异常", 502);
}

function readOperatorRole(value: unknown): OperatorProfile["role"] {
  if (value === "admin" || value === "operator" || value === "viewer") {
    return value;
  }
  throw new ApiError("客服账号数据格式异常", 502);
}

function readPositiveInteger(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== "number" || !Number.isInteger(field) || field < 1) {
    throw new ApiError("客服账号数据格式异常", 502);
  }
  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
