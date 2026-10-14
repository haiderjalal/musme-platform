import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/teachers/asha-verma")).toBe("/teachers/asha-verma");
    expect(safeNextPath("/classes/8f1c2d3e?x=1")).toBe("/classes/8f1c2d3e?x=1");
  });

  it("refuses absolute and protocol-relative URLs (open redirects)", () => {
    expect(safeNextPath("https://evil.example/steal")).toBe("/learn/bookings");
    expect(safeNextPath("//evil.example")).toBe("/learn/bookings");
    expect(safeNextPath("/\\evil.example")).toBe("/learn/bookings");
  });

  it("refuses the login page, so a signed-in user cannot be looped back to sign-in", () => {
    expect(safeNextPath("/login")).toBe("/learn/bookings");
    expect(safeNextPath("/login?next=/teachers")).toBe("/learn/bookings");
  });

  it("falls back to the default for anything that is not a string", () => {
    expect(safeNextPath(undefined)).toBe("/learn/bookings");
    expect(safeNextPath(["/a"])).toBe("/learn/bookings");
  });
});
