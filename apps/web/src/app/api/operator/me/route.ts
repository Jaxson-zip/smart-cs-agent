import { NextResponse } from "next/server";
import {
  readOperatorSession,
  toPublicOperatorSession,
} from "../operator-session";

export async function GET(request: Request) {
  const sessionResult = readOperatorSession(request);

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

  return NextResponse.json({
    operator: toPublicOperatorSession(sessionResult.session),
  });
}
