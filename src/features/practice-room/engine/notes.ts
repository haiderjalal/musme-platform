import { clamp, wrapPitchClass } from "./numeric";

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export const SWARA_NAMES = [
  "Sa",
  "Re♭",
  "Re",
  "Ga♭",
  "Ga",
  "Ma",
  "Ma♯",
  "Pa",
  "Dha♭",
  "Dha",
  "Ni♭",
  "Ni",
] as const;
export type SwaraName = (typeof SWARA_NAMES)[number];

export const REFERENCE_PITCH_MIN_HZ = 415;
export const REFERENCE_PITCH_MAX_HZ = 466;
export const DEFAULT_REFERENCE_PITCH_HZ = 440;
export const DEFAULT_SA_PITCH_CLASS = 0;

const A4_MIDI = 69;
// Equal temperament anchor for Sa. Sa is offered from C3 upward, the range the drone is built for.
const SA_BASE_MIDI = 48;
const EQUAL_TEMPERAMENT_A4_HZ = 440;

export interface NoteReading {
  /** Fractional MIDI number, so the caller can see how far off the note is. */
  readonly midi: number;
  readonly nearestMidi: number;
  readonly noteName: string;
  readonly pitchClass: number;
  readonly centsDeviation: number;
}

export function frequencyToNote(frequency: number, referencePitchHz: number): NoteReading | null {
  if (!isPositiveFinite(frequency) || !isPositiveFinite(referencePitchHz)) return null;

  const midi = A4_MIDI + 12 * Math.log2(frequency / referencePitchHz);
  const nearestMidi = Math.round(midi);
  // The `|| 0` turns a rounded -0 into 0 so the readout never shows a signed zero.
  const centsDeviation = Math.round((midi - nearestMidi) * 100) || 0;
  const pitchClass = wrapPitchClass(nearestMidi);
  const octave = Math.floor(nearestMidi / 12) - 1;

  return {
    midi,
    nearestMidi,
    noteName: `${pitchClassName(pitchClass)}${octave}`,
    pitchClass,
    centsDeviation,
  };
}

export function pitchClassName(pitchClass: number): string {
  return nameAt(NOTE_NAMES, wrapPitchClass(pitchClass));
}

/** Swara of a note, relative to the chosen Sa. Both arguments are pitch classes, C = 0. */
export function getSwaraName(pitchClass: number, saPitchClass: number): SwaraName {
  return nameAt(SWARA_NAMES, wrapPitchClass(pitchClass - saPitchClass));
}

/** Frequency of Sa in the octave starting at C3, equal temperament, A4 = 440 Hz. */
export function saFrequencyHz(pitchClass: number): number {
  const midi = SA_BASE_MIDI + wrapPitchClass(pitchClass);
  return EQUAL_TEMPERAMENT_A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

export function clampReferencePitch(hz: number): number {
  return clamp(hz, REFERENCE_PITCH_MIN_HZ, REFERENCE_PITCH_MAX_HZ);
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function nameAt<T extends string>(names: readonly T[], index: number): T {
  const name = names[index];
  if (name === undefined) throw new RangeError(`No name at index ${index}.`);
  return name;
}
