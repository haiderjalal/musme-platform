import Link from "next/link";

import { ROUTES } from "@/constants/routes";
import { getCurrentUser } from "@/features/auth/session";
import { signOutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: ROUTES.teachers, label: "Teachers" },
  { href: ROUTES.learnBookings, label: "My lessons" },
  { href: ROUTES.messages, label: "Messages" },
  { href: ROUTES.teach, label: "Teach" },
] as const;

/** Server component. The header reads the session on the server, so the markup is correct without JavaScript. */
export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href={ROUTES.home} className="flex items-center gap-2 font-bold tracking-[0.14em]">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-xl bg-primary text-lg text-primary-ink"
          >
            ♪
          </span>
          MUSME
        </Link>

        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          {user?.role === "admin" ? (
            <Link
              href={ROUTES.admin}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Admin
            </Link>
          ) : null}
        </nav>

        {user ? (
          <form action={signOutAction}>
            <Button variant="secondary" size="md" type="submit">
              Sign out
            </Button>
          </form>
        ) : (
          <Link
            href={ROUTES.login}
            className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-bg"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
