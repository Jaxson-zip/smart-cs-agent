import { NextResponse } from "next/server";
import {
  OperatorAccountConflictError,
  createOperatorPasswordHash,
  operatorAdminStore,
  requireOperatorAdminSession,
  toPublicOperatorAccountRecord,
  type OperatorRole,
} from "../operator-admin";

export async function GET(request: Request) {
  const auth = await requireOperatorAdminSession(request);
  if (auth.status === "response") return auth.response;

  try {
    const operators = await operatorAdminStore().listByTenant(
      auth.session.tenantId,
    );

    return NextResponse.json({
      operators: operators.map(toPublicOperatorAccountRecord),
    });
  } catch {
    return NextResponse.json(
      { error: "Operator account store is unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireOperatorAdminSession(request);
  if (auth.status === "response") return auth.response;

  const payloadResult = await readCreateOperatorPayload(request);
  if (!payloadResult.ok) {
    return NextResponse.json({ error: payloadResult.error }, { status: 400 });
  }

  const store = operatorAdminStore();
  try {
    const operator = await store.create({
      username: payloadResult.payload.username,
      tenantId: auth.session.tenantId,
      operatorId: payloadResult.payload.operatorId,
      role: payloadResult.payload.role,
      passwordHash: createOperatorPasswordHash(payloadResult.payload.password),
      apiKey: auth.session.apiKey,
    });

    await store.audit("operator_account.created", {
      actorOperatorId: auth.session.operatorId,
      targetOperatorId: operator.operatorId,
      tenantId: auth.session.tenantId,
      role: operator.role,
    });

    return NextResponse.json(
      { operator: toPublicOperatorAccountRecord(operator) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OperatorAccountConflictError) {
      return NextResponse.json(
        { error: "Operator account already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Operator account store is unavailable" },
      { status: 503 },
    );
  }
}

type CreateOperatorPayload = {
  username: string;
  password: string;
  operatorId: string;
  role: OperatorRole;
};

async function readCreateOperatorPayload(
  request: Request,
): Promise<
  | { ok: true; payload: CreateOperatorPayload }
  | { ok: false; error: string }
> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { ok: false, error: "Operator payload must be valid JSON" };
  }

  if (!isRecord(payload)) {
    return { ok: false, error: "Operator payload must be an object" };
  }

  const username = readNonEmptyString(payload.username);
  const password = readNonEmptyString(payload.password);
  const operatorId = readNonEmptyString(payload.operatorId);
  const role = readRole(payload.role);

  if (!username || !password || !operatorId || !role) {
    return {
      ok: false,
      error: "Username, password, operatorId, and role are required",
    };
  }

  if (password.length < 8) {
    return { ok: false, error: "Operator password must be at least 8 characters" };
  }

  return { ok: true, payload: { username, password, operatorId, role } };
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readRole(value: unknown): OperatorRole | undefined {
  if (value === "admin" || value === "operator" || value === "viewer") {
    return value;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
