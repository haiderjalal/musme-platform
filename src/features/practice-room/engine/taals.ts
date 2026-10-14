export type BolName = "dha" | "dhin" | "ge" | "na";

export const TAAL_KEYS = ["teentaal", "keherwa", "dadra", "jhaptaal"] as const;
export type TaalKey = (typeof TAAL_KEYS)[number];

export const DEFAULT_TAAL_KEY: TaalKey = "teentaal";

export interface TaalDefinition {
  readonly key: TaalKey;
  readonly name: string;
  /** Matra count for one full cycle. */
  readonly beats: number;
  /** Beats per vibhag (group). Must sum to `beats`. */
  readonly vibhags: readonly number[];
  /** Clap beats, zero-based. */
  readonly tali: readonly number[];
  /** Wave beats, zero-based. */
  readonly khali: readonly number[];
  /** One bol per matra. Length must equal `beats`. */
  readonly bols: readonly BolName[];
}

// Bol patterns are illustrative. A tabla teacher must validate every taal before launch.
export const TAALS: Readonly<Record<TaalKey, TaalDefinition>> = {
  teentaal: {
    key: "teentaal",
    name: "Teentaal (16)",
    beats: 16,
    vibhags: [4, 4, 4, 4],
    tali: [0, 4, 12],
    khali: [8],
    bols: [
      "dha",
      "dhin",
      "dhin",
      "dha",
      "dha",
      "dhin",
      "dhin",
      "dha",
      "dha",
      "na",
      "na",
      "na",
      "na",
      "dhin",
      "dhin",
      "dha",
    ],
  },
  keherwa: {
    key: "keherwa",
    name: "Keherwa (8)",
    beats: 8,
    vibhags: [4, 4],
    tali: [0],
    khali: [4],
    bols: ["dha", "ge", "na", "na", "na", "ge", "dhin", "na"],
  },
  dadra: {
    key: "dadra",
    name: "Dadra (6)",
    beats: 6,
    vibhags: [3, 3],
    tali: [0],
    khali: [3],
    bols: ["dha", "dhin", "na", "dhin", "na", "dha"],
  },
  jhaptaal: {
    key: "jhaptaal",
    name: "Jhaptaal (10)",
    beats: 10,
    vibhags: [2, 3, 2, 3],
    tali: [0, 2, 7],
    khali: [5],
    bols: ["dhin", "na", "dhin", "dhin", "na", "na", "na", "dhin", "dhin", "na"],
  },
};

export interface TaalValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Checks a taal definition for structural errors. An empty error list means the definition is usable. */
export function validateTaal(taal: TaalDefinition): TaalValidation {
  const errors: string[] = [];
  const label = taal.key;

  if (!Number.isInteger(taal.beats) || taal.beats < 1) {
    errors.push(`${label}: beats must be a positive integer.`);
  }
  if (taal.vibhags.some((size) => !Number.isInteger(size) || size < 1)) {
    errors.push(`${label}: every vibhag must be a positive integer.`);
  }
  const vibhagTotal = taal.vibhags.reduce((sum, size) => sum + size, 0);
  if (vibhagTotal !== taal.beats) {
    errors.push(`${label}: vibhags sum to ${vibhagTotal}, expected ${taal.beats}.`);
  }
  if (taal.bols.length !== taal.beats) {
    errors.push(`${label}: has ${taal.bols.length} bols for ${taal.beats} beats.`);
  }

  const markedBeats = [...taal.tali, ...taal.khali];
  if (markedBeats.some((index) => !Number.isInteger(index) || index < 0 || index >= taal.beats)) {
    errors.push(`${label}: tali and khali indexes must be between 0 and ${taal.beats - 1}.`);
  }
  const overlap = taal.tali.filter((index) => taal.khali.includes(index));
  if (overlap.length > 0) {
    errors.push(`${label}: beat ${overlap.join(", ")} is marked as both tali and khali.`);
  }

  return { valid: errors.length === 0, errors };
}

export type BeatRole = "sam" | "tali" | "khali" | "matra";

export interface BeatInfo {
  readonly index: number;
  readonly role: BeatRole;
}

/** The sam takes precedence over tali, so the first beat is always shown as the sam. */
export function getBeatRole(taal: TaalDefinition, beatIndex: number): BeatRole {
  if (beatIndex === 0) return "sam";
  if (taal.tali.includes(beatIndex)) return "tali";
  if (taal.khali.includes(beatIndex)) return "khali";
  return "matra";
}

export function groupBeatsByVibhag(taal: TaalDefinition): BeatInfo[][] {
  const groups: BeatInfo[][] = [];
  let start = 0;
  for (const size of taal.vibhags) {
    const group: BeatInfo[] = [];
    for (let index = start; index < start + size; index++) {
      group.push({ index, role: getBeatRole(taal, index) });
    }
    groups.push(group);
    start += size;
  }
  return groups;
}

export function isTaalKey(value: string): value is TaalKey {
  return (TAAL_KEYS as readonly string[]).includes(value);
}

export function getTaal(key: TaalKey): TaalDefinition {
  return TAALS[key];
}
