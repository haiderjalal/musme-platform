import { MIN_NOTICE_MINUTES, SLOT_STEP_MINUTES } from "@/constants/booking";
import {
  addDays,
  localDateOf,
  weekdayOf,
  zonedTimeToUtc,
  type CalendarDate,
} from "@/utils/zoned-time";

export interface TimeRange {
  start: Date;
  end: Date;
}

/** A weekly window in the teacher's own time zone, for example Monday 18:00 to 21:00. */
export interface AvailabilityRule {
  weekday: number;
  startLocal: string;
  endLocal: string;
  validFrom: CalendarDate | null;
  validTo: CalendarDate | null;
}

export interface AvailabilityException {
  range: TimeRange;
  kind: "blocked" | "extra";
}

export interface SlotQuery {
  timeZone: string;
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  /** Existing bookings that hold a slot, including pending holds. */
  busy: TimeRange[];
  /** Earliest start to consider. */
  from: Date;
  /** Start times at or after this instant are not returned. */
  to: Date;
  now: Date;
  durationMinutes: number;
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
}

const MINUTE_MS = 60_000;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Lists the start times a learner can book. Pure: it takes the teacher's rules and existing
 * bookings as input and touches no database or clock of its own.
 */
export function findOpenSlots(query: SlotQuery): Slot[] {
  const earliest = new Date(
    Math.max(query.from.getTime(), query.now.getTime() + MIN_NOTICE_MINUTES * MINUTE_MS),
  );
  if (earliest.getTime() >= query.to.getTime()) return [];

  const windows = [
    ...ruleWindows(query, earliest),
    ...query.exceptions.filter((e) => e.kind === "extra").map((e) => e.range),
  ];
  const unavailable = [
    ...query.busy,
    ...query.exceptions.filter((e) => e.kind === "blocked").map((e) => e.range),
  ];
  const durationMs = query.durationMinutes * MINUTE_MS;
  const stepMs = SLOT_STEP_MINUTES * MINUTE_MS;

  const slots = new Map<number, Slot>();
  for (const window of windows) {
    for (
      let start = window.start.getTime();
      start + durationMs <= window.end.getTime();
      start += stepMs
    ) {
      const startMs = start;
      const endMs = start + durationMs;
      if (startMs < earliest.getTime() || startMs >= query.to.getTime()) continue;
      if (overlapsAny(startMs, endMs, unavailable)) continue;
      slots.set(startMs, { startsAt: new Date(startMs), endsAt: new Date(endMs) });
    }
  }

  return [...slots.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function ruleWindows(query: SlotQuery, earliest: Date): TimeRange[] {
  const windows: TimeRange[] = [];
  const firstDay = localDateOf(earliest, query.timeZone);
  const lastDay = addDays(localDateOf(query.to, query.timeZone), 1);

  for (let day = firstDay; daysBetween(day, lastDay) >= 0; day = addDays(day, 1)) {
    const weekday = weekdayOf(day);
    for (const rule of query.rules) {
      if (rule.weekday !== weekday || !isWithinValidity(rule, day)) continue;
      const start = parseLocalTime(rule.startLocal);
      const end = parseLocalTime(rule.endLocal);
      if (!start || !end) continue;

      const windowStart = zonedTimeToUtc({ ...day, ...start }, query.timeZone);
      const windowEnd = zonedTimeToUtc({ ...day, ...end }, query.timeZone);
      if (windowEnd.getTime() > windowStart.getTime()) {
        windows.push({ start: windowStart, end: windowEnd });
      }
    }
  }
  return windows;
}

function isWithinValidity(rule: AvailabilityRule, day: CalendarDate): boolean {
  const key = toKey(day);
  if (rule.validFrom && key < toKey(rule.validFrom)) return false;
  if (rule.validTo && key > toKey(rule.validTo)) return false;
  return true;
}

function parseLocalTime(value: string): { hour: number; minute: number } | null {
  const match = LOCAL_TIME_PATTERN.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function overlapsAny(startMs: number, endMs: number, ranges: TimeRange[]): boolean {
  return ranges.some((range) => startMs < range.end.getTime() && endMs > range.start.getTime());
}

function toKey(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / (24 * 60 * MINUTE_MS));
}
