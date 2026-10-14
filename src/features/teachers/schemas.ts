import { z } from "zod";

/** Public listing filters from the URL. Only letters, numbers, spaces and hyphens reach the query. */
export const teacherFiltersSchema = z.object({
  instrument: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/, "Unknown instrument.")
    .optional()
    .catch(undefined),
  q: z
    .string()
    .max(80)
    .regex(/^[\p{L}\p{N} -]*$/u, "Search uses letters, numbers and spaces only.")
    .optional()
    .catch(undefined),
});

export type TeacherFilterParams = z.infer<typeof teacherFiltersSchema>;

/** Slug format enforced by the database and the application. */
export const teacherSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .min(3)
  .max(80);
