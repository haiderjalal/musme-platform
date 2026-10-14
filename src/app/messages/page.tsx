import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { EmptyState } from "@/components/shared/state-panels";
import { ROUTES } from "@/constants/routes";
import { requireUser } from "@/features/auth/session";
import { listConversations } from "@/features/chat/queries";
import { formatDateTimeInZone } from "@/utils/format";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

interface MessagesPageProps {
  searchParams: Promise<{ notice?: string }>;
}

const NOTICE_TEXT: Record<string, string> = {
  "book-first": "You can message a teacher once you have a lesson booked with them.",
  failed: "We could not open that conversation. Try again.",
  invalid: "That request was not valid.",
};

export default async function MessagesPage({
  searchParams,
}: MessagesPageProps): Promise<React.ReactElement> {
  await connection();
  const user = await requireUser(ROUTES.messages);
  const { notice } = await searchParams;
  const conversations = await listConversations(
    user.id,
    user.role === "teacher" ? "teacher" : "learner",
  );

  return (
    <main id="main" className="mx-auto grid max-w-3xl gap-8 px-4 pb-20 pt-10">
      <header className="grid gap-2">
        <h1 className="text-3xl font-bold">Messages</h1>
        <p className="text-muted">Chat with teachers and learners you have lessons with.</p>
      </header>

      {notice && NOTICE_TEXT[notice] ? (
        <p role="status" className="rounded-xl bg-surface-2 p-4 text-sm">
          {NOTICE_TEXT[notice]}
        </p>
      ) : null}

      {conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet."
          description="Open a chat from a teacher's profile once you have a lesson booked with them."
          action={{ label: "Find a teacher", href: ROUTES.teachers }}
        />
      ) : (
        <ul className="grid gap-3">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={ROUTES.conversation(conversation.id)}
                className="flex items-center justify-between gap-3 rounded-[18px] border border-line bg-surface p-5 transition-colors hover:bg-surface-2"
              >
                <span className="font-semibold">{conversation.counterpartName}</span>
                <span className="text-sm text-muted">
                  {formatDateTimeInZone(conversation.lastActivityAt, user.timezone)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
