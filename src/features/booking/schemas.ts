import { z } from "zod";

import { teacherSlugSchema } from "@/features/teachers/schemas";

/** The form a learner submits when they pick a slot. Every field is re-validated on the server. */
export const holdRequestSchema = z.object({
  teacherSlug: teacherSlugSchema,
  offeringId: z.uuid({ error: "Choose a lesson length." }),
  startsAt: z.iso.datetime({ error: "That time is not valid." }),
  idempotencyKey: z.uuid({ error: "The request is not valid. Reload the page and try again." }),
});

export type HoldRequest = z.infer<typeof holdRequestSchema>;
