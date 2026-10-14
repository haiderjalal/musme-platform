"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface RealtimeRefreshProps {
  conversationId: string;
}

/**
 * Re-renders the thread on the server when a new message arrives. Rendering stays on the server,
 * so the browser never holds message data it could mishandle. Row level security filters the events.
 */
export function RealtimeRefresh({ conversationId }: RealtimeRefreshProps): null {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`conversation-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  return null;
}
