import { describe, expect, it } from "vitest";

import { addDays, formatDateKey, localDateOf, weekdayOf, zonedTimeToUtc } from "./zoned-time";

describe("zonedTimeToUtc", () => {
  it("converts a fixed-offset zone", () => {
    const utc = zonedTimeToUtc(
      { year: 2026, month: 10, day: 19, hour: 18, minute: 30 },
      "Asia/Karachi",
    );
    expect(utc.toISOString()).toBe("2026-10-19T13:30:00.000Z");
  });

  it("corrects for a daylight saving offset", () => {
    const summer = zonedTimeToUtc(
      { year: 2026, month: 7, day: 1, hour: 9, minute: 0 },
      "Europe/London",
    );
    const winter = zonedTimeToUtc(
      { year: 2026, month: 1, day: 15, hour: 9, minute: 0 },
      "Europe/London",
    );
    expect(summer.toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(winter.toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });
});

describe("calendar helpers", () => {
  it("reads the local calendar date in a zone", () => {
    // 22:30 UTC on the 19th is already the 20th in Karachi (UTC+5).
    expect(localDateOf(new Date("2026-10-19T22:30:00Z"), "Asia/Karachi")).toEqual({
      year: 2026,
      month: 10,
      day: 20,
    });
  });

  it("returns the weekday of a calendar date", () => {
    expect(weekdayOf({ year: 2026, month: 10, day: 19 })).toBe(1);
  });

  it("adds days across month boundaries", () => {
    expect(addDays({ year: 2026, month: 10, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 11,
      day: 1,
    });
  });

  it("formats dates as sortable keys", () => {
    expect(formatDateKey({ year: 2026, month: 3, day: 7 })).toBe("2026-03-07");
  });
});
