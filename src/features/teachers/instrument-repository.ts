import "server-only";

import { z } from "zod";

import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { InstrumentRef } from "./types";

const instrumentRow = z.object({ id: z.uuid(), slug: z.string(), name: z.string() });

/** Instrument catalogue for the listing filter. Public reference data. */
export async function listInstruments(): Promise<InstrumentRef[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("instruments")
    .select("id, slug, name")
    .order("name", { ascending: true });

  if (error) {
    logEvent("error", "teachers.instruments_failed", { code: error.code ?? null });
    throw new Error("Could not load instruments.");
  }
  return z.array(instrumentRow).parse(data ?? []);
}
