import { NextResponse } from "next/server";
import { ProviderWriteExecutionAttemptListItemSchema } from "@smart-cs-agent/shared";
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
      { error: "Provider write operations require admin permission" },
      { status: 403 },
    );
  }

  const requestUrl = new URL(request.url);
  const response = await proxyOperatorApi(
    request,
    `/v2/provider-writes/execution-attempts${requestUrl.search}`,
  );
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalidResponse();
  }

  if (!Array.isArray(body)) return invalidResponse();
  try {
    return NextResponse.json(
      body.map(toProviderWriteExecutionAttemptListItem),
    );
  } catch {
    return invalidResponse();
  }
}

function toProviderWriteExecutionAttemptListItem(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Invalid provider write execution attempt list item");
  }
  rejectUnsafeProviderWriteExecutionAttemptFields(value);
  return ProviderWriteExecutionAttemptListItemSchema.parse(value);
}

function rejectUnsafeProviderWriteExecutionAttemptFields(
  value: Record<string, unknown>,
) {
  const unsafeFields = new Set([
    "address",
    "apikey",
    "credentialmaterial",
    "credentialref",
    "customermessage",
    "logisticsid",
    "messagebody",
    "operatorapikey",
    "operatorvisibleresult",
    "providerpayload",
    "providerresponse",
    "rawaddress",
    "rawlogisticsid",
    "raworderid",
    "rawpayload",
    "rawprovider",
    "refreshtoken",
    "secret",
    "token",
    "accesstoken",
    "orderid",
  ]);
  for (const key of Object.keys(value)) {
    if (unsafeFields.has(key.toLowerCase())) {
      throw new Error(`Unsafe provider write execution attempt field: ${key}`);
    }
  }
}

function invalidResponse() {
  return NextResponse.json(
    { error: "Provider write execution attempt response is invalid" },
    { status: 502 },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
