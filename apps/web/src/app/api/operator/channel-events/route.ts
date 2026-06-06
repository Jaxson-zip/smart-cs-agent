import { NextResponse } from "next/server";
import { proxyOperatorApi } from "../operator-proxy";

export async function GET(request: Request) {
  const response = await proxyOperatorApi(request, "/v1/channel-events");
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return NextResponse.json(
      { error: "Channel event response is invalid" },
      { status: 502 },
    );
  }

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: "Channel event response is invalid" },
      { status: 502 },
    );
  }

  return NextResponse.json(body.map(toPublicChannelEvent));
}

function toPublicChannelEvent(value: unknown) {
  if (!isRecord(value)) return {};

  return {
    id: readString(value, "id"),
    channel: readString(value, "channel"),
    senderName: readString(value, "senderName"),
    text: readString(value, "text"),
    receivedAt: readString(value, "receivedAt"),
    createdAt: readString(value, "createdAt"),
    reviewStatus: readString(value, "reviewStatus"),
  };
}

function readString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
