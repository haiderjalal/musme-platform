import type { Metadata } from "next";
import { connection } from "next/server";

import { EmptyState } from "@/components/shared/state-panels";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ROUTES } from "@/constants/routes";
import { requireAdmin } from "@/features/auth/session";
import { reviewTeacherFormAction } from "@/features/admin/actions";
import { listPendingTeachers, listRecentAudit } from "@/features/admin/queries";
import { formatDateTimeInZone } from "@/utils/format";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

interface AdminPageProps {
  searchParams: Promise<{ notice?: string }>;
}

const NOTICE_TEXT: Record<string, string> = {
  reviewed: "Decision saved.",
  "review-failed": "We could not save that decision. Try again.",
  "review-invalid": "Check the decision and reason, then try again.",
};

export default async function AdminPage({
  searchParams,
}: AdminPageProps): Promise<React.ReactElement> {
  await connection();
  const admin = await requireAdmin(ROUTES.admin);
  const { notice } = await searchParams;
  const [pending, audit] = await Promise.all([listPendingTeachers(), listRecentAudit()]);

  return (
    <main id="main" className="mx-auto grid max-w-5xl gap-10 px-4 pb-20 pt-10">
      <header className="grid gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Admin</p>
        <h1 className="text-3xl font-bold">Teacher applications</h1>
        <p className="text-muted">
          Signed in as {admin.displayName ?? "admin"}. Every decision is recorded.
        </p>
      </header>

      {notice && NOTICE_TEXT[notice] ? (
        <p role="status" className="rounded-xl bg-surface-2 p-4 text-sm font-medium">
          {NOTICE_TEXT[notice]}
        </p>
      ) : null}

      <section aria-labelledby="pending-heading" className="grid gap-4">
        <h2 id="pending-heading" className="text-xl font-semibold">
          Waiting for review ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            title="Nothing to review."
            description="New applications appear here as teachers submit them."
          />
        ) : (
          <ul className="grid gap-4">
            {pending.map((item) => (
              <li
                key={item.profileId}
                className="grid gap-4 rounded-[18px] border border-line bg-surface p-5"
              >
                <div className="grid gap-1">
                  <p className="text-lg font-semibold">{item.displayName}</p>
                  <p className="text-sm text-muted">{item.headline}</p>
                  <p className="text-xs text-muted">
                    Submitted {formatDateTimeInZone(item.submittedAt, admin.timezone)} · /teachers/
                    {item.slug}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                  <form action={reviewTeacherFormAction} className="grid gap-2">
                    <input type="hidden" name="teacherId" value={item.profileId} />
                    <label htmlFor={`reason-${item.profileId}`} className="text-sm font-semibold">
                      Reason (required to reject)
                    </label>
                    <textarea
                      id={`reason-${item.profileId}`}
                      name="reason"
                      maxLength={500}
                      rows={2}
                      className="rounded-xl border border-line bg-bg p-3 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <SubmitButton name="decision" value="approve" className="min-h-11">
                        Approve
                      </SubmitButton>
                      <Button
                        type="submit"
                        name="decision"
                        value="reject"
                        variant="danger"
                        className="min-h-11"
                      >
                        Reject
                      </Button>
                    </div>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="audit-heading" className="grid gap-4">
        <h2 id="audit-heading" className="text-xl font-semibold">
          Recent admin actions
        </h2>
        {audit.length === 0 ? (
          <p className="text-sm text-muted">No admin actions yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[18px] border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    When
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Action
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Target
                  </th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id} className="border-t border-line">
                    <td className="px-4 py-3 tabular-nums">
                      {formatDateTimeInZone(entry.createdAt, admin.timezone)}
                    </td>
                    <td className="px-4 py-3">{entry.action}</td>
                    <td className="px-4 py-3 text-muted">{entry.targetType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
