import { NextResponse } from "next/server";
import { clearOperatorSessionCookie } from "../operator-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearOperatorSessionCookie(response);
  return response;
}
