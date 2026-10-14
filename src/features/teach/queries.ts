import "server-only";

import { z } from "zod";

import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface OwnTeacherStatus {
  status: "submitted" | "approved" | "rejected" | "suspended";
  slug: string;
  headline: string;
  rejectionReason: string | null;
}

export interface OwnApplicationForm {
  slug: string;
  headline: string;
  bio: string;
  languages: string[];
  instrumentIds: string[];
}

const statusRow = z.object({
  slug: z.string(),
  headline: z.string(),
  verification_status: z.enum(["submitted", "approved", "rejected", "suspended"]),
  rejection_reason: z.string().nullable(),
});

const formRow = z.object({
  slug: z.string(),
  headline: z.string(),
  bio: z.string(),
  languages: z.array(z.string()),
  teacher_instruments: z.array(z.object({ instrument_id: z.uuid() })),
});

/** The signed-in user's own application status, or null. Row level security returns only their row. */
export async function getOwnTeacherStatus(userId: string): Promise<OwnTeacherStatus | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("slug, headline, verification_status, rejection_reason")
    .eq("profile_id", userId)
    .maybeSingle();

  if (error) {
    logEvent("error", "teach.status_failed", { code: error.code ?? null });
    throw new Error("Could not load your application.");
  }
  if (!data) return null;
  const row = statusRow.parse(data);
  return {
    status: row.verification_status,
    slug: row.slug,
    headline: row.headline,
    rejectionReason: row.rejection_reason,
  };
}

/** The fields the application form needs to pre-fill when a teacher edits their application. */
export async function getOwnApplicationForm(userId: string): Promise<OwnApplicationForm | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("slug, headline, bio, languages, teacher_instruments(instrument_id)")
    .eq("profile_id", userId)
    .maybeSingle();

  if (error) {
    logEvent("error", "teach.form_load_failed", { code: error.code ?? null });
    throw new Error("Could not load your application.");
  }
  if (!data) return null;
  const row = formRow.parse(data);
  return {
    slug: row.slug,
    headline: row.headline,
    bio: row.bio,
    languages: row.languages,
    instrumentIds: row.teacher_instruments.map((link) => link.instrument_id),
  };
}
