import { useId, type ReactElement } from "react";

import { NOTE_NAMES, saFrequencyHz } from "../engine/notes";
import type { UseTanpuraDroneResult } from "../hooks/use-tanpura-drone";

import {
  FIELD_CLASS,
  HINT_CLASS,
  LABEL_CLASS,
  PANEL_CLASS,
  PANEL_TITLE_CLASS,
  RANGE_CLASS,
  TOGGLE_BUTTON_CLASS,
  VALUE_CLASS,
} from "./room-classes";

interface DronePanelProps {
  readonly drone: UseTanpuraDroneResult;
  readonly saPitchClass: number;
  readonly onSaChange: (pitchClass: number) => void;
}

export function DronePanel({ drone, saPitchClass, onSaChange }: DronePanelProps): ReactElement {
  const id = useId();
  const saName = NOTE_NAMES[saPitchClass] ?? NOTE_NAMES[0];

  return (
    <section aria-labelledby={`${id}-title`} className={PANEL_CLASS}>
      <h3 id={`${id}-title`} className={PANEL_TITLE_CLASS}>
        Tanpura drone
      </h3>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-sa`} className={LABEL_CLASS}>
          Sa (tonic)
        </label>
        <select
          id={`${id}-sa`}
          className={FIELD_CLASS}
          value={saPitchClass}
          onChange={(event) => onSaChange(Number(event.target.value))}
        >
          {NOTE_NAMES.map((name, pitchClass) => (
            <option key={name} value={pitchClass}>
              {name}
            </option>
          ))}
        </select>
        <p className={HINT_CLASS}>
          Sa on {saName}, {saFrequencyHz(saPitchClass).toFixed(1)} Hz
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-pressed={drone.isOn}
          onClick={drone.toggle}
          className={TOGGLE_BUTTON_CLASS}
        >
          Tanpura drone
        </button>
        <span className={VALUE_CLASS}>{drone.isOn ? "On" : "Off"}</span>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-volume`} className={LABEL_CLASS}>
          Drone volume
        </label>
        <input
          id={`${id}-volume`}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={drone.volume}
          onChange={(event) => drone.setVolume(Number(event.target.value))}
          className={RANGE_CLASS}
        />
      </div>

      {drone.error ? (
        <p role="alert" className="text-sm text-room-accent">
          {drone.error}
        </p>
      ) : null}
    </section>
  );
}
