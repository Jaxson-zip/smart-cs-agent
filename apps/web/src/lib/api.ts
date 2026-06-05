import type { AfterSalesCase } from "@smart-cs-agent/shared";
import type { ApiAfterSalesCase } from "./cases";

const OPERATOR_BFF_URL = "/api/operator";
const REQUEST_TIMEOUT_MS = 2500;

export type ApiReadiness = {
  status: "ready" | "unavailable";
  checkedAt: string;
};

export async function fetchCases(): Promise<ApiAfterSalesCase[]> {
  const res = await fetchWithTimeout(`${OPERATOR_BFF_URL}/cases`);

  if (!res.ok) {
    throw new Error("售后工单暂时无法同步");
  }

  return res.json();
}

export async function fetchCaseDetails(caseId: string): Promise<AfterSalesCase> {
  const res = await fetchWithTimeout(
    `${OPERATOR_BFF_URL}/cases/${encodeURIComponent(caseId)}`,
  );

  if (!res.ok) {
    throw new Error("售后工单详情暂时无法同步");
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

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
