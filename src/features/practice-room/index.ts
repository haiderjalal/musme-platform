export { PracticeRoom } from "./components/practice-room";

export { TAAL_KEYS, TAALS, getTaal, isTaalKey, validateTaal } from "./engine/taals";
export type { BeatRole, BolName, TaalDefinition, TaalKey, TaalValidation } from "./engine/taals";

export { clampTempo, getLayaLabel, TEMPO_MAX_BPM, TEMPO_MIN_BPM } from "./engine/tempo";
export type { LayaLabel } from "./engine/tempo";

export {
  NOTE_NAMES,
  SWARA_NAMES,
  clampReferencePitch,
  frequencyToNote,
  getSwaraName,
  pitchClassName,
  saFrequencyHz,
} from "./engine/notes";
export type { NoteReading, SwaraName } from "./engine/notes";
