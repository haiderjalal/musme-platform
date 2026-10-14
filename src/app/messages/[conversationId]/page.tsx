import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { SubmitButton } from "@/components/ui/submit-button";
import { ROUTES } from "@/constants/routes";
import { MAX_MESSAGE_LENGTH } from "@/constants/booking";
import { requireUser } from "@/features/auth/session";
import { RealtimeRefresh } from "@/features/chat/components/realtime-refresh";
import { getConversation, listMessages } from "@/features/chat/queries";
import { sendMessageFormAction } from "@/features/chat/actions";
import { formatDateTimeInZone } from "@/utils/format";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ notice?: string }>;
}

const NOTICE_TEXT: Record<string, string> = {
  "not-allowed": "You can only message people you have a lesson booked with.",
  "send-failed": "Your message could not be sent. Try again.",
  "message-invalid": "Write a message before sending.",
};

export default async function ConversationPage({
  params,
  searchParams,
}: ConversationPageProps): Promise<React.ReactElement> {
  await connection();
  const { conversationId } = await params;
  const parsedId = z.uuid().safeParse(conversationId);
  if (!parsedId.success) notFound();

  const user = await requireUser(ROUTES.conversation(parsedId.data));
  const role = user.role === "teacher" ? "teacher" : "learner";
  const conversation = await getConversation(parsedId.data, role);
  if (!conversation) notFound();

  const [messages, { notice }] = await Promise.all([listMessages(parsedId.data), searchParams]);

  return (
    <main id="main" className="mx-auto grid max-w-3xl gap-6 px-4 pb-20 pt-10">
      <RealtimeRefresh conversationId={parsedId.data} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm text-muted">Conversation with</p>
          <h1 className="text-2xl font-bold">{conversation.counterpartName}</h1>
        </div>
        <Link href={ROUTES.messages} className="text-sm underline underline-offset-4">
          All messages
        </Link>
      </header>

      {notice && NOTICE_TEXT[notice] ? (
        <p role="alert" className="rounded-xl bg-surface-2 p-3 text-sm font-medium text-danger">
          {NOTICE_TEXT[notice]}
        </p>
      ) : null}

      <section
        aria-label="Messages"
        className="grid max-h-[60vh] gap-3 overflow-y-auto rounded-[18px] border border-line bg-surface p-4"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted">No messages yet. Say hello.</p>
        ) : (
          <ol className="grid gap-3">
            {messages.map((message) => {
              const mine = message.senderId === user.id;
              return (
                <li key={message.id} className={mine ? "justify-self-end" : "justify-self-start"}>
                  <article
                    className={
                      mine
                        ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-ink"
                        : "max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-2"
                    }
                  >
                    {/* Plain text only. Text nodes escape markup, so messages cannot inject HTML. */}
                    <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                    <p className="mt-1 text-xs opacity-70">
                      <time dateTime={message.createdAt.toISOString()}>
                        {formatDateTimeInZone(message.createdAt, user.timezone)}
                      </time>
                    </p>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <form action={sendMessageFormAction} className="grid gap-3">
        <input type="hidden" name="conversationId" value={parsedId.data} />
        <label htmlFor="body" className="text-sm font-semibold">
          Message
        </label>
        <textarea
          id="body"
          name="body"
          required
          maxLength={MAX_MESSAGE_LENGTH}
          rows={3}
          placeholder="Write a message"
          className="rounded-xl border border-line bg-surface p-3 text-ink placeholder:text-muted"
        />
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Sending…" className="min-h-11">
            Send
          </SubmitButton>
        </div>
      </form>
    </main>
  );
}
