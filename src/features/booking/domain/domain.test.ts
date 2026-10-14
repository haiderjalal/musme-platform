import { describe, expect, it } from "vitest";

import { calculatePlatformFee } from "./fees";
import { isWithinJoinWindow, joinWindowOpensAt } from "./join-window";

const START = new Date("2026-10-19T13:00:00Z");
const END = new Date("2026-10-19T13:45:00Z");

describe("isWithinJoinWindow", () => {
  it("opens 10 minutes before the class starts", () => {
    expect(
      isWithinJoinWindow({ startsAt: START, endsAt: END }, new Date("2026-10-19T12:50:00Z")),
    ).toBe(true);
    expect(
      isWithinJoinWindow({ startsAt: START, endsAt: END }, new Date("2026-10-19T12:49:59Z")),
    ).toBe(false);
  });

  it("closes 15 minutes after the class ends", () => {
    expect(
      isWithinJoinWindow({ startsAt: START, endsAt: END }, new Date("2026-10-19T14:00:00Z")),
    ).toBe(true);
    expect(
      isWithinJoinWindow({ startsAt: START, endsAt: END }, new Date("2026-10-19T14:00:01Z")),
    ).toBe(false);
  });

  it("reports the opening instant for display", () => {
    expect(joinWindowOpensAt({ startsAt: START, endsAt: END }).toISOString()).toBe(
      "2026-10-19T12:50:00.000Z",
    );
  });
});

describe("calculatePlatformFee", () => {
  it("applies basis points and rounds down to the minor unit", () => {
    expect(calculatePlatformFee(10_000, 1_500)).toBe(1_500);
    expect(calculatePlatformFee(999, 1_000)).toBe(99);
  });

  it("returns zero when the fee is not set", () => {
    expect(calculatePlatformFee(5_000, 0)).toBe(0);
  });

  it("rejects values that are not whole minor units or valid rates", () => {
    expect(() => calculatePlatformFee(10.5, 100)).toThrow(RangeError);
    expect(() => calculatePlatformFee(-1, 100)).toThrow(RangeError);
    expect(() => calculatePlatformFee(100, 10_001)).toThrow(RangeError);
  });
});
