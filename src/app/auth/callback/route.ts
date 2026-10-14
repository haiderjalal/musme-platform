import { NextResponse, type NextRequest } from "next/server";

import { ROUTES } from "@/constants/routes";
import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/utils/safe-next-path";

/** Exchanges the one-time code from the emailed link for a session cookie. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL(`${ROUTES.login}?error=link`, request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    logEvent("warn", "auth.code_exchange_failed", { code: error.code ?? null });
    return NextResponse.redirect(new URL(`${ROUTES.login}?error=link`, request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
