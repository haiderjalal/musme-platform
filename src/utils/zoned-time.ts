export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface LocalDateTime extends CalendarDate {
  hour: number;
  minute: number;
}

/** Offset in minutes between UTC and the named zone at the given instant (east is positive). */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  const wallClockAsUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  // Compare on whole seconds: milliseconds are not part of the wall-clock reading.
  const wholeSecondInstant = Math.floor(instant.getTime() / 1000) * 1000;
  return (wallClockAsUtc - wholeSecondInstant) / 60_000;
}

/**
 * Converts a wall-clock time in a named zone (for example a teacher's local 18:30) to a UTC Date.
 * The second pass corrects for daylight saving changes near the requested time.
 */
export function zonedTimeToUtc(local: LocalDateTime, timeZone: string): Date {
  const wallClockAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const firstOffset = zoneOffsetMinutes(new Date(wallClockAsUtc), timeZone);
  const firstGuess = wallClockAsUtc - firstOffset * 60_000;
  const secondOffset = zoneOffsetMinutes(new Date(firstGuess), timeZone);
  return new Date(wallClockAsUtc - secondOffset * 60_000);
}

/** The calendar date, as read in the named zone, of a UTC instant. */
export function localDateOf(instant: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day") };
}

/** Day of week (0 = Sunday) of a calendar date, independent of the machine's time zone. */
export function weekdayOf(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/** Calendar date after adding whole days. UTC arithmetic keeps daylight saving from shifting it. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** yyyy-mm-dd. Strings in this format sort in date order. */
export function formatDateKey(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}
