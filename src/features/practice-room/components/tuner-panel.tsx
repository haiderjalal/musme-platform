import { useId, type ReactElement } from "react";

import { MIC_ERROR_MESSAGES } from "../engine/messages";
import { REFERENCE_PITCH_MAX_HZ, REFERENCE_PITCH_MIN_HZ } from "../engine/notes";
import type { UseTunerResult } from "../hooks/use-tuner";
import { formatTuningSummary, getNeedleAngleDegrees } from "../engine/tuning";

import {
  HINT_CLASS,
  LABEL_CLASS,
  PANEL_CLASS,
  PANEL_TITLE_CLASS,
  RANGE_CLASS,
  TOGGLE_BUTTON_CLASS,
  VALUE_CLASS,
} from "./room-classes";
import { TunerMeter } from "./tuner-meter";

interface TunerPanelProps {
  readonly tuner: UseTunerResult;
}

const IDLE_SUMMARY = "Turn on the tuner, then play or sing a note.";

export function TunerPanel({ tuner }: TunerPanelProps): ReactElement {
  const id = useId();
  const display = tuner.reading.display;
  const isActive = tuner.isListening || tuner.isOpening;

  let summary = IDLE_SUMMARY;
  if (tuner.isOpening) summary = "Opening the microphone...";
  else if (display) summary = formatTuningSummary(display);
  else if (tuner.isListening) summary = "Listening...";

  const noteClass = display?.status === "In tune" ? "text-room-ok" : "text-room-ink";

  return (
    <section aria-labelledby={`${id}-title`} className={PANEL_CLASS}>
      <h3 id={`${id}-title`} className={PANEL_TITLE_CLASS}>
        Tuner
      </h3>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${id}-a4`} className={LABEL_CLASS}>
            A4 reference
          </label>
          <output htmlFor={`${id}-a4`} className={VALUE_CLASS}>
            {tuner.referencePitchHz} Hz
          </output>
        </div>
        <input
          id={`${id}-a4`}
          type="range"
          min={REFERENCE_PITCH_MIN_HZ}
          max={REFERENCE_PITCH_MAX_HZ}
          step={1}
          value={tuner.referencePitchHz}
          onChange={(event) => tuner.setReferencePitch(Number(event.target.value))}
          className={RANGE_CLASS}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-pressed={isActive}
          onClick={tuner.toggle}
          className={TOGGLE_BUTTON_CLASS}
        >
          Tuner
        </button>
        <span className={VALUE_CLASS}>{tuner.isListening ? "Listening" : "Off"}</span>
      </div>

      <div className="flex flex-col items-center gap-4">
        <p className={`text-4xl font-semibold tabular-nums ${noteClass}`}>
          {display?.noteName ?? "-"}
        </p>
        <div aria-hidden="true" className="relative h-16 w-32 overflow-hidden">
          <div
            className="absolute bottom-0 left-1/2 h-full w-0.5 origin-bottom rounded-full bg-room-accent transition-transform duration-150 motion-reduce:transition-none"
            style={{
              transform: `translateX(-50%) rotate(${getNeedleAngleDegrees(display?.centsDeviation ?? 0)}deg)`,
            }}
          />
        </div>
        <TunerMeter level={tuner.reading.level} />
        <p className="text-center text-sm text-room-muted">{summary}</p>
      </div>

      {/* Only the status word is announced, and React rewrites this text only when that word changes. */}
      <p aria-live="polite" className="sr-only">
        {display?.status ?? ""}
      </p>

      {tuner.error ? (
        <p role="alert" className="text-sm text-room-accent">
          {MIC_ERROR_MESSAGES[tuner.error]}
        </p>
      ) : null}

      <p className={HINT_CLASS}>
        Headphones are recommended. Echo cancellation, noise suppression and auto gain are off so
        the music is not distorted.
      </p>
    </section>
  );
}
