"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { DEFAULT_SA_PITCH_CLASS } from "../engine/notes";
import type { BeatEvent } from "../engine/scheduler";
import { useAudioOutput } from "../hooks/use-audio-output";
import { useRoomShortcuts } from "../hooks/use-room-shortcuts";
import { useTanpuraDrone } from "../hooks/use-tanpura-drone";
import { useTaalPlayer } from "../hooks/use-taal-player";
import { useTuner } from "../hooks/use-tuner";

import { DronePanel } from "./drone-panel";
import { clearTaalBoard, paintTaalBeat } from "./taal-beat-board";
import { TaalPanel } from "./taal-panel";
import { TunerPanel } from "./tuner-panel";

/**
 * Live-class toolkit: taal player, tanpura drone and tuner. This component wires the engines to the
 * panels and owns the one shared AudioContext.
 */
export function PracticeRoom(): ReactElement {
  const output = useAudioOutput();
  const boardRef = useRef<HTMLDivElement>(null);
  const [saPitchClass, setSaPitchClass] = useState(DEFAULT_SA_PITCH_CLASS);

  const paintBeat = useCallback(
    (beat: BeatEvent): void => paintTaalBeat(boardRef.current, beat),
    [],
  );
  const taal = useTaalPlayer(output, { onBeat: paintBeat });
  const drone = useTanpuraDrone(output, saPitchClass);
  const tuner = useTuner(output, saPitchClass);

  useRoomShortcuts({ onToggleTaal: taal.toggle, onNudgeTempo: taal.nudgeTempo });

  useEffect(() => {
    if (!taal.isPlaying) clearTaalBoard(boardRef.current);
  }, [taal.isPlaying]);

  return (
    <section
      aria-labelledby="practice-room-title"
      className="flex flex-col gap-6 rounded-3xl bg-room-bg p-4 text-room-ink sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <h2 id="practice-room-title" className="text-2xl font-semibold">
          Practice Room
        </h2>
        <p className="text-sm text-room-muted">Use headphones for the cleanest sound.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <TaalPanel taal={taal} boardRef={boardRef} />
        <DronePanel drone={drone} saPitchClass={saPitchClass} onSaChange={setSaPitchClass} />
        <TunerPanel tuner={tuner} />
      </div>
    </section>
  );
}
