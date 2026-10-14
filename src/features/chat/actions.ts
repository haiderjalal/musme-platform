"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { MAX_MESSAGE_LENGTH } from "@/constants/booking";
import { ROUTES } from "@/constants/routes";
import { requireUser } from "@/features/auth/session";
import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const openConversationSchema = z.object({ teacherId: z.uuid() });

const sendMessageSchema = z.object({
  conversationId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Write a message before sending.")
    .max(MAX_MESSAGE_LENGTH, `Keep messages under ${MAX_MESSAGE_LENGTH} characters.`),
});

// Postgres: insufficient_privilege. Row level security refused the write, because the pair has no booking.
const RLS_DENIED = "42501";
// Postgres: unique_violation. The conversation already exists.
const UNIQUE_VIOLATION = "23505";

/**
 * Opens a chat with a teacher. The insert is made as the learner, and row level security allows it
 * only when a booking exists between the two. Chat therefore stays tied to real lessons.
 */
export async function openConversationFormAction(formData: FormData): Promise<void> {
  const user = await requireUser(ROUTES.messages);
  const parsed = openConversationSchema.safeParse({ teacherId: formData.get("teacherId") });
  if (!parsed.success) {
    redirect(`${ROUTES.messages}?notice=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const created = await supabase
    .from("conversations")
    .insert({ learner_id: user.id, teacher_id: parsed.data.teacherId })
    .select("id")
    .single();

  if (created.data) {
    redirect(ROUTES.conversation(created.data.id));
  }

  if (created.error?.code === UNIQUE_VIOLATION) {
    const existing = await supabase
      .from("conversations")
      .select("id")
      .eq("learner_id", user.id)
      .eq("teacher_id", parsed.data.teacherId)
      .maybeSingle();
    if (existing.data) redirect(ROUTES.conversation(existing.data.id));
  }

  if (created.error?.code === RLS_DENIED) {
    redirect(`${ROUTES.messages}?notice=book-first`);
  }

  logEvent("error", "chat.open_failed", { code: created.error?.code ?? null });
  redirect(`${ROUTES.messages}?notice=failed`);
}

/** Sends a message as the signed-in user. The database checks the sender and the booking. */
export async function sendMessageFormAction(formData: FormData): Promise<void> {
  const user = await requireUser(ROUTES.messages);
  const parsed = sendMessageSchema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    redirect(`${ROUTES.messages}?notice=message-invalid`);
  }

  const { conversationId, body } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, body });

  if (error) {
    logEvent("warn", "chat.send_failed", { code: error.code ?? null });
    redirect(
      `${ROUTES.conversation(conversationId)}?notice=${error.code === RLS_DENIED ? "not-allowed" : "send-failed"}`,
    );
  }

  redirect(ROUTES.conversation(conversationId));
}
