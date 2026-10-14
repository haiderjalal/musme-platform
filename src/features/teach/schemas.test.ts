import { describe, expect, it } from "vitest";

import {
  parseLanguages,
  teacherApplicationFormSchema,
  teacherApplicationSchema,
  toApplicationInput,
} from "./schemas";

const VALID_FORM = {
  displayName: "Asha Verma",
  slug: "asha-verma",
  headline: "Hindustani vocal teacher for adult beginners",
  bio: "I teach voice production and bandish interpretation to adults returning to singing.",
  languages: "Hindi, English",
  instrumentIds: ["6f1d2c3a-0000-4000-8000-000000000001"],
  timezone: "Asia/Karachi",
};

describe("parseLanguages", () => {
  it("splits on commas, trims and drops empty entries", () => {
    expect(parseLanguages(" Urdu , English,, ")).toEqual(["Urdu", "English"]);
  });
});

describe("teacherApplicationFormSchema", () => {
  it("accepts a complete application", () => {
    expect(teacherApplicationFormSchema.safeParse(VALID_FORM).success).toBe(true);
  });

  it("rejects an unknown time zone", () => {
    const result = teacherApplicationFormSchema.safeParse({
      ...VALID_FORM,
      timezone: "Mars/Olympus",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a slug that is not a clean web address", () => {
    const result = teacherApplicationFormSchema.safeParse({ ...VALID_FORM, slug: "Asha Verma!" });
    expect(result.success).toBe(false);
  });

  it("rejects more than five languages", () => {
    const result = teacherApplicationFormSchema.safeParse({
      ...VALID_FORM,
      languages: "Urdu, Hindi, English, Punjabi, Pashto, Sindhi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an application with no instrument", () => {
    const result = teacherApplicationFormSchema.safeParse({ ...VALID_FORM, instrumentIds: [] });
    expect(result.success).toBe(false);
  });
});

describe("toApplicationInput", () => {
  it("converts the typed language list into the array the server expects", () => {
    const input = toApplicationInput(VALID_FORM);
    expect(input.languages).toEqual(["Hindi", "English"]);
    expect(teacherApplicationSchema.safeParse(input).success).toBe(true);
  });
});
