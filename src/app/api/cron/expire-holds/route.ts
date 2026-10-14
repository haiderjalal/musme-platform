import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { logEvent } from "@/lib/logger";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Releases holds whose payment window has passed. Scheduled by Vercel Cron (see vercel.json).
 * It is safe to run repeatedly: an expired row is only updated once, and the status filter
 * makes the update idempotent.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
  }

  const { data, error } = await getSupabaseAdminClient()
    .from("bookings")
    .update({ status: "expired" })
    .eq("status", "pending_payment")
    .lt("hold_expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    logEvent("error", "cron.expire_holds_failed", { code: error.code ?? null });
    return NextResponse.json(
      { success: false, message: "Could not release holds." },
      { status: 500 },
    );
  }

  const released = data?.length ?? 0;
  logEvent("info", "cron.expire_holds_done", { released });
  return NextResponse.json({ success: true, message: "Holds released.", data: { released } });
}

/** Constant-time comparison of the bearer secret. Missing configuration always fails closed. */
function isAuthorizedCron(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
