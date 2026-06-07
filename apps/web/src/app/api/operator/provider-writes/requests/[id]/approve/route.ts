import { NextResponse } from "next/server";
import {
  ProviderWriteApprovalRequestSchema,
  ProviderWriteResponseSchema,
} from "@smart-cs-agent/shared";
import { readOperatorSession } from "../../../../operator-session";
import { proxyOperatorApi } from "../../../../operator-proxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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

  const body = await readSafeApprovalBody(request);
  if (!body.ok) return body.response;

  const { id } = await context.params;
  const response = await proxyOperatorApi(
    request,
    `/v2/provider-writes/requests/${encodeURIComponent(id)}/approve`,
    {
      method: "POST",
      body: JSON.stringify(body.value),
      contentType: "application/json",
    },
  );
  if (!response.ok) return response;

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    return invalidRequestResponse();
  }

  try {
    return NextResponse.json(
      toProviderWriteResponse(responseBody, ["approved", "blocked", "failed"]),
    );
  } catch {
    return invalidRequestResponse();
  }
}

async function readSafeApprovalBody(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Provider write approval payload is invalid" },
        { status: 400 },
      ),
    };
  }

  const parsed = ProviderWriteApprovalRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Provider write approval payload is invalid" },
        { status: 400 },
      ),
    };
  }

  return { ok: true as const, value: parsed.data };
}

function toProviderWriteResponse(value: unknown, allowedStatuses: string[]) {
  if (!isRecord(value)) throw new Error("Invalid provider write response");
  return ProviderWriteResponseSchema.parse({
    writeRequestId: readString(value, "writeRequestId"),
    status: readProviderWriteStatus(value, allowedStatuses),
    networkExecution: readLiteralString(value, "networkExecution", "not_started"),
    providerMutationExecuted: readLiteralBoolean(
      value,
      "providerMutationExecuted",
      false,
    ),
    customerVisibleMessageSent: readLiteralBoolean(
      value,
      "customerVisibleMessageSent",
      false,
    ),
    operatorVisibleResult: readString(value, "operatorVisibleResult"),
    requiresHuman: readLiteralBoolean(value, "requiresHuman", true),
    retryable: readLiteralBoolean(value, "retryable", false),
  });
}

function invalidRequestResponse() {
  return NextResponse.json(
    { error: "Provider write request response is invalid" },
    { status: 502 },
  );
}

function readProviderWriteStatus(
  value: Record<string, unknown>,
  allowedStatuses: string[],
) {
  const status = readString(value, "status");
  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid provider write status");
  }
  return status;
}

function readString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== "string") {
    throw new Error(`Invalid string field: ${key}`);
  }
  return field;
}

function readLiteralString(
  value: Record<string, unknown>,
  key: string,
  expected: string,
) {
  const field = readString(value, key);
  if (field !== expected) {
    throw new Error(`Invalid literal string field: ${key}`);
  }
  return field;
}

function readLiteralBoolean(
  value: Record<string, unknown>,
  key: string,
  expected: boolean,
) {
  const field = value[key];
  if (field !== expected) {
    throw new Error(`Invalid literal boolean field: ${key}`);
  }
  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
