"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "./config";

/** Browser client for Realtime subscriptions. Data reads and writes stay on the server. */
export function createSupabaseBrowserClient(): SupabaseClient {
  const config = getSupabaseConfig();
  return createBrowserClient(config.url, config.anonKey);
}
