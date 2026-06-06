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
      { error: "Provider read operations require admin permission" },
      { status: 403 },
    );
  }

  const requestUrl = new URL(request.url);
  const response = await proxyOperatorApi(
    request,
    `/v2/provider-reads/summary${requestUrl.search}`,
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
        totalCount: readNumber(body.totals, "totalCount"),
        policyAcceptedCount: readNumber(body.totals, "policyAcceptedCount"),
        blockedCount: readNumber(body.totals, "blockedCount"),
        failedCount: readNumber(body.totals, "failedCount"),
      },
      byChannel: readSummaryBuckets(body.byChannel),
      byCapability: readSummaryBuckets(body.byCapability),
      latestCreatedAt: readNullableString(body, "latestCreatedAt"),
    });
  } catch {
    return invalidSummaryResponse();
  }
}

function readSummaryBuckets(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Invalid provider read summary bucket");
    }
    return {
      key: readString(item, "key"),
      count: readNumber(item, "count"),
    };
  });
}

function invalidSummaryResponse() {
  return NextResponse.json(
    { error: "Provider read operation summary response is invalid" },
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
  return field;
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
