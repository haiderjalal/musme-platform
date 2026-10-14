import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabaseConfig } from "./config";

/**
 * Server client that acts as the signed-in user. Row level security applies to every query.
 * Use this for reads and for writes the user is allowed to make directly.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const config = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. The proxy refreshes the session on the
          // next request, so this is an expected no-op rather than a failure.
        }
      },
    },
  });
}
