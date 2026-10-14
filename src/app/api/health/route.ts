import { NextResponse } from "next/server";

/** Liveness check for uptime monitors. It exposes no configuration and touches no data. */
export function GET(): NextResponse {
  return NextResponse.json(
    { status: "ok", time: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
