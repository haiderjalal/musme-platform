// Shared Tailwind class strings, so every Practice Room control looks and focuses the same way.

export const PANEL_CLASS =
  "flex flex-col gap-5 rounded-2xl border border-white/10 bg-room-surface p-5";
export const PANEL_TITLE_CLASS = "text-lg font-semibold text-room-ink";
export const LABEL_CLASS = "text-sm font-medium text-room-muted";
export const HINT_CLASS = "text-sm text-room-muted";
export const VALUE_CLASS = "text-sm font-medium tabular-nums text-room-ink";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-room-accent";

// Toggle buttons use aria-pressed, so the pressed look comes from the attribute, not a separate class.
export const TOGGLE_BUTTON_CLASS = [
  "inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 px-5",
  "text-sm font-medium text-room-ink transition-colors duration-200 hover:border-white/35",
  "aria-pressed:border-room-accent aria-pressed:bg-room-accent aria-pressed:text-room-bg",
  FOCUS_RING,
  "motion-reduce:transition-none",
].join(" ");

export const FIELD_CLASS = `min-h-11 w-full rounded-lg border border-white/15 bg-room-bg px-3 text-room-ink ${FOCUS_RING}`;

export const RANGE_CLASS = `min-h-11 w-full accent-room-accent ${FOCUS_RING}`;

export const CHECKBOX_CLASS = `size-5 accent-room-accent ${FOCUS_RING}`;
