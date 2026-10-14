import { z } from "zod";

import { teacherSlugSchema } from "@/features/teachers/schemas";

/** Returns true when the runtime knows the zone. Invalid zones would break slot times. */
function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const languageSchema = z.string().min(2, "Each language needs at least 2 characters.").max(40);

/** Splits "Urdu, English" into ["Urdu", "English"]. Empty entries are dropped. */
export function parseLanguages(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

const teacherFields = {
  displayName: z
    .string()
    .trim()
    .min(2, "Enter your name as learners will see it.")
    .max(80, "Keep your name under 80 characters."),
  slug: teacherSlugSchema,
  headline: z
    .string()
    .trim()
    .min(3, "Add a short headline.")
    .max(120, "Keep the headline under 120 characters."),
  bio: z
    .string()
    .trim()
    .min(20, "Tell learners a little more. At least 20 characters.")
    .max(2000, "Keep the bio under 2,000 characters."),
  instrumentIds: z
    .array(z.uuid())
    .min(1, "Choose at least one instrument.")
    .max(5, "Choose up to five instruments."),
  timezone: z.string().refine(isKnownTimeZone, "Choose a valid time zone."),
};

/** Server-side contract. Every field is checked again here, whatever the browser sent. */
export const teacherApplicationSchema = z.object({
  ...teacherFields,
  languages: z
    .array(languageSchema)
    .min(1, "Add at least one language.")
    .max(5, "Choose up to five languages."),
});

export type TeacherApplicationInput = z.infer<typeof teacherApplicationSchema>;

/** Form contract. Languages are typed as one comma-separated text box and converted on submit. */
export const teacherApplicationFormSchema = z.object({
  ...teacherFields,
  languages: z
    .string()
    .refine((value) => parseLanguages(value).length >= 1, "Add at least one language.")
    .refine((value) => parseLanguages(value).length <= 5, "Choose up to five languages.")
    .refine(
      (value) =>
        parseLanguages(value).every((language) => languageSchema.safeParse(language).success),
      "Each language needs at least 2 characters.",
    ),
});

export type TeacherApplicationFormValues = z.input<typeof teacherApplicationFormSchema>;

export function toApplicationInput(values: TeacherApplicationFormValues): TeacherApplicationInput {
  return { ...values, languages: parseLanguages(values.languages) };
}
