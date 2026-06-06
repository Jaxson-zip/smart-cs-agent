import type { AfterSalesCase } from "@smart-cs-agent/shared";
import type { ApiAfterSalesCase } from "./cases";

const OPERATOR_BFF_URL = "/api/operator";
const REQUEST_TIMEOUT_MS = 2500;

export type ApiReadiness = {
  status: "ready" | "unavailable";
  checkedAt: string;
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

    return {
      status: res.ok ? "ready" : "unavailable",
      checkedAt,
    };
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

function readString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new ApiError("客服账号数据格式异常", 502);
  }
  return field;
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
