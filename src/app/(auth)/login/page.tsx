import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { getCurrentUser } from "@/features/auth/session";
import { LoginForm } from "@/features/auth/components/login-form";
import { safeNextPath } from "@/utils/safe-next-path";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to MUSME to book lessons, chat with teachers and practise.",
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps): Promise<React.ReactElement> {
  await connection();
  const params = await searchParams;
  const next = safeNextPath(params.next);

  const user = await getCurrentUser();
  if (user) {
    redirect(next);
  }

  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-4 py-12">
      <header className="grid gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">MUSME</p>
        <h1 className="text-3xl font-bold">Sign in to continue</h1>
        <p className="text-muted">We will email you a link. Click it on this device to sign in.</p>
      </header>
      {params.error === "link" ? (
        <p role="alert" className="rounded-xl bg-surface-2 p-3 text-sm text-danger">
          That sign-in link did not work. It may have expired. Request a new one below.
        </p>
      ) : null}
      <LoginForm next={next} />
      <p className="text-center text-xs text-muted">
        <a href={ROUTES.teachers} className="underline underline-offset-4">
          Browse teachers first
        </a>
      </p>
    </main>
  );
}
