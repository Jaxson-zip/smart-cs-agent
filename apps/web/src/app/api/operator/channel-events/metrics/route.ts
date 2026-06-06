import { NextResponse } from "next/server";
import { proxyOperatorApi } from "../../operator-proxy";

export async function GET(request: Request) {
  const response = await proxyOperatorApi(request, "/v1/channel-events/metrics");
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return NextResponse.json(
      { error: "Channel event metrics response is invalid" },
      { status: 502 },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "Channel event metrics response is invalid" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    pendingCount: readNumber(body, "pendingCount"),
    processingCount: readNumber(body, "processingCount"),
    staleProcessingCount: readNumber(body, "staleProcessingCount"),
    replayedCount: readNumber(body, "replayedCount"),
    ignoredCount: readNumber(body, "ignoredCount"),
    oldestPendingReceivedAt: readNullableString(body, "oldestPendingReceivedAt"),
    oldestPendingAgeSeconds: readNullableNumber(body, "oldestPendingAgeSeconds"),
    staleAfterMinutes: readNumber(body, "staleAfterMinutes"),
    measuredAt: readString(body, "measuredAt"),
  });
}

function readNumber(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : 0;
}

function readNullableNumber(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function readString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function readNullableString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" ? field : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
