import { NextResponse } from "next/server";

const DEFAULT_API_URL = "http://localhost:4100";
const DEFAULT_TENANT_ID = "demo_tenant";
const DEFAULT_OPERATOR_ID = "sandbox_operator";
const REQUEST_TIMEOUT_MS = 2500;

type ProxyOptions = {
  requireOperatorKey?: boolean;
};

export async function proxyOperatorApi(
  path: string,
  options: ProxyOptions = { requireOperatorKey: true },
) {
  const operatorApiKey = process.env.OPERATOR_API_KEY;
  if (options.requireOperatorKey !== false && !operatorApiKey) {
    return NextResponse.json(
      { error: "Operator API key is not configured" },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${apiUrl()}${path}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: buildOperatorHeaders(operatorApiKey),
    });

    const body = await readResponseBody(response);
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Operator API is unavailable" },
      { status: 503 },
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function apiUrl() {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    DEFAULT_API_URL
  ).replace(/\/$/, "");
}

function buildOperatorHeaders(operatorApiKey?: string) {
  return {
    Accept: "application/json",
    "x-tenant-id": process.env.OPERATOR_TENANT_ID ?? DEFAULT_TENANT_ID,
    "x-operator-id": process.env.OPERATOR_ID ?? DEFAULT_OPERATOR_ID,
    ...(operatorApiKey ? { authorization: `Bearer ${operatorApiKey}` } : {}),
  };
}

async function readResponseBody(response: Response) {
  if (response.status === 204) return null;
  return response.text();
}
