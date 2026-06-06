import { NextResponse } from "next/server";
import { readOperatorSession } from "../../operator-session";
import { proxyOperatorApi } from "../../operator-proxy";

export async function GET(request: Request) {
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

  if (sessionResult.session.role !== "admin") {
    return NextResponse.json(
      { error: "Channel event audit summary requires admin permission" },
      { status: 403 },
    );
  }

  const requestUrl = new URL(request.url);
  const response = await proxyOperatorApi(
    request,
    `/v1/channel-events/audit-summary${requestUrl.search}`,
  );
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalidSummaryResponse();
  }

  if (!isRecord(body) || !isRecord(body.window) || !isRecord(body.totals)) {
    return invalidSummaryResponse();
  }

  try {
    return NextResponse.json({
      measuredAt: readString(body, "measuredAt"),
      window: {
        from: readString(body.window, "from"),
        to: readString(body.window, "to"),
      },
      totals: {
        replayedCount: readNumber(body.totals, "replayedCount"),
        ignoredCount: readNumber(body.totals, "ignoredCount"),
        recoveryRunCount: readNumber(body.totals, "recoveryRunCount"),
        recoveredEventCount: readNumber(body.totals, "recoveredEventCount"),
      },
      byOperator: Array.isArray(body.byOperator)
        ? body.byOperator.map(toOperatorSummary)
        : [],
    });
  } catch {
    return invalidSummaryResponse();
  }
}

function toOperatorSummary(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Invalid operator audit summary");
  }

  return {
    operatorId: readString(value, "operatorId"),
    replayedCount: readNumber(value, "replayedCount"),
    ignoredCount: readNumber(value, "ignoredCount"),
    recoveryRunCount: readNumber(value, "recoveryRunCount"),
    recoveredEventCount: readNumber(value, "recoveredEventCount"),
    lastActivityAt: readNullableString(value, "lastActivityAt"),
  };
}

function invalidSummaryResponse() {
  return NextResponse.json(
    { error: "Channel event audit summary response is invalid" },
    { status: 502 },
  );
}

function readString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== "string") {
    throw new Error(`Invalid string field: ${key}`);
  }
  return field;
}

function readNullableString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (field === null || field === undefined) return null;
  if (typeof field !== "string") {
    throw new Error(`Invalid nullable string field: ${key}`);
  }
  return typeof field === "string" ? field : null;
}

function readNumber(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== "number" || !Number.isFinite(field)) {
    throw new Error(`Invalid number field: ${key}`);
  }
  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
