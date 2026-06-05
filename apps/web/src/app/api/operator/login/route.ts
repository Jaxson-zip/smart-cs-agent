import { NextResponse } from "next/server";
import {
  authenticateOperator,
  setOperatorSessionCookie,
  type LoginCredentials,
} from "../operator-session";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Login payload must be valid JSON" },
      { status: 400 },
    );
  }

  if (!isLoginCredentials(payload)) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 },
    );
  }

  let account;
  try {
    account = authenticateOperator(payload);
  } catch {
    return NextResponse.json(
      { error: "Operator session accounts are not configured" },
      { status: 503 },
    );
  }

  if (!account) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 },
    );
  }

  const response = NextResponse.json({
    operator: {
      username: account.username,
      tenantId: account.tenantId,
      operatorId: account.operatorId,
      role: account.role,
    },
  });

  try {
    setOperatorSessionCookie(response, account);
  } catch {
    return NextResponse.json(
      { error: "Operator session secret is not configured" },
      { status: 503 },
    );
  }

  return response;
}

function isLoginCredentials(value: unknown): value is LoginCredentials {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).username === "string" &&
    typeof (value as Record<string, unknown>).password === "string" &&
    (value as Record<string, unknown>).username !== "" &&
    (value as Record<string, unknown>).password !== ""
  );
}
