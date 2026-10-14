import { clamp } from "./numeric";
import { frequencyToNote, getSwaraName, pitchClassName, type SwaraName } from "./notes";

export type TuningStatus = "In tune" | "Flat" | "Sharp";

// Readings within this many cents read as in tune. Matches the prototype; confirm with a teacher.
export const IN_TUNE_TOLERANCE_CENTS = 5;

// 40 ms gives 25 readings a second. That is smooth for a needle without keeping React busy.
export const TUNER_FRAME_INTERVAL_MS = 40;

const NEEDLE_LIMIT_CENTS = 50;
const NEEDLE_DEGREES_PER_CENT = 1.2;

export const METER_BAR_SHAPE: readonly number[] = [
  0.55, 0.7, 0.85, 1, 0.9, 0.75, 1, 0.8, 0.6, 0.9, 0.7, 0.5,
];
const METER_GAIN = 10;
const METER_MIN_SCALE = 0.08;

export interface TunerFrame {
  readonly level: number;
  readonly frequency: number | null;
}

export interface TuningDisplay {
  readonly noteName: string;
  readonly centsDeviation: number;
  readonly status: TuningStatus;
  readonly swara: SwaraName;
  readonly saName: string;
}

export interface TunerReading {
  readonly level: number;
  readonly display: TuningDisplay | null;
}

export const SILENT_TUNER_READING: TunerReading = { level: 0, display: null };

export function getTuningStatus(centsDeviation: number): TuningStatus {
  if (Math.abs(centsDeviation) <= IN_TUNE_TOLERANCE_CENTS) return "In tune";
  return centsDeviation < 0 ? "Flat" : "Sharp";
}

export function describeTuning(
  frequency: number,
  referencePitchHz: number,
  saPitchClass: number,
): TuningDisplay | null {
  const reading = frequencyToNote(frequency, referencePitchHz);
  if (!reading) return null;
  return {
    noteName: reading.noteName,
    centsDeviation: reading.centsDeviation,
    status: getTuningStatus(reading.centsDeviation),
    swara: getSwaraName(reading.pitchClass, saPitchClass),
    saName: pitchClassName(saPitchClass),
  };
}

/** Folds one tuner frame into the reading on screen. Silence keeps the last note, so the readout does not flicker. */
export function applyTunerFrame(
  previous: TunerReading,
  frame: TunerFrame,
  referencePitchHz: number,
  saPitchClass: number,
): TunerReading {
  const display =
    frame.frequency === null
      ? previous.display
      : describeTuning(frame.frequency, referencePitchHz, saPitchClass);
  return { level: frame.level, display };
}

export function formatTuningSummary(display: TuningDisplay): string {
  const sign = display.centsDeviation > 0 ? "+" : "";
  return `${display.status}, ${sign}${display.centsDeviation} cents. Swara ${display.swara}, with Sa on ${display.saName}.`;
}

export function getNeedleAngleDegrees(centsDeviation: number): number {
  return clamp(centsDeviation, -NEEDLE_LIMIT_CENTS, NEEDLE_LIMIT_CENTS) * NEEDLE_DEGREES_PER_CENT;
}

export function getMeterScale(level: number, barShape: number): number {
  return clamp(level * METER_GAIN * barShape, METER_MIN_SCALE, 1);
}

export function isTunerFrameDue(lastReadMs: number, nowMs: number): boolean {
  return nowMs - lastReadMs >= TUNER_FRAME_INTERVAL_MS;
}
