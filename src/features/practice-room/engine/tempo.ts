import { clamp } from "./numeric";

export const TEMPO_MIN_BPM = 40;
export const TEMPO_MAX_BPM = 240;
export const DEFAULT_TEMPO_BPM = 84;
export const DEFAULT_TARGET_BPM = 120;

// Laya thresholds are PLACEHOLDERS. Confirm the slow, medium and fast boundaries with a tabla teacher.
const SLOW_BELOW_BPM = 70;
const MEDIUM_UP_TO_BPM = 150;

export type LayaLabel = "Slow" | "Medium" | "Fast";

export interface SpeedTrainerRule {
  readonly stepBpm: number;
  readonly everyCycles: number;
}

export const DEFAULT_SPEED_TRAINER_RULE: SpeedTrainerRule = { stepBpm: 4, everyCycles: 4 };

/** Returns whole BPM within the supported range. NaN falls back to the minimum rather than propagating. */
export function clampTempo(bpm: number): number {
  if (Number.isNaN(bpm)) return TEMPO_MIN_BPM;
  return clamp(Math.round(bpm), TEMPO_MIN_BPM, TEMPO_MAX_BPM);
}

export function getLayaLabel(bpm: number): LayaLabel {
  if (bpm < SLOW_BELOW_BPM) return "Slow";
  if (bpm <= MEDIUM_UP_TO_BPM) return "Medium";
  return "Fast";
}

/**
 * Speed trainer step. Called with the cycle index that has just begun, so steps land on
 * cycles 4, 8, 12 and so on. The trainer only raises tempo and never overshoots the target.
 */
export function nextSpeedTrainerTempo(
  current: number,
  target: number,
  cycleIndex: number,
  rule: SpeedTrainerRule = DEFAULT_SPEED_TRAINER_RULE,
): number {
  const isStepCycle = cycleIndex > 0 && cycleIndex % rule.everyCycles === 0;
  if (!isStepCycle || current >= target) return current;
  return clampTempo(Math.min(target, current + rule.stepBpm));
}
