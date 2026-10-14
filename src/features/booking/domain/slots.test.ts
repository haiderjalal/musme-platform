import { describe, expect, it } from "vitest";

import { findOpenSlots, type AvailabilityRule, type SlotQuery } from "./slots";

// 2026-10-19 is a Monday in every zone used below.
const MONDAY_RULE: AvailabilityRule = {
  weekday: 1,
  startLocal: "18:00",
  endLocal: "20:00",
  validFrom: null,
  validTo: null,
};

function baseQuery(overrides: Partial<SlotQuery>): SlotQuery {
  return {
    timeZone: "Asia/Karachi",
    rules: [MONDAY_RULE],
    exceptions: [],
    busy: [],
    from: new Date("2026-10-18T00:00:00Z"),
    to: new Date("2026-10-26T00:00:00Z"),
    now: new Date("2026-10-14T00:00:00Z"),
    durationMinutes: 60,
    ...overrides,
  };
}

function startsOf(slots: { startsAt: Date }[]): string[] {
  return slots.map((slot) => slot.startsAt.toISOString());
}

describe("findOpenSlots", () => {
  it("offers 30 minute steps inside a weekly rule, converted from the teacher's zone", () => {
    // Karachi is UTC+5, so the 18:00-20:00 local rule is 13:00-15:00 UTC.
    // A 60 minute lesson fits when it ends by 15:00, so the last start is 14:00 UTC.
    const slots = findOpenSlots(baseQuery({ durationMinutes: 60 }));
    expect(startsOf(slots)).toEqual([
      "2026-10-19T13:00:00.000Z",
      "2026-10-19T13:30:00.000Z",
      "2026-10-19T14:00:00.000Z",
    ]);
  });

  it("keeps a slot only when the whole lesson fits inside the rule window", () => {
    // Starts step from the window start (13:00 UTC), so a 45 minute lesson can start at 14:00
    // (ends 14:45). A start at 14:30 would run to 15:15, past the window, and is excluded.
    const slots = findOpenSlots(baseQuery({ durationMinutes: 45 }));
    expect(startsOf(slots)).toContain("2026-10-19T14:00:00.000Z");
    expect(startsOf(slots)).not.toContain("2026-10-19T14:30:00.000Z");
  });

  it("removes slots that overlap an existing booking, including a partial overlap", () => {
    // Busy 13:20-13:40 UTC blocks the 13:00 and 13:30 starts for a 60 minute lesson.
    // The 14:00 start is clear, and it is the only one that still fits.
    const slots = findOpenSlots(
      baseQuery({
        busy: [
          {
            start: new Date("2026-10-19T13:20:00Z"),
            end: new Date("2026-10-19T13:40:00Z"),
          },
        ],
      }),
    );
    expect(startsOf(slots)).toEqual(["2026-10-19T14:00:00.000Z"]);
  });

  it("does not block a slot that starts exactly when a booking ends", () => {
    // A booking from 12:30 to 13:30 UTC overlaps the 13:00 start but touches the 13:30 start.
    const busy = [
      { start: new Date("2026-10-19T12:30:00Z"), end: new Date("2026-10-19T13:30:00Z") },
    ];
    const slots = findOpenSlots(baseQuery({ busy, durationMinutes: 30 }));
    expect(startsOf(slots)).toEqual([
      "2026-10-19T13:30:00.000Z",
      "2026-10-19T14:00:00.000Z",
      "2026-10-19T14:30:00.000Z",
    ]);
  });

  it("removes time blocked by an exception", () => {
    // Blocked 13:00-13:30 UTC removes the 13:00 start. The 13:30 start is clear.
    const slots = findOpenSlots(
      baseQuery({
        exceptions: [
          {
            kind: "blocked",
            range: {
              start: new Date("2026-10-19T13:00:00Z"),
              end: new Date("2026-10-19T13:30:00Z"),
            },
          },
        ],
      }),
    );
    expect(startsOf(slots)).toEqual(["2026-10-19T13:30:00.000Z", "2026-10-19T14:00:00.000Z"]);
  });

  it("adds an extra window outside the weekly rule", () => {
    const slots = findOpenSlots(
      baseQuery({
        exceptions: [
          {
            kind: "extra",
            range: {
              start: new Date("2026-10-20T10:00:00Z"),
              end: new Date("2026-10-20T11:00:00Z"),
            },
          },
        ],
        durationMinutes: 30,
      }),
    );
    expect(startsOf(slots)).toContain("2026-10-20T10:00:00.000Z");
  });

  it("applies the minimum notice so a slot cannot start too soon", () => {
    // Now is 12:30 UTC. Notice is 60 minutes, so 13:00 UTC is too soon, and 13:30 UTC is allowed.
    const slots = findOpenSlots(
      baseQuery({ now: new Date("2026-10-19T12:30:00Z"), durationMinutes: 30 }),
    );
    expect(startsOf(slots)[0]).toBe("2026-10-19T13:30:00.000Z");
  });

  it("respects a rule's validity dates", () => {
    const slots = findOpenSlots(
      baseQuery({
        rules: [{ ...MONDAY_RULE, validTo: { year: 2026, month: 10, day: 18 } }],
      }),
    );
    expect(slots).toEqual([]);
  });

  it("handles a daylight saving zone without shifting local times", () => {
    // New York moved clocks on 2026-11-01. Its 18:00 is 22:00 UTC in October (EDT, UTC-4)
    // and 23:00 UTC in November (EST, UTC-5). The rule itself never changes.
    const october = findOpenSlots(
      baseQuery({
        timeZone: "America/New_York",
        from: new Date("2026-10-18T00:00:00Z"),
        to: new Date("2026-10-26T00:00:00Z"),
        durationMinutes: 30,
      }),
    );
    expect(startsOf(october)[0]).toBe("2026-10-19T22:00:00.000Z");

    const november = findOpenSlots(
      baseQuery({
        timeZone: "America/New_York",
        from: new Date("2026-11-01T00:00:00Z"),
        to: new Date("2026-11-09T00:00:00Z"),
        now: new Date("2026-10-30T00:00:00Z"),
        durationMinutes: 30,
      }),
    );
    expect(startsOf(november)[0]).toBe("2026-11-02T23:00:00.000Z");
  });

  it("returns nothing when the window is empty or in the past", () => {
    expect(findOpenSlots(baseQuery({ to: new Date("2026-10-14T00:00:00Z") }))).toEqual([]);
  });
});
