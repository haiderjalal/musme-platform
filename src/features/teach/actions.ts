"use server";

import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { requireUser } from "@/features/auth/session";
import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/result";

import { teacherApplicationSchema, type TeacherApplicationInput } from "./schemas";

/**
 * Saves a teacher application through the signed-in user's own client, so row level security
 * decides what they may change. Verification status is never set here: it stays 'submitted' or
 * whatever an admin decided. A rejected applicant resubmits through submitTeacherForReviewAction.
 */
export async function saveTeacherApplicationAction(
  input: TeacherApplicationInput,
): Promise<ActionResult<{ slug: string }>> {
  const user = await requireUser(ROUTES.teachApply);
  const parsed = teacherApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", fieldErrorsFrom(parsed.error.issues));
  }
  const value = parsed.data;
  const supabase = await createSupabaseServerClient();

  const profileUpdate = await supabase
    .from("profiles")
    .update({ display_name: value.displayName, timezone: value.timezone })
    .eq("id", user.id);
  if (profileUpdate.error) {
    logEvent("error", "teach.profile_update_failed", { code: profileUpdate.error.code ?? null });
    return fail("We could not save your profile. Try again.");
  }

  const existing = await supabase
    .from("teacher_profiles")
    .select("profile_id, slug")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (existing.error) {
    logEvent("error", "teach.application_load_failed", { code: existing.error.code ?? null });
    return fail("We could not save your application. Try again.");
  }

  // The web address is fixed once it exists, so links to the profile never break.
  const slug = existing.data?.slug ?? value.slug;
  const writeProfile = existing.data
    ? await supabase
        .from("teacher_profiles")
        .update({ headline: value.headline, bio: value.bio, languages: value.languages })
        .eq("profile_id", user.id)
    : await supabase.from("teacher_profiles").insert({
        profile_id: user.id,
        slug,
        headline: value.headline,
        bio: value.bio,
        languages: value.languages,
      });

  if (writeProfile.error) {
    if (writeProfile.error.code === "23505") {
      return fail("That web address is already taken.", {
        slug: "Choose a different web address.",
      });
    }
    logEvent("error", "teach.application_write_failed", { code: writeProfile.error.code ?? null });
    return fail("We could not save your application. Try again.");
  }

  const instrumentsReplaced = await replaceInstruments(user.id, value.instrumentIds);
  if (!instrumentsReplaced) {
    return fail("We could not save your instruments. Try again.");
  }

  return ok({ slug }, "Application saved.");
}

/**
 * Sends a rejected or draft application back for review. The database enforces which states may
 * move to 'submitted'. Used as a form action, so it redirects with a notice instead of returning data.
 */
export async function submitTeacherForReviewAction(): Promise<void> {
  await requireUser(ROUTES.teach);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_teacher_application");
  if (error) {
    logEvent("warn", "teach.submit_for_review_failed", { code: error.code ?? null });
    redirect(`${ROUTES.teach}?notice=review-failed`);
  }
  redirect(`${ROUTES.teach}?notice=sent`);
}

async function replaceInstruments(teacherId: string, instrumentIds: string[]): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const removed = await supabase.from("teacher_instruments").delete().eq("teacher_id", teacherId);
  if (removed.error) {
    logEvent("error", "teach.instruments_delete_failed", { code: removed.error.code ?? null });
    return false;
  }
  const added = await supabase
    .from("teacher_instruments")
    .insert(
      instrumentIds.map((instrumentId) => ({ teacher_id: teacherId, instrument_id: instrumentId })),
    );
  if (added.error) {
    logEvent("error", "teach.instruments_insert_failed", { code: added.error.code ?? null });
    return false;
  }
  return true;
}

function fieldErrorsFrom(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}
