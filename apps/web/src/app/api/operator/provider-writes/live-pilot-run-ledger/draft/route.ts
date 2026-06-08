import { NextResponse } from "next/server";
import { ProviderWriteLivePilotRunLedgerDraftSchema } from "@smart-cs-agent/shared";
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

  const requestUrl = new URL(request.url);
  const response = await proxyOperatorApi(
    request,
    `/v2/provider-writes/live-pilot-run-ledger/draft${requestUrl.search}`,
  );
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalidResponse();
  }

  try {
    return NextResponse.json(toProviderWriteLivePilotRunLedgerDraft(body));
  } catch {
    return invalidResponse();
  }
}

function toProviderWriteLivePilotRunLedgerDraft(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Invalid provider write live pilot run ledger draft");
  }
  rejectUnsafeProviderWriteLivePilotRunLedgerDraftFields(value);
  return ProviderWriteLivePilotRunLedgerDraftSchema.parse(value);
}

function rejectUnsafeProviderWriteLivePilotRunLedgerDraftFields(
  value: Record<string, unknown>,
) {
  const unsafeFields = new Set([
    "accesstoken",
    "address",
    "apikey",
    "credentialmaterial",
    "credentialref",
    "customermessage",
    "customerphone",
    "evidencehash",
    "hash",
    "idempotencykey",
    "logisticsid",
    "messagebody",
    "operatorapikey",
    "orderid",
    "providerpayload",
    "providerresponse",
    "rawaddress",
    "rawidempotencykey",
    "rawlogisticsid",
    "raworderid",
    "rawpayload",
    "rawprovider",
    "rawtenantid",
    "refreshtoken",
    "secret",
    "tenantid",
    "token",
  ]);
  visitRecord(value, (key) => {
    if (unsafeFields.has(key.toLowerCase())) {
      throw new Error(`Unsafe provider write live pilot run ledger draft field: ${key}`);
    }
  });
}

function visitRecord(
  value: Record<string, unknown>,
  visitor: (key: string) => void,
) {
  for (const [key, item] of Object.entries(value)) {
    visitor(key);
    if (Array.isArray(item)) {
      for (const child of item) {
        if (isRecord(child)) visitRecord(child, visitor);
      }
      continue;
    }
    if (isRecord(item)) visitRecord(item, visitor);
  }
}

function invalidResponse() {
  return NextResponse.json(
    { error: "Provider write live pilot run ledger draft response is invalid" },
    { status: 502 },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
