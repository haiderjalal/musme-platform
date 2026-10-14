import type { ReactElement } from "react";

import type { BeatEvent } from "../engine/scheduler";
import { groupBeatsByVibhag, type BeatRole, type TaalDefinition } from "../engine/taals";

const MARKER_BASE =
  "block rounded-full border transition-colors duration-100 motion-reduce:transition-none data-[active=true]:border-room-accent data-[active=true]:bg-room-accent";

// Each role has its own shape or fill, so the marks stay distinct without relying on colour alone.
const MARKER_CLASS: Readonly<Record<BeatRole, string>> = {
  sam: `${MARKER_BASE} size-4 border-room-ink/70`,
  tali: `${MARKER_BASE} size-3 border-room-ink/60 bg-room-ink/60`,
  khali: `${MARKER_BASE} size-3 border-dashed border-room-muted`,
  matra: `${MARKER_BASE} size-3 border-white/25`,
};

const LEGEND_ITEMS: readonly { readonly role: BeatRole; readonly label: string }[] = [
  { role: "sam", label: "Sam, first beat" },
  { role: "tali", label: "Tali, clap" },
  { role: "khali", label: "Khali, wave" },
  { role: "matra", label: "Matra, other beats" },
];

interface TaalBeatBoardProps {
  readonly taal: TaalDefinition;
}

/** Decorative beat markers. Screen readers get the taal name and legend instead of 16 unlabelled dots. */
export function TaalBeatBoard({ taal }: TaalBeatBoardProps): ReactElement {
  const groups = groupBeatsByVibhag(taal);
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-2">
      {groups.map((group, groupIndex) => (
        <div
          key={groupIndex}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-2 py-2"
        >
          {group.map((beat) => (
            <span
              key={beat.index}
              data-beat-index={beat.index}
              className={MARKER_CLASS[beat.role]}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function TaalLegend(): ReactElement {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-room-muted">
      {LEGEND_ITEMS.map((item) => (
        <li key={item.role} className="flex items-center gap-2">
          <span aria-hidden="true" className={`${MARKER_CLASS[item.role]} size-2.5`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Lights the marker for the sounding beat. Writes the DOM directly, so the taal never causes a
 * React render per beat.
 */
export function paintTaalBeat(board: HTMLElement | null, beat: BeatEvent): void {
  if (!board) return;
  board.querySelectorAll<HTMLElement>("[data-beat-index]").forEach((marker) => {
    marker.dataset.active = String(marker.dataset.beatIndex === String(beat.beatIndex));
  });
  setCycleLabel(board, `Cycle ${beat.cycleIndex + 1}`);
}

export function clearTaalBoard(board: HTMLElement | null): void {
  if (!board) return;
  board.querySelectorAll<HTMLElement>("[data-beat-index]").forEach((marker) => {
    marker.dataset.active = "false";
  });
  setCycleLabel(board, "Ready");
}

function setCycleLabel(board: HTMLElement, text: string): void {
  const label = board.querySelector<HTMLElement>("[data-cycle-label]");
  if (label) label.textContent = text;
}
