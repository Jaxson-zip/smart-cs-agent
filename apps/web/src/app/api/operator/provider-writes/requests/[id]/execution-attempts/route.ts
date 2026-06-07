import { NextResponse } from "next/server";
import {
  ProviderWriteExecutionAttemptRequestSchema,
  ProviderWriteExecutionAttemptResponseSchema,
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

  const body = await readSafeExecutionAttemptBody(request);
  if (!body.ok) return body.response;

  const { id } = await context.params;
  const response = await proxyOperatorApi(
    request,
    `/v2/provider-writes/requests/${encodeURIComponent(id)}/execution-attempts`,
    {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: body.value.idempotencyKey }),
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
    return NextResponse.json(toProviderWriteExecutionAttemptResponse(responseBody));
  } catch {
    return invalidRequestResponse();
  }
}

async function readSafeExecutionAttemptBody(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Provider write execution attempt payload is invalid" },
        { status: 400 },
      ),
    };
  }

  const parsed = ProviderWriteExecutionAttemptRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Provider write execution attempt payload is invalid" },
        { status: 400 },
      ),
    };
  }

  return { ok: true as const, value: parsed.data };
}

function toProviderWriteExecutionAttemptResponse(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Invalid provider write execution attempt response");
  }
  rejectUnsafeProviderWriteExecutionAttemptFields(value);
  return ProviderWriteExecutionAttemptResponseSchema.parse({
    attemptId: readString(value, "attemptId"),
    writeRequestId: readString(value, "writeRequestId"),
    status: readProviderWriteExecutionAttemptStatus(value),
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
    payloadEscrowOpened: readLiteralBoolean(
      value,
      "payloadEscrowOpened",
      false,
    ),
    operatorVisibleResult: readString(value, "operatorVisibleResult"),
    requiresHuman: readLiteralBoolean(value, "requiresHuman", true),
    retryable: readBoolean(value, "retryable"),
  });
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

function invalidRequestResponse() {
  return NextResponse.json(
    { error: "Provider write execution attempt response is invalid" },
    { status: 502 },
  );
}

function readProviderWriteExecutionAttemptStatus(
  value: Record<string, unknown>,
) {
  const status = readString(value, "status");
  if (
    status !== "dry_run_recorded" &&
    status !== "blocked" &&
    status !== "failed"
  ) {
    throw new Error("Invalid provider write execution attempt status");
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

function readBoolean(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== "boolean") {
    throw new Error(`Invalid boolean field: ${key}`);
  }
  return field;
}

function readLiteralBoolean(
  value: Record<string, unknown>,
  key: string,
  expected: boolean,
) {
  const field = readBoolean(value, key);
  if (field !== expected) {
    throw new Error(`Invalid literal boolean field: ${key}`);
  }
  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
