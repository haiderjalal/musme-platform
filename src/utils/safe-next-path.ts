import { ROUTES } from "@/constants/routes";

/**
 * Accepts only same-site relative paths for post-login redirects. This blocks open redirects
 * such as "//evil.example" or "/\evil.example". It also refuses the login page itself, so a
 * signed-in user cannot be sent back to sign-in in a loop.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return ROUTES.learnBookings;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return ROUTES.learnBookings;
  }
  if (value === ROUTES.login || value.startsWith(`${ROUTES.login}?`)) {
    return ROUTES.learnBookings;
  }
  return value;
}
