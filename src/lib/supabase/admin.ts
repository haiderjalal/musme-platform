import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ConfigError } from "@/lib/errors";

import { getSupabaseConfig } from "./config";

let cachedAdminClient: SupabaseClient | undefined;

/**
 * Service role client. It bypasses row level security, so only use it after the caller's
 * identity and permissions have been checked in the service layer. Never import it into
 * client code (the server-only import above enforces that at build time).
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (cachedAdminClient) return cachedAdminClient;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new ConfigError("SUPABASE_SERVICE_ROLE_KEY is not set.");
  }

  const config = getSupabaseConfig();
  cachedAdminClient = createClient(config.url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cachedAdminClient;
}
