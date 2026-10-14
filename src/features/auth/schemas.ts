import { z } from "zod";

export const magicLinkSchema = z.object({
  email: z
    .email({ error: "Enter a valid email address." })
    .max(254, "Email addresses can be at most 254 characters.")
    .transform((value) => value.trim().toLowerCase()),
  next: z.string().max(300).optional(),
});

export type MagicLinkInput = z.input<typeof magicLinkSchema>;
