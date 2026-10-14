import "server-only";

import { z } from "zod";

import { BOOKING_WINDOW_DAYS } from "@/constants/booking";
import { logEvent } from "@/lib/logger";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CalendarDate } from "@/utils/zoned-time";

import {
  findOpenSlots,
  type AvailabilityException,
  type AvailabilityRule,
  type Slot,
  type TimeRange,
} from "./domain/slots";

const DAY_MS = 24 * 60 * 60 * 1000;

const ruleRow = z.object({
  weekday: z.number().int().min(0).max(6),
  start_local_time: z.string(),
  end_local_time: z.string(),
  valid_from: z.string().nullable(),
  valid_to: z.string().nullable(),
});

const exceptionRow = z.object({
  starts_at: z.string(),
  ends_at: z.string(),
  kind: z.enum(["blocked", "extra"]),
});

const busyRow = z.object({ starts_at: z.string(), ends_at: z.string() });

const profileRow = z.object({ timezone: z.string() });

export interface OpenSlotsResult {
  timeZone: string;
  slots: Slot[];
}

/**
 * Bookable start times for one teacher and lesson length, over the booking window.
 * Uses the service role because learners cannot read another teacher's rules. The result
 * contains only the open slots, never the rules, the busy ranges or any learner data.
 */
export async function getOpenSlots(input: {
  teacherId: string;
  durationMinutes: number;
  now: Date;
}): Promise<OpenSlotsResult> {
  const admin = getSupabaseAdminClient();
  const from = input.now;
  const to = new Date(input.now.getTime() + BOOKING_WINDOW_DAYS * DAY_MS);

  const [profile, rules, exceptions, busy] = await Promise.all([
    admin.from("profiles").select("timezone").eq("id", input.teacherId).maybeSingle(),
    admin
      .from("availability_rules")
      .select("weekday, start_local_time, end_local_time, valid_from, valid_to")
      .eq("teacher_id", input.teacherId),
    admin
      .from("availability_exceptions")
      .select("starts_at, ends_at, kind")
      .eq("teacher_id", input.teacherId)
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString()),
    admin.rpc("teacher_busy_ranges", {
      p_teacher_id: input.teacherId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    }),
  ]);

  const failure = profile.error ?? rules.error ?? exceptions.error ?? busy.error;
  if (failure) {
    logEvent("error", "availability.load_failed", { code: failure.code ?? null });
    throw new Error("Could not load availability.");
  }
  if (!profile.data) {
    return { timeZone: "UTC", slots: [] };
  }

  const timeZone = profileRow.parse(profile.data).timezone;
  const slots = findOpenSlots({
    timeZone,
    rules: z
      .array(ruleRow)
      .parse(rules.data ?? [])
      .map(toRule),
    exceptions: z
      .array(exceptionRow)
      .parse(exceptions.data ?? [])
      .map(toException),
    busy: z
      .array(busyRow)
      .parse(busy.data ?? [])
      .map(toRange),
    from,
    to,
    now: input.now,
    durationMinutes: input.durationMinutes,
  });

  return { timeZone, slots };
}

function toRule(row: z.infer<typeof ruleRow>): AvailabilityRule {
  return {
    weekday: row.weekday,
    // Postgres returns time values as HH:MM:SS. The domain expects HH:MM.
    startLocal: row.start_local_time.slice(0, 5),
    endLocal: row.end_local_time.slice(0, 5),
    validFrom: row.valid_from ? toCalendarDate(row.valid_from) : null,
    validTo: row.valid_to ? toCalendarDate(row.valid_to) : null,
  };
}

function toException(row: z.infer<typeof exceptionRow>): AvailabilityException {
  return { kind: row.kind, range: toRange(row) };
}

function toRange(row: { starts_at: string; ends_at: string }): TimeRange {
  return { start: new Date(row.starts_at), end: new Date(row.ends_at) };
}

function toCalendarDate(value: string): CalendarDate {
  const [year, month, day] = value.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 0, day: day ?? 0 };
}
