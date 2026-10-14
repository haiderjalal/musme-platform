import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

import { logEvent } from "@/lib/logger";

import { getSupabaseConfig } from "./config";

/**
 * Refreshes the Supabase session cookies for a proxied request and returns the verified user.
 * getUser() contacts Supabase to verify the token. Do not trust getSession() for access checks.
 */
export async function refreshSupabaseSession(
  request: NextRequest,
  response: NextResponse,
): Promise<User | null> {
  const config = getSupabaseConfig();
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    logEvent("warn", "auth.session_refresh_failed", { code: error.code ?? null });
  }
  return data.user ?? null;
}
