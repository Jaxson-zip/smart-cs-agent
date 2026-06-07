import { NextResponse } from "next/server";
import { ProviderWriteLiveExecutorStatusSchema } from "@smart-cs-agent/shared";
import { readOperatorSession } from "../../../operator-session";
import { proxyOperatorApi } from "../../../operator-proxy";

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

  const response = await proxyOperatorApi(
    request,
    "/v2/provider-writes/live-executor/status",
  );
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalidResponse();
  }

  try {
    return NextResponse.json(toProviderWriteLiveExecutorStatus(body));
  } catch {
    return invalidResponse();
  }
}

function toProviderWriteLiveExecutorStatus(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Invalid provider write live executor status");
  }
  rejectUnsafeProviderWriteLiveExecutorStatusFields(value);
  return ProviderWriteLiveExecutorStatusSchema.parse(value);
}

function rejectUnsafeProviderWriteLiveExecutorStatusFields(
  value: Record<string, unknown>,
) {
  const unsafeFields = new Set([
    "accesstoken",
    "credentialmaterial",
    "credentialref",
    "customermessage",
    "evidencehash",
    "hash",
    "operatorapikey",
    "providerpayload",
    "providerresponse",
    "rawpayload",
    "refreshtoken",
    "secret",
    "token",
  ]);
  for (const key of Object.keys(value)) {
    if (unsafeFields.has(key.toLowerCase())) {
      throw new Error(`Unsafe provider write live executor status field: ${key}`);
    }
  }
}

function invalidResponse() {
  return NextResponse.json(
    { error: "Provider write live executor status response is invalid" },
    { status: 502 },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
