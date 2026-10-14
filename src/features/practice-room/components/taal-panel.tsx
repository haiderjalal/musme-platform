import { useId, type ReactElement, type RefObject } from "react";

import { isTaalKey, TAAL_KEYS, TAALS } from "../engine/taals";
import { getLayaLabel, TEMPO_MAX_BPM, TEMPO_MIN_BPM } from "../engine/tempo";
import type { UseTaalPlayerResult } from "../hooks/use-taal-player";

import {
  CHECKBOX_CLASS,
  FIELD_CLASS,
  HINT_CLASS,
  LABEL_CLASS,
  PANEL_CLASS,
  PANEL_TITLE_CLASS,
  RANGE_CLASS,
  TOGGLE_BUTTON_CLASS,
  VALUE_CLASS,
} from "./room-classes";
import { TaalBeatBoard, TaalLegend } from "./taal-beat-board";

interface TaalPanelProps {
  readonly taal: UseTaalPlayerResult;
  readonly boardRef: RefObject<HTMLDivElement | null>;
}

export function TaalPanel({ taal, boardRef }: TaalPanelProps): ReactElement {
  const id = useId();
  const definition = TAALS[taal.taalKey];

  return (
    <section aria-labelledby={`${id}-title`} className={PANEL_CLASS}>
      <h3 id={`${id}-title`} className={PANEL_TITLE_CLASS}>
        Taal
      </h3>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-taal`} className={LABEL_CLASS}>
          Taal cycle
        </label>
        <select
          id={`${id}-taal`}
          className={FIELD_CLASS}
          value={taal.taalKey}
          onChange={(event) => {
            const value = event.target.value;
            if (isTaalKey(value)) taal.setTaal(value);
          }}
        >
          {TAAL_KEYS.map((key) => (
            <option key={key} value={key}>
              {TAALS[key].name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${id}-tempo`} className={LABEL_CLASS}>
            Tempo
          </label>
          <output htmlFor={`${id}-tempo`} className={VALUE_CLASS}>
            {taal.bpm} BPM, {getLayaLabel(taal.bpm)}
          </output>
        </div>
        <input
          id={`${id}-tempo`}
          type="range"
          min={TEMPO_MIN_BPM}
          max={TEMPO_MAX_BPM}
          step={1}
          value={taal.bpm}
          onChange={(event) => taal.setTempo(Number(event.target.value))}
          className={RANGE_CLASS}
        />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-white/10 p-3">
        <legend className={LABEL_CLASS}>Speed trainer</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm text-room-ink">
          <input
            type="checkbox"
            className={CHECKBOX_CLASS}
            checked={taal.speedTrainer.enabled}
            onChange={(event) => taal.setSpeedTrainerEnabled(event.target.checked)}
          />
          Raise tempo by 4 BPM every 4 cycles
        </label>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`${id}-target`} className={LABEL_CLASS}>
              Target tempo
            </label>
            <output htmlFor={`${id}-target`} className={VALUE_CLASS}>
              {taal.speedTrainer.target} BPM
            </output>
          </div>
          <input
            id={`${id}-target`}
            type="range"
            min={TEMPO_MIN_BPM}
            max={TEMPO_MAX_BPM}
            step={1}
            value={taal.speedTrainer.target}
            onChange={(event) => taal.setSpeedTrainerTarget(Number(event.target.value))}
            className={RANGE_CLASS}
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-volume`} className={LABEL_CLASS}>
          Taal volume
        </label>
        <input
          id={`${id}-volume`}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={taal.volume}
          onChange={(event) => taal.setVolume(Number(event.target.value))}
          className={RANGE_CLASS}
        />
      </div>

      <div ref={boardRef} className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-pressed={taal.isPlaying}
            onClick={taal.toggle}
            className={TOGGLE_BUTTON_CLASS}
          >
            Play taal
          </button>
          <span data-cycle-label className={VALUE_CLASS}>
            Ready
          </span>
        </div>
        <TaalBeatBoard taal={definition} />
        <TaalLegend />
      </div>

      {taal.error ? (
        <p role="alert" className="text-sm text-room-accent">
          {taal.error}
        </p>
      ) : null}

      <p className={HINT_CLASS}>
        Space starts or stops the taal. Left and right arrows change tempo by 1 BPM, up and down by
        5.
      </p>
    </section>
  );
}
