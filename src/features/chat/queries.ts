import "server-only";

import { z } from "zod";

import { logEvent } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ConversationItem {
  id: string;
  counterpartName: string;
  lastActivityAt: Date;
}

export interface MessageItem {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date;
}

const conversationRow = z.object({
  id: z.uuid(),
  learner_id: z.uuid(),
  teacher_id: z.uuid(),
  created_at: z.string(),
  learner: z.object({ display_name: z.string().nullable() }).nullable(),
  teacher: z.object({ display_name: z.string().nullable() }).nullable(),
});

const messageRow = z.object({
  id: z.uuid(),
  sender_id: z.uuid(),
  body: z.string(),
  created_at: z.string(),
});

/** Conversations the user is part of, newest first. The counterpart is the other person. */
export async function listConversations(
  userId: string,
  role: "learner" | "teacher",
): Promise<ConversationItem[]> {
  const supabase = await createSupabaseServerClient();
  const column = role === "teacher" ? "teacher_id" : "learner_id";
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `id, learner_id, teacher_id, created_at,
       learner:profiles!conversations_learner_id_fkey(display_name),
       teacher:profiles!conversations_teacher_id_fkey(display_name)`,
    )
    .eq(column, userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    logEvent("error", "chat.list_failed", { code: error.code ?? null });
    throw new Error("Could not load your messages.");
  }

  return z
    .array(conversationRow)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      counterpartName:
        (role === "teacher" ? row.learner?.display_name : row.teacher?.display_name) ??
        "MUSME member",
      lastActivityAt: new Date(row.created_at),
    }));
}

/** One conversation's header, or null when the user is not a participant. */
export async function getConversation(
  conversationId: string,
  role: "learner" | "teacher",
): Promise<ConversationItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `id, learner_id, teacher_id, created_at,
       learner:profiles!conversations_learner_id_fkey(display_name),
       teacher:profiles!conversations_teacher_id_fkey(display_name)`,
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (error) {
    logEvent("error", "chat.detail_failed", { code: error.code ?? null });
    throw new Error("Could not load this conversation.");
  }
  if (!data) return null;
  const row = conversationRow.parse(data);
  return {
    id: row.id,
    counterpartName:
      (role === "teacher" ? row.learner?.display_name : row.teacher?.display_name) ??
      "MUSME member",
    lastActivityAt: new Date(row.created_at),
  };
}

/** The most recent messages in a conversation, oldest first for reading. */
export async function listMessages(conversationId: string, limit = 100): Promise<MessageItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logEvent("error", "chat.messages_failed", { code: error.code ?? null });
    throw new Error("Could not load messages.");
  }
  return z
    .array(messageRow)
    .parse(data ?? [])
    .reverse()
    .map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      body: row.body,
      createdAt: new Date(row.created_at),
    }));
}
