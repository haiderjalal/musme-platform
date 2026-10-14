import type { BolName, TaalDefinition } from "./taals";

/** Next beat to schedule, positioned on the AudioContext clock. */
export interface BeatCursor {
  readonly time: number;
  readonly beatIndex: number;
  readonly cycleIndex: number;
}

export interface BeatEvent {
  readonly time: number;
  readonly beatIndex: number;
  readonly cycleIndex: number;
  readonly bol: BolName;
  readonly accent: number;
}

export interface PlanBeatsInput {
  /** AudioContext.currentTime at the moment of planning. */
  readonly clockTime: number;
  readonly lookaheadSeconds: number;
  readonly taal: TaalDefinition;
  readonly bpm: number;
  readonly cursor: BeatCursor;
  /**
   * Called when a cycle wraps back to beat 0. It returns the tempo to use from that point on.
   * It runs inside the planning loop so a tempo step applies to the very next interval.
   */
  readonly onCycleStart?: (cycleIndex: number, bpm: number) => number;
}

export interface PlanBeatsResult {
  readonly events: readonly BeatEvent[];
  readonly cursor: BeatCursor;
  readonly bpm: number;
}

export interface DueBeats {
  readonly due: readonly BeatEvent[];
  readonly pending: readonly BeatEvent[];
}

// The sam is accented and the other matras sit slightly below it, matching the prototype.
const SAM_ACCENT = 1;
const MATRA_ACCENT = 0.8;

export function createBeatCursor(startTime: number): BeatCursor {
  return { time: startTime, beatIndex: 0, cycleIndex: 0 };
}

/**
 * Plans every beat that falls inside the lookahead window. The returned cursor picks up exactly
 * where this call stopped, so consecutive calls never emit the same beat twice.
 */
export function planBeats(input: PlanBeatsInput): PlanBeatsResult {
  assertPlannable(input);
  const horizon = input.clockTime + input.lookaheadSeconds;
  const events: BeatEvent[] = [];
  let { time, beatIndex, cycleIndex } = input.cursor;
  let bpm = input.bpm;

  while (time < horizon) {
    events.push(createBeatEvent(input.taal, { time, beatIndex, cycleIndex }));
    time += 60 / bpm;
    beatIndex += 1;
    if (beatIndex >= input.taal.beats) {
      beatIndex = 0;
      cycleIndex += 1;
      bpm = input.onCycleStart?.(cycleIndex, bpm) ?? bpm;
    }
  }

  return { events, cursor: { time, beatIndex, cycleIndex }, bpm };
}

/**
 * Splits a time-ordered queue into beats that have already sounded by clockTime and beats still
 * to come. The UI calls this on animation frames to decide which markers to light.
 */
export function takeDueBeats(queue: readonly BeatEvent[], clockTime: number): DueBeats {
  const firstPending = queue.findIndex((beat) => beat.time > clockTime);
  if (firstPending === -1) return { due: queue, pending: [] };
  return { due: queue.slice(0, firstPending), pending: queue.slice(firstPending) };
}

function createBeatEvent(taal: TaalDefinition, cursor: BeatCursor): BeatEvent {
  const bol = taal.bols[cursor.beatIndex];
  // validateTaal guarantees one bol per beat. Failing loudly here beats playing silence.
  if (bol === undefined) {
    throw new RangeError(`${taal.key} has no bol for beat ${cursor.beatIndex}.`);
  }
  return {
    time: cursor.time,
    beatIndex: cursor.beatIndex,
    cycleIndex: cursor.cycleIndex,
    bol,
    accent: cursor.beatIndex === 0 ? SAM_ACCENT : MATRA_ACCENT,
  };
}

function assertPlannable(input: PlanBeatsInput): void {
  // A zero or non-finite tempo would make the planning loop spin forever.
  if (!Number.isFinite(input.bpm) || input.bpm <= 0) {
    throw new RangeError(`Tempo must be a positive finite BPM, received ${input.bpm}.`);
  }
  if (input.taal.beats < 1) {
    throw new RangeError(`${input.taal.key} must have at least one beat.`);
  }
}
