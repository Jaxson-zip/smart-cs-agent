import { NextResponse } from "next/server";

type LegacyDemoApiEnv = Record<string, string | undefined>;

export function legacyDemoApiEnabled(
  env: LegacyDemoApiEnv = process.env as LegacyDemoApiEnv,
) {
  return env.ENABLE_LEGACY_WEB_DEMO_API === "true";
}

export function disabledLegacyDemoApiResponse() {
  return NextResponse.json(
    { error: "Legacy demo API is disabled" },
    { status: 404 },
  );
}
