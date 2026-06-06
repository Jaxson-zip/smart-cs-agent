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
    `/v2/provider-reads/runs${requestUrl.search}`,
  );
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalidRunsResponse();
  }

  if (!Array.isArray(body)) return invalidRunsResponse();
  try {
    return NextResponse.json(body.map(toProviderReadRun));
  } catch {
    return invalidRunsResponse();
  }
}

function toProviderReadRun(value: unknown) {
  if (!isRecord(value) || !isRecord(value.lookupKeys)) {
    throw new Error("Invalid provider read run");
  }
  return {
    id: readString(value, "id"),
    caseId: readString(value, "caseId"),
    operatorId: readNullableString(value, "operatorId"),
    channel: readString(value, "channel"),
    readCapability: readString(value, "readCapability"),
    status: readString(value, "status"),
    networkExecution: readString(value, "networkExecution"),
    providerDataReturned: false,
    lookupKeys: {
      hasOrderId: value.lookupKeys.hasOrderId === true,
      hasLogisticsId: value.lookupKeys.hasLogisticsId === true,
    },
    lookupFingerprint: readString(value, "lookupFingerprint"),
    requestFingerprint: readString(value, "requestFingerprint"),
    policyReason: readNullableString(value, "policyReason"),
    createdAt: readString(value, "createdAt"),
    updatedAt: readString(value, "updatedAt"),
  };
}

function invalidRunsResponse() {
  return NextResponse.json(
    { error: "Provider read operation response is invalid" },
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
