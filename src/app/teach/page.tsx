import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { ROUTES } from "@/constants/routes";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/features/auth/session";
import { submitTeacherForReviewAction } from "@/features/teach/actions";
import { getOwnTeacherStatus, type OwnTeacherStatus } from "@/features/teach/queries";

export const metadata: Metadata = {
  title: "Teach on MUSME",
  robots: { index: false, follow: false },
};

type StatusKey = OwnTeacherStatus["status"] | "none";

const STATUS_COPY: Record<StatusKey, { title: string; body: string }> = {
  none: {
    title: "Teach on MUSME",
    body: "Apply with your instruments and experience. Every teacher is reviewed before learners can book them.",
  },
  submitted: {
    title: "Your application is with us",
    body: "We review applications in the order they arrive. You will get an email when there is a decision.",
  },
  approved: {
    title: "You are live",
    body: "Learners can find your profile and book lessons. Keep your availability up to date.",
  },
  rejected: {
    title: "Your application needs changes",
    body: "Update your application, then send it for review again.",
  },
  suspended: {
    title: "Your teaching profile is paused",
    body: "Your profile is not visible to learners. Contact support for details.",
  },
};

const NOTICE_TEXT: Record<string, string> = {
  sent: "Sent for review.",
  "review-failed": "This application cannot be sent for review right now.",
};

interface TeachPageProps {
  searchParams: Promise<{ notice?: string }>;
}

export default async function TeachPage({
  searchParams,
}: TeachPageProps): Promise<React.ReactElement> {
  await connection();
  const user = await requireUser(ROUTES.teach);
  const [application, { notice }] = await Promise.all([getOwnTeacherStatus(user.id), searchParams]);
  const key: StatusKey = application?.status ?? "none";
  const copy = STATUS_COPY[key];

  return (
    <main id="main" className="mx-auto grid max-w-3xl gap-6 px-4 pb-20 pt-10">
      <header className="grid gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">For teachers</p>
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <p className="text-muted">{copy.body}</p>
      </header>

      {notice && NOTICE_TEXT[notice] ? (
        <p role="status" className="rounded-xl bg-surface-2 p-4 text-sm">
          {NOTICE_TEXT[notice]}
        </p>
      ) : null}

      {application?.status === "rejected" && application.rejectionReason ? (
        <p role="status" className="rounded-xl bg-surface-2 p-4 text-sm">
          <span className="font-semibold">Reviewer note:</span> {application.rejectionReason}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {key !== "suspended" ? (
          <Link
            href={ROUTES.teachApply}
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-ink"
          >
            {application ? "Edit application" : "Start application"}
          </Link>
        ) : null}
        {key === "rejected" ? (
          <form action={submitTeacherForReviewAction}>
            <SubmitButton variant="secondary" pendingLabel="Sending…" className="min-h-11">
              Send for review
            </SubmitButton>
          </form>
        ) : null}
        {key === "approved" && application ? (
          <Link
            href={ROUTES.teacher(application.slug)}
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 font-semibold"
          >
            View your profile
          </Link>
        ) : null}
      </div>
    </main>
  );
}
