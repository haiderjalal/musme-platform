import Link from "next/link";

export default function NotFound(): React.ReactElement {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">404</p>
      <h1 className="text-2xl font-bold">We could not find that page.</h1>
      <p className="text-muted">The link may be out of date, or the page was moved.</p>
      <Link
        href="/teachers"
        className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-ink"
      >
        Browse teachers
      </Link>
    </main>
  );
}
