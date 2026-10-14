import "server-only";

import { z } from "zod";

import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const BOOKING_STATUSES = [
  "pending_payment",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "refunded",
  "expired",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface BookingListItem {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  holdExpiresAt: Date | null;
  priceMinor: number;
  currency: string;
  counterpartName: string;
  offeringTitle: string;
}

const bookingRow = z.object({
  id: z.uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.enum(BOOKING_STATUSES),
  hold_expires_at: z.string().nullable(),
  price_minor: z.number().int(),
  currency: z.string(),
  learner: z.object({ display_name: z.string().nullable() }).nullable(),
  teacher: z.object({ display_name: z.string().nullable() }).nullable(),
  offering: z.object({ title: z.string() }).nullable(),
});

/**
 * The signed-in user's bookings, as learner or teacher. Row level security returns only rows the
 * user is a party to. The counterpart name is the other person's display name.
 */
export async function listMyBookings(
  userId: string,
  role: "learner" | "teacher",
): Promise<BookingListItem[]> {
  const supabase = await createSupabaseServerClient();
  const column = role === "teacher" ? "teacher_id" : "learner_id";
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `id, starts_at, ends_at, status, hold_expires_at, price_minor, currency,
       learner:profiles!bookings_learner_id_fkey(display_name),
       teacher:profiles!bookings_teacher_id_fkey(display_name),
       offering:lesson_offerings(title)`,
    )
    .eq(column, userId)
    .order("starts_at", { ascending: false })
    .limit(100);

  if (error) {
    logEvent("error", "bookings.list_failed", { code: error.code ?? null });
    throw new Error("Could not load your lessons.");
  }

  return z
    .array(bookingRow)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
      status: row.status,
      holdExpiresAt: row.hold_expires_at ? new Date(row.hold_expires_at) : null,
      priceMinor: row.price_minor,
      currency: row.currency,
      counterpartName:
        (role === "teacher" ? row.learner?.display_name : row.teacher?.display_name) ??
        "MUSME member",
      offeringTitle: row.offering?.title ?? "Live lesson",
    }));
}

/** One booking the user is a party to, or null. RLS hides every other booking. */
export async function getMyBooking(bookingId: string): Promise<BookingListItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `id, starts_at, ends_at, status, hold_expires_at, price_minor, currency,
       learner:profiles!bookings_learner_id_fkey(display_name),
       teacher:profiles!bookings_teacher_id_fkey(display_name),
       offering:lesson_offerings(title)`,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    logEvent("error", "bookings.detail_failed", { code: error.code ?? null });
    throw new Error("Could not load this lesson.");
  }
  if (!data) return null;

  const row = bookingRow.parse(data);
  return {
    id: row.id,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    status: row.status,
    holdExpiresAt: row.hold_expires_at ? new Date(row.hold_expires_at) : null,
    priceMinor: row.price_minor,
    currency: row.currency,
    counterpartName: row.teacher?.display_name ?? "MUSME teacher",
    offeringTitle: row.offering?.title ?? "Live lesson",
  };
}
