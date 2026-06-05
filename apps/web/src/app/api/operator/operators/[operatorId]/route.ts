import { NextResponse } from "next/server";
import {
  operatorAdminStore,
  requireOperatorAdminSession,
  toPublicOperatorAccountRecord,
  type OperatorRole,
} from "../../operator-admin";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ operatorId: string }> },
) {
  const auth = await requireOperatorAdminSession(request);
  if (auth.status === "response") return auth.response;

  const { operatorId } = await context.params;
  const payloadResult = await readUpdateOperatorPayload(request);
  if (!payloadResult.ok) {
    return NextResponse.json({ error: payloadResult.error }, { status: 400 });
  }

  const store = operatorAdminStore();
  try {
    const operator = await store.updateByTenantOperatorId(
      auth.session.tenantId,
      operatorId,
      {
        role: payloadResult.payload.role,
        disabled: payloadResult.payload.disabled,
        incrementSessionVersion: payloadResult.payload.revokeSessions,
      },
    );

    if (!operator) {
      return NextResponse.json(
        { error: "Operator account was not found" },
        { status: 404 },
      );
    }

    await store.audit("operator_account.updated", {
      actorOperatorId: auth.session.operatorId,
      targetOperatorId: operator.operatorId,
      tenantId: auth.session.tenantId,
      ...(payloadResult.payload.role
        ? { role: payloadResult.payload.role }
        : {}),
      ...(typeof payloadResult.payload.disabled === "boolean"
        ? { disabled: payloadResult.payload.disabled }
        : {}),
      ...(payloadResult.payload.revokeSessions
        ? { revokedSessions: true }
        : {}),
    });

    return NextResponse.json({
      operator: toPublicOperatorAccountRecord(operator),
    });
  } catch {
    return NextResponse.json(
      { error: "Operator account store is unavailable" },
      { status: 503 },
    );
  }
}

type UpdateOperatorPayload = {
  role?: OperatorRole;
  disabled?: boolean;
  revokeSessions?: boolean;
};

async function readUpdateOperatorPayload(
  request: Request,
): Promise<
  | { ok: true; payload: UpdateOperatorPayload }
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

  const role = readRole(payload.role);
  const hasRole = payload.role !== undefined;
  if (hasRole && !role) {
    return { ok: false, error: "Operator role must be admin, operator, or viewer" };
  }

  const hasDisabled = payload.disabled !== undefined;
  if (hasDisabled && typeof payload.disabled !== "boolean") {
    return { ok: false, error: "Operator disabled must be a boolean" };
  }

  const hasRevoke = payload.revokeSessions !== undefined;
  if (hasRevoke && typeof payload.revokeSessions !== "boolean") {
    return { ok: false, error: "Operator revokeSessions must be a boolean" };
  }

  if (!hasRole && !hasDisabled && !hasRevoke) {
    return { ok: false, error: "At least one operator update is required" };
  }

  return {
    ok: true,
    payload: {
      ...(role ? { role } : {}),
      ...(hasDisabled ? { disabled: payload.disabled as boolean } : {}),
      ...(hasRevoke ? { revokeSessions: payload.revokeSessions as boolean } : {}),
    },
  };
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
