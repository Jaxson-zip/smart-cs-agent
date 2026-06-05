import { NextResponse } from "next/server";
import { readOperatorSession, type OperatorSession } from "./operator-session";

const DEFAULT_API_URL = "http://localhost:4100";
const REQUEST_TIMEOUT_MS = 2500;

type ProxyOptions = {
  requireSession?: boolean;
};

export async function proxyOperatorApi(
  request: Request,
  path: string,
  options: ProxyOptions = { requireSession: true },
) {
  let session: OperatorSession | undefined;

  if (options.requireSession !== false) {
    const sessionResult = await readOperatorSession(request);
    if (sessionResult.status === "missing") {
      return NextResponse.json(
        { error: "Operator session is required" },
        { status: 401 },
      );
    }

    if (sessionResult.status === "invalid") {
      return NextResponse.json(
        { error: sessionResult.message },
        { status: 401 },
      );
    }

    if (sessionResult.status === "misconfigured") {
      return NextResponse.json(
        { error: sessionResult.message },
        { status: 503 },
      );
    }

    session = sessionResult.session;
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
      headers: buildOperatorHeaders(session),
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
  if (process.env.NODE_ENV === "production" && !process.env.API_URL) {
    throw new Error("API_URL is required in production");
  }

  return (
    process.env.API_URL ??
    DEFAULT_API_URL
  ).replace(/\/$/, "");
}

function buildOperatorHeaders(session?: OperatorSession) {
  return {
    Accept: "application/json",
    ...(session
      ? {
          authorization: `Bearer ${session.apiKey}`,
          "x-tenant-id": session.tenantId,
          "x-operator-id": session.operatorId,
        }
      : {}),
  };
}

async function readResponseBody(response: Response) {
  if (response.status === 204) return null;
  return response.text();
}
