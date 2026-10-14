import "server-only";

import { HOLD_MINUTES } from "@/constants/booking";
import { fail, ok, type ActionResult } from "@/lib/result";
import { logEvent } from "@/lib/logger";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

import { calculatePlatformFee } from "./domain/fees";
import { getOpenSlots } from "./availability";

const MINUTE_MS = 60_000;

export interface TrialHoldInput {
  learnerId: string;
  offeringId: string;
  startsAt: Date;
  idempotencyKey: string;
  now: Date;
}

export interface TrialHold {
  bookingId: string;
  holdExpiresAt: string;
}

/** Stable codes so the page can explain a failure without exposing internal detail. */
export type HoldNotice = "slot-unavailable" | "lesson-unavailable" | "own-lesson" | "hold-failed";

/**
 * Places a 15 minute hold on a slot as a pending booking.
 *
 * The slot is checked again on the server: the browser's choice is never trusted. The database
 * exclusion constraint then makes overlapping holds impossible, even under concurrent requests.
 * The idempotency key makes a repeated submit return the same booking instead of a second one.
 */
export async function createTrialHold(
  input: TrialHoldInput,
): Promise<ActionResult<TrialHold> & { notice?: HoldNotice }> {
  const admin = getSupabaseAdminClient();

  const { data: offering, error: offeringError } = await admin
    .from("lesson_offerings")
    .select("id, teacher_id, duration_minutes, price_minor, currency, is_active")
    .eq("id", input.offeringId)
    .maybeSingle();
  if (offeringError) {
    logEvent("error", "booking.offering_load_failed", { code: offeringError.code ?? null });
    return withNotice("hold-failed", fail("We could not place the hold. Try again."));
  }
  if (!offering || !offering.is_active) {
    return withNotice("lesson-unavailable", fail("That lesson is no longer offered."));
  }
  if (offering.teacher_id === input.learnerId) {
    return withNotice("own-lesson", fail("You cannot book your own lesson."));
  }

  const { data: teacher, error: teacherError } = await admin
    .from("teacher_profiles")
    .select("verification_status")
    .eq("profile_id", offering.teacher_id)
    .maybeSingle();
  if (teacherError) {
    logEvent("error", "booking.teacher_load_failed", { code: teacherError.code ?? null });
    return withNotice("hold-failed", fail("We could not place the hold. Try again."));
  }
  if (teacher?.verification_status !== "approved") {
    return withNotice(
      "lesson-unavailable",
      fail("That teacher is not accepting lessons right now."),
    );
  }

  const { slots } = await getOpenSlots({
    teacherId: offering.teacher_id,
    durationMinutes: offering.duration_minutes,
    now: input.now,
  });
  const requestedStart = input.startsAt.getTime();
  const slot = slots.find((candidate) => candidate.startsAt.getTime() === requestedStart);
  if (!slot) {
    return withNotice(
      "slot-unavailable",
      fail("That time is no longer available. Choose another time."),
    );
  }

  const feeBps = await readPlatformFeeBps();
  const holdExpiresAt = new Date(input.now.getTime() + HOLD_MINUTES * MINUTE_MS);

  const { data, error } = await admin
    .from("bookings")
    .insert({
      learner_id: input.learnerId,
      teacher_id: offering.teacher_id,
      offering_id: offering.id,
      starts_at: slot.startsAt.toISOString(),
      ends_at: slot.endsAt.toISOString(),
      status: "pending_payment",
      price_minor: offering.price_minor,
      currency: offering.currency,
      fee_minor: calculatePlatformFee(offering.price_minor, feeBps),
      idempotency_key: input.idempotencyKey,
      hold_expires_at: holdExpiresAt.toISOString(),
    })
    .select("id, hold_expires_at")
    .single();

  if (error) {
    return handleInsertError(error, input);
  }

  logEvent("info", "booking.hold_created", { bookingId: data.id });
  return ok({ bookingId: data.id, holdExpiresAt: data.hold_expires_at }, "Lesson held.");
}

async function handleInsertError(
  error: { code?: string | null },
  input: TrialHoldInput,
): Promise<ActionResult<TrialHold> & { notice?: HoldNotice }> {
  // 23505: this learner already sent this key, so return the booking they already have.
  if (error.code === "23505") {
    const existing = await findBookingByKey(input.learnerId, input.idempotencyKey);
    if (existing) return ok(existing, "Lesson held.");
  }
  // 23P01: another booking overlaps the slot. The exclusion constraint is the final guard.
  if (error.code === "23P01") {
    return withNotice("slot-unavailable", fail("That time was just taken. Choose another time."));
  }
  logEvent("error", "booking.hold_insert_failed", { code: error.code ?? null });
  return withNotice("hold-failed", fail("We could not place the hold. Try again."));
}

async function findBookingByKey(learnerId: string, key: string): Promise<TrialHold | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("bookings")
    .select("id, hold_expires_at")
    .eq("learner_id", learnerId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error || !data) return null;
  return { bookingId: data.id, holdExpiresAt: data.hold_expires_at };
}

async function readPlatformFeeBps(): Promise<number> {
  const { data, error } = await getSupabaseAdminClient()
    .from("platform_settings")
    .select("platform_fee_bps")
    .eq("singleton", true)
    .maybeSingle();
  if (error) {
    logEvent("error", "booking.fee_settings_failed", { code: error.code ?? null });
    throw new Error("Could not read platform settings.");
  }
  return data?.platform_fee_bps ?? 0;
}

function withNotice(
  notice: HoldNotice,
  result: ActionResult<never>,
): ActionResult<TrialHold> & { notice?: HoldNotice } {
  return { ...result, notice };
}
