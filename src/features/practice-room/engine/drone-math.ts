/** String pitches as ratios of Sa: lower Pa (0.75), Sa, upper Sa (2), lower Sa (0.5). Same as the prototype. */
export const STRING_RATIOS = [0.75, 1, 2, 0.5] as const;

/**
 * The loop filter adds a little group delay to each pass round the feedback loop. Subtracting it
 * from the delay keeps the pitch on the tonic.
 */
export const LOOP_FILTER_GROUP_DELAY_SECONDS = 0.00012;
const MIN_LOOP_DELAY_SECONDS = 0.0005;

/**
 * Web Audio clamps a DelayNode inside a feedback cycle to one render quantum. Loop pitches above
 * sampleRate / 128 cannot be reached with this topology. See isLoopPitchReachable.
 */
export const RENDER_QUANTUM_FRAMES = 128;

// Amplitude kept after one second of decay. The loop gain is this value raised to 1 / frequency,
// so one second of loop passes multiplies out to exactly this figure.
const DECAY_PER_SECOND = 0.93;
const MAX_LOOP_CUTOFF_HZ = 6000;
const LOOP_CUTOFF_PER_HZ = 30;

export const STRING_OUTPUT_GAIN = 0.22;

export function loopDelaySeconds(frequency: number): number {
  return Math.max(MIN_LOOP_DELAY_SECONDS, 1 / frequency - LOOP_FILTER_GROUP_DELAY_SECONDS);
}

export function loopFeedbackGain(frequency: number): number {
  return DECAY_PER_SECOND ** (1 / frequency);
}

export function loopCutoffHz(frequency: number): number {
  return Math.min(MAX_LOOP_CUTOFF_HZ, frequency * LOOP_CUTOFF_PER_HZ);
}

/**
 * True when the loop can sound at this frequency. When false, the string plays at the clamped
 * minimum delay instead, which is flat. Affects the upper Sa string for the higher keys.
 */
export function isLoopPitchReachable(frequency: number, sampleRate: number): boolean {
  const minimumDelaySeconds = RENDER_QUANTUM_FRAMES / sampleRate;
  return 1 / frequency - LOOP_FILTER_GROUP_DELAY_SECONDS >= minimumDelaySeconds;
}
