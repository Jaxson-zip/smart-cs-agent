import { NextResponse } from "next/server";
import {
  ProviderWriteRequestSchema,
  ProviderWriteResponseSchema,
  type ProviderWriteRequest,
} from "@smart-cs-agent/shared";
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
    `/v2/provider-writes/requests${requestUrl.search}`,
  );
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalidRequestsResponse();
  }

  if (!Array.isArray(body)) return invalidRequestsResponse();
  try {
    return NextResponse.json(body.map(toProviderWriteRequest));
  } catch {
    return invalidRequestsResponse();
  }
}

export async function POST(request: Request) {
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

  if (sessionResult.session.role === "viewer") {
    return NextResponse.json(
      { error: "Provider write requests require operator permission" },
      { status: 403 },
    );
  }

  const providerWriteRequest = await readSafeProviderWriteRequest(request);
  if (!providerWriteRequest.ok) return providerWriteRequest.response;

  const response = await proxyOperatorApi(request, "/v2/provider-writes/request", {
    method: "POST",
    body: JSON.stringify(toProviderWriteRequestBody(providerWriteRequest.value)),
    contentType: "application/json",
  });
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalidRequestResponse();
  }

  try {
    return NextResponse.json(
      toProviderWriteResponse(body, ["approval_required", "blocked", "failed"]),
    );
  } catch {
    return invalidRequestResponse();
  }
}

async function readSafeProviderWriteRequest(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Provider write request payload is invalid" },
        { status: 400 },
      ),
    };
  }

  const parsed = ProviderWriteRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Provider write request payload is invalid" },
        { status: 400 },
      ),
    };
  }

  return { ok: true as const, value: parsed.data };
}

function toProviderWriteRequestBody(request: ProviderWriteRequest) {
  return {
    caseId: request.caseId,
    channel: request.channel,
    action: request.action,
    payload: {
      orderId: request.payload.orderId,
      logisticsId: request.payload.logisticsId,
      addressFingerprint: request.payload.addressFingerprint,
      couponAmountCents: request.payload.couponAmountCents,
    },
    idempotencyKey: request.idempotencyKey,
  };
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
    retryable: readBoolean(value, "retryable"),
  });
}

function toProviderWriteRequest(value: unknown) {
  if (!isRecord(value) || !isRecord(value.payloadKeys)) {
    throw new Error("Invalid provider write request");
  }
  return {
    id: readString(value, "id"),
    caseId: readString(value, "caseId"),
    operatorId: readNullableString(value, "operatorId"),
    channel: readString(value, "channel"),
    action: readString(value, "action"),
    status: readProviderWriteStatus(value, [
      "approval_required",
      "approved",
      "rejected",
      "blocked",
      "failed",
    ]),
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
    payloadKeys: {
      hasOrderId: value.payloadKeys.hasOrderId === true,
      hasLogisticsId: value.payloadKeys.hasLogisticsId === true,
      hasAddressFingerprint: value.payloadKeys.hasAddressFingerprint === true,
      hasCouponAmountCents: value.payloadKeys.hasCouponAmountCents === true,
    },
    payloadFingerprint: readString(value, "payloadFingerprint"),
    requestFingerprint: readString(value, "requestFingerprint"),
    reviewerOperatorId: readNullableString(value, "reviewerOperatorId"),
    reviewedAt: readNullableString(value, "reviewedAt"),
    reviewReasonCode: readNullableString(value, "reviewReasonCode"),
    reviewFingerprint: readString(value, "reviewFingerprint"),
    payloadEscrowStatus: readProviderWritePayloadEscrowStatus(value),
    payloadEscrowFingerprint: readString(value, "payloadEscrowFingerprint"),
    policyReason: readNullableString(value, "policyReason"),
    createdAt: readString(value, "createdAt"),
    updatedAt: readString(value, "updatedAt"),
  };
}

function invalidRequestResponse() {
  return NextResponse.json(
    { error: "Provider write request response is invalid" },
    { status: 502 },
  );
}

function invalidRequestsResponse() {
  return NextResponse.json(
    { error: "Provider write operation response is invalid" },
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

function readProviderWritePayloadEscrowStatus(value: Record<string, unknown>) {
  const status = readString(value, "payloadEscrowStatus");
  if (!["not_stored", "sealed_metadata"].includes(status)) {
    throw new Error("Invalid provider write payload escrow status");
  }
  return status;
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
