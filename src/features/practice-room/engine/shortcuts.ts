export type RoomShortcut =
  { readonly type: "toggle-taal" } | { readonly type: "nudge-tempo"; readonly delta: number };

export interface ShortcutKeyEvent {
  readonly code: string;
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

const TEMPO_STEPS: ReadonlyMap<string, number> = new Map([
  ["ArrowRight", 1],
  ["ArrowLeft", -1],
  ["ArrowUp", 5],
  ["ArrowDown", -5],
]);

/** Maps a key press to a Practice Room action. Returns null for keys the room does not handle. */
export function resolveRoomShortcut(event: ShortcutKeyEvent): RoomShortcut | null {
  // Modified keys belong to the browser (Alt+Left goes back), so the room leaves them alone.
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.code === "Space") return { type: "toggle-taal" };

  const delta = TEMPO_STEPS.get(event.key);
  return delta === undefined ? null : { type: "nudge-tempo", delta };
}
