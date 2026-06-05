import type { AfterSalesCase } from "@smart-cs-agent/shared";
import type { ApiAfterSalesCase } from "./cases";

const OPERATOR_BFF_URL = "/api/operator";
const REQUEST_TIMEOUT_MS = 2500;

export type ApiReadiness = {
  status: "ready" | "unavailable";
  checkedAt: string;
};

export type OperatorLoginResult = {
  operator: {
    username: string;
    tenantId: string;
    operatorId: string;
    role: "admin" | "operator" | "viewer";
  };
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
