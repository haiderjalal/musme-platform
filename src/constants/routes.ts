export const ROUTES = {
  home: "/",
  teachers: "/teachers",
  login: "/login",
  learnBookings: "/learn/bookings",
  messages: "/messages",
  teachApply: "/teach/apply",
  teach: "/teach",
  admin: "/admin",
  classRoom: (bookingId: string): string => `/classes/${bookingId}`,
  teacher: (slug: string): string => `/teachers/${slug}`,
  conversation: (conversationId: string): string => `/messages/${conversationId}`,
} as const;

/** Routes that require a signed-in user. Role checks happen in the page and service layers. */
const PROTECTED_PREFIXES = [
  ROUTES.learnBookings,
  ROUTES.messages,
  "/classes",
  ROUTES.teach,
  ROUTES.admin,
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
