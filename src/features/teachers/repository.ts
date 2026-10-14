import "server-only";

import { z } from "zod";

import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { TeacherDetail, TeacherFilters, TeacherSummary } from "./types";

const LISTING_LIMIT = 60;

const instrumentLinkRow = z.object({
  instruments: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }),
});

const offeringRow = z.object({
  id: z.uuid(),
  title: z.string(),
  duration_minutes: z.number().int(),
  price_minor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  is_trial: z.boolean(),
  is_active: z.boolean(),
});

const teacherRow = z.object({
  profile_id: z.uuid(),
  slug: z.string(),
  headline: z.string(),
  bio: z.string(),
  languages: z.array(z.string()),
  profiles: z.object({ display_name: z.string().nullable(), timezone: z.string() }),
  teacher_instruments: z.array(instrumentLinkRow),
  lesson_offerings: z.array(offeringRow),
});

type TeacherRow = z.infer<typeof teacherRow>;

// Columns are named explicitly. SELECT * would send fields the page never renders.
const TEACHER_SELECT = `
  profile_id,
  slug,
  headline,
  bio,
  languages,
  profiles(display_name, timezone),
  teacher_instruments(instruments(id, slug, name)),
  lesson_offerings(id, title, duration_minutes, price_minor, currency, is_trial, is_active)
`;

/** Approved teachers for the public listing. Row level security also limits this to approved rows. */
export async function listApprovedTeachers(filters: TeacherFilters): Promise<TeacherSummary[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("teacher_profiles")
    .select(TEACHER_SELECT)
    .eq("verification_status", "approved")
    .order("created_at", { ascending: true })
    .limit(LISTING_LIMIT);

  if (filters.instrument) {
    const profileIds = await teacherIdsForInstrument(filters.instrument);
    if (profileIds.length === 0) return [];
    query = query.in("profile_id", profileIds);
  }
  if (filters.query) {
    query = query.ilike("headline", `%${filters.query}%`);
  }

  const { data, error } = await query;
  if (error) {
    logEvent("error", "teachers.list_failed", { code: error.code ?? null });
    throw new Error("Could not load teachers.");
  }
  return z
    .array(teacherRow)
    .parse(data ?? [])
    .map(toSummary);
}

/** A single approved teacher by public slug, or null when no approved teacher matches. */
export async function getApprovedTeacherBySlug(slug: string): Promise<TeacherDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teacher_profiles")
    .select(TEACHER_SELECT)
    .eq("slug", slug)
    .eq("verification_status", "approved")
    .maybeSingle();

  if (error) {
    logEvent("error", "teachers.detail_failed", { code: error.code ?? null });
    throw new Error("Could not load this teacher.");
  }
  if (!data) return null;

  const row = teacherRow.parse(data);
  return { ...toSummary(row), bio: row.bio, timezone: row.profiles.timezone };
}

async function teacherIdsForInstrument(instrumentSlug: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teacher_instruments")
    .select("teacher_id, instruments!inner(slug)")
    .eq("instruments.slug", instrumentSlug);

  if (error) {
    logEvent("error", "teachers.instrument_filter_failed", { code: error.code ?? null });
    throw new Error("Could not filter teachers.");
  }
  const rows = z.array(z.object({ teacher_id: z.uuid() })).parse(data ?? []);
  return [...new Set(rows.map((row) => row.teacher_id))];
}

function toSummary(row: TeacherRow): TeacherSummary {
  return {
    profileId: row.profile_id,
    slug: row.slug,
    displayName: row.profiles.display_name ?? "MUSME teacher",
    headline: row.headline,
    languages: row.languages,
    instruments: row.teacher_instruments.map((link) => ({
      id: link.instruments.id,
      slug: link.instruments.slug,
      name: link.instruments.name,
    })),
    offerings: row.lesson_offerings
      .filter((offering) => offering.is_active)
      .map((offering) => ({
        id: offering.id,
        title: offering.title,
        durationMinutes: offering.duration_minutes,
        priceMinor: offering.price_minor,
        currency: offering.currency,
        isTrial: offering.is_trial,
      })),
  };
}
