import { describe, expect, it } from "vitest";

import { teacherFiltersSchema, teacherSlugSchema } from "./schemas";

describe("teacherFiltersSchema", () => {
  it("accepts a known instrument slug and a plain search term", () => {
    const parsed = teacherFiltersSchema.parse({ instrument: "tabla", q: "bandish beginners" });
    expect(parsed).toEqual({ instrument: "tabla", q: "bandish beginners" });
  });

  it("drops search text that could change the query", () => {
    // Commas, parentheses and wildcards are stripped to undefined, never sent to the database.
    const parsed = teacherFiltersSchema.parse({ q: "x),or(id.eq.1" });
    expect(parsed.q).toBeUndefined();
  });

  it("drops an instrument value that is not a slug", () => {
    const parsed = teacherFiltersSchema.parse({ instrument: "Tabla; drop" });
    expect(parsed.instrument).toBeUndefined();
  });
});

describe("teacherSlugSchema", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(teacherSlugSchema.safeParse("asha-verma-2").success).toBe(true);
  });

  it("rejects double hyphens, uppercase and leading hyphens", () => {
    expect(teacherSlugSchema.safeParse("asha--verma").success).toBe(false);
    expect(teacherSlugSchema.safeParse("Asha-Verma").success).toBe(false);
    expect(teacherSlugSchema.safeParse("-asha").success).toBe(false);
  });
});
