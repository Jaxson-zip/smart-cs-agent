import { NextResponse } from "next/server";
import {
  ProviderWriteKillSwitchStatusSchema,
  ProviderWriteKillSwitchUpdateRequestSchema,
} from "@smart-cs-agent/shared";
import { readOperatorSession } from "../../../operator-session";
import { proxyOperatorApi } from "../../../operator-proxy";

export async function GET(request: Request) {
  const session = await requireAdminSession(request);
  if (!session.ok) return session.response;

  const response = await proxyOperatorApi(
    request,
    "/v2/provider-writes/kill-switch/status",
  );
  return toSafeStatusResponse(response);
}

export async function POST(request: Request) {
  const session = await requireAdminSession(request);
  if (!session.ok) return session.response;

  const body = await readSafeUpdateBody(request);
  if (!body.ok) return body.response;

  const response = await proxyOperatorApi(
    request,
    "/v2/provider-writes/kill-switch/status",
    {
      method: "POST",
      body: JSON.stringify(body.value),
      contentType: "application/json",
    },
  );
  return toSafeStatusResponse(response);
}

async function requireAdminSession(request: Request) {
  const sessionResult = await readOperatorSession(request);

  if (sessionResult.status === "missing") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Operator session is required" },
        { status: 401 },
      ),
    };
  }

  if (sessionResult.status === "invalid") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: sessionResult.message },
        { status: 401 },
      ),
    };
  }

  if (sessionResult.status === "misconfigured") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: sessionResult.message },
        { status: 503 },
      ),
    };
  }

  if (sessionResult.session.role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Provider write operations require admin permission" },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const };
}

async function readSafeUpdateBody(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return invalidPayload();
  }

  const parsed = ProviderWriteKillSwitchUpdateRequestSchema.safeParse(raw);
  if (!parsed.success) return invalidPayload();
  return { ok: true as const, value: parsed.data };
}

async function toSafeStatusResponse(response: Response) {
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalidResponse();
  }

  try {
    return NextResponse.json(toProviderWriteKillSwitchStatus(body));
  } catch {
    return invalidResponse();
  }
}

function toProviderWriteKillSwitchStatus(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Invalid provider write kill switch status");
  }
  rejectUnsafeProviderWriteKillSwitchStatusFields(value);
  return ProviderWriteKillSwitchStatusSchema.parse(value);
}

function rejectUnsafeProviderWriteKillSwitchStatusFields(
  value: Record<string, unknown>,
) {
  const unsafeFields = new Set([
    "accesstoken",
    "credentialmaterial",
    "credentialref",
    "customermessage",
    "idempotencykey",
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
      throw new Error(`Unsafe provider write kill switch status field: ${key}`);
    }
  }
}

function invalidPayload() {
  return {
    ok: false as const,
    response: NextResponse.json(
      { error: "Provider write kill switch payload is invalid" },
      { status: 400 },
    ),
  };
}

function invalidResponse() {
  return NextResponse.json(
    { error: "Provider write kill switch status response is invalid" },
    { status: 502 },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
