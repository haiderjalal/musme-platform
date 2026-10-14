"use client";

import { useEffect, useRef } from "react";

import { resolveRoomShortcut } from "../engine/shortcuts";

export interface RoomShortcutHandlers {
  readonly onToggleTaal: () => void;
  readonly onNudgeTempo: (delta: number) => void;
}

// Typing controls keep their own keys. Space on a focused button still clicks it natively.
const INTERACTIVE_SELECTOR =
  "input, select, textarea, button, [contenteditable]:not([contenteditable='false'])";

/** Keyboard control for the Practice Room. The listener is registered once and reads the latest handlers. */
export function useRoomShortcuts(handlers: RoomShortcutHandlers): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isInteractiveTarget(event.target)) return;

      const shortcut = resolveRoomShortcut({
        code: event.code,
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      });
      if (!shortcut) return;

      event.preventDefault();
      if (shortcut.type === "toggle-taal") {
        handlersRef.current.onToggleTaal();
      } else {
        handlersRef.current.onNudgeTempo(shortcut.delta);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}
