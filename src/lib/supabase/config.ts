import { z } from "zod";

import { ConfigError } from "@/lib/errors";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const supabaseConfigSchema = z.object({
  url: z.url(),
  anonKey: z.string().min(1),
});

/**
 * Reads the public Supabase settings. The NEXT_PUBLIC_ references must stay literal
 * so Next.js can inline them into the browser bundle.
 */
export function getSupabaseConfig(): SupabaseConfig {
  const parsed = supabaseConfigSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new ConfigError("Supabase public settings are missing or invalid. Check .env.local.");
  }
  return parsed.data;
}
