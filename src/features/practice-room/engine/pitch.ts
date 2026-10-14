import { valueAt } from "./numeric";

/** Lowest and highest fundamentals searched. Matches the prototype's 60 Hz to 1 kHz range. */
export const PITCH_MIN_HZ = 60;
export const PITCH_MAX_HZ = 1000;

// Below this RMS the input is treated as silence, as in the prototype.
const SILENCE_RMS = 0.01;
// YIN's absolute threshold. Taking the first dip below it, rather than the global minimum,
// avoids octave errors. Tuned between 0.1 and 0.15 against the accuracy table in pitch.test.ts.
const YIN_THRESHOLD = 0.15;

export function rms(buffer: Float32Array): number {
  if (buffer.length === 0) return 0;
  let sum = 0;
  for (const sample of buffer) sum += sample * sample;
  return Math.sqrt(sum / buffer.length);
}

/**
 * YIN fundamental-frequency estimate. Returns null for silence and for signals with no clear period.
 * Unlike plain autocorrelation, the difference function reaches exactly zero at the true period,
 * so harmonic-rich tones do not pull the estimate sharp or flat.
 */
export function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  if (rms(buffer) < SILENCE_RMS) return null;

  const tauMin = Math.floor(sampleRate / PITCH_MAX_HZ);
  const tauMax = Math.floor(sampleRate / PITCH_MIN_HZ);
  const windowLength = buffer.length - tauMax;
  // The window must hold at least one period of the lowest pitch, or the estimate is meaningless.
  if (tauMin < 2 || windowLength < tauMax) return null;

  const normalized = cumulativeMeanNormalizedDifference(buffer, windowLength, tauMax);
  const period = findPeriod(normalized, tauMin, tauMax);
  if (period === null) return null;

  return sampleRate / refinePeriod(normalized, period, tauMax);
}

function cumulativeMeanNormalizedDifference(
  buffer: Float32Array,
  windowLength: number,
  tauMax: number,
): Float64Array {
  const normalized = new Float64Array(tauMax + 1);
  normalized[0] = 1;
  let runningSum = 0;

  for (let tau = 1; tau <= tauMax; tau++) {
    let difference = 0;
    for (let j = 0; j < windowLength; j++) {
      const delta = valueAt(buffer, j) - valueAt(buffer, j + tau);
      difference += delta * delta;
    }
    runningSum += difference;
    normalized[tau] = runningSum > 0 ? (difference * tau) / runningSum : 1;
  }

  return normalized;
}

function findPeriod(normalized: Float64Array, tauMin: number, tauMax: number): number | null {
  let tau = tauMin;
  while (tau < tauMax && valueAt(normalized, tau) >= YIN_THRESHOLD) tau += 1;
  if (valueAt(normalized, tau) >= YIN_THRESHOLD) return null;

  // Slide to the bottom of the dip so the estimate lands on the minimum, not its shoulder.
  while (tau < tauMax && valueAt(normalized, tau + 1) < valueAt(normalized, tau)) tau += 1;
  return tau;
}

/** Parabolic interpolation around the integer lag, which removes most of the sample-grid error. */
function refinePeriod(normalized: Float64Array, tau: number, tauMax: number): number {
  if (tau <= 1 || tau >= tauMax) return tau;
  const before = valueAt(normalized, tau - 1);
  const at = valueAt(normalized, tau);
  const after = valueAt(normalized, tau + 1);
  const curvature = before - 2 * at + after;
  if (curvature <= 0) return tau;
  return tau + (before - after) / (2 * curvature);
}
