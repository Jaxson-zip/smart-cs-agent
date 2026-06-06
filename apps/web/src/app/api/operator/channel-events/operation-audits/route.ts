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
      { error: "Channel event operation audits require admin permission" },
      { status: 403 },
    );
  }

  const response = await proxyOperatorApi(
    request,
    "/v1/channel-events/operation-audits",
  );
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return NextResponse.json(
      { error: "Channel event operation audit response is invalid" },
      { status: 502 },
    );
  }

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: "Channel event operation audit response is invalid" },
      { status: 502 },
    );
  }

  return NextResponse.json(body.map(toOperationAudit));
}

function toOperationAudit(value: unknown) {
  const record = isRecord(value) ? value : {};
  const queueAfter = isRecord(record.queueAfter)
    ? {
        pendingCount: readNumber(record.queueAfter, "pendingCount"),
        staleProcessingCount: readNumber(record.queueAfter, "staleProcessingCount"),
      }
    : null;

  return {
    id: readString(record, "id"),
    type:
      record.type === "stale_processing_recovered"
        ? record.type
        : "stale_processing_recovered",
    operatorId: readString(record, "operatorId"),
    recoveredCount: readNumber(record, "recoveredCount"),
    recoveredBefore: readString(record, "recoveredBefore"),
    queueHealthyAfter: record.queueHealthyAfter === true,
    queueAfter,
    createdAt: readString(record, "createdAt"),
  };
}

function readString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function readNumber(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
