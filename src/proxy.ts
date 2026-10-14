import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { ROUTES, isProtectedPath } from "@/constants/routes";
import { buildContentSecurityPolicy } from "@/lib/security/csp";
import { refreshSupabaseSession } from "@/lib/supabase/session";

/**
 * Runs before matched requests. It sets a fresh CSP nonce, refreshes the Supabase session, and
 * blocks anonymous access to protected routes. Role checks are not made here: pages and services
 * check roles against the database, so this layer is a convenience, not the access boundary.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = randomBytes(16).toString("base64");
  const csp = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);

  const user = await refreshSupabaseSession(request, response);
  const { pathname, search } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = new URL(ROUTES.login, request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    const redirect = NextResponse.redirect(loginUrl);
    // Session cookies refreshed above must reach the browser on the redirect as well.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    redirect.headers.set("cache-control", "no-store");
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
