import { z } from "zod";

const siteUrlSchema = z.url();
const LOCAL_FALLBACK = "http://localhost:3000";

/**
 * Public origin of the site, used for auth redirects. Falls back to localhost in development
 * only, so a missing value in production shows up as a visible mistake rather than a silent one.
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && siteUrlSchema.safeParse(configured).success) {
    return new URL(configured).origin;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL must be set in production.");
  }
  return LOCAL_FALLBACK;
}
