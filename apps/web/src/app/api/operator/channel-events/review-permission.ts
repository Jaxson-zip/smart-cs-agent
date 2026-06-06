import { NextResponse } from "next/server";
import { readOperatorSession } from "../operator-session";

export async function requireChannelEventReviewAccess(request: Request) {
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
      { error: "Channel event review requires operator permission" },
      { status: 403 },
    );
  }

  return undefined;
}
