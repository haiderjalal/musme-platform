import { describe, expect, it } from "vitest";

import { resolveRoomShortcut, type ShortcutKeyEvent } from "./shortcuts";

function keyEvent(overrides: Partial<ShortcutKeyEvent>): ShortcutKeyEvent {
  return { code: "", key: "", altKey: false, ctrlKey: false, metaKey: false, ...overrides };
}

describe("resolveRoomShortcut", () => {
  it("toggles the taal on Space", () => {
    expect(resolveRoomShortcut(keyEvent({ code: "Space", key: " " }))).toEqual({
      type: "toggle-taal",
    });
  });

  it.each([
    ["ArrowRight", 1],
    ["ArrowLeft", -1],
    ["ArrowUp", 5],
    ["ArrowDown", -5],
  ])("nudges tempo for %s by %i", (key, delta) => {
    expect(resolveRoomShortcut(keyEvent({ key }))).toEqual({ type: "nudge-tempo", delta });
  });

  it("ignores keys the room does not handle", () => {
    expect(resolveRoomShortcut(keyEvent({ key: "a", code: "KeyA" }))).toBeNull();
    expect(resolveRoomShortcut(keyEvent({ key: "constructor" }))).toBeNull();
  });

  it("leaves browser shortcuts alone when a modifier is held", () => {
    expect(resolveRoomShortcut(keyEvent({ key: "ArrowLeft", altKey: true }))).toBeNull();
    expect(resolveRoomShortcut(keyEvent({ code: "Space", key: " ", ctrlKey: true }))).toBeNull();
    expect(resolveRoomShortcut(keyEvent({ key: "ArrowUp", metaKey: true }))).toBeNull();
  });
});
