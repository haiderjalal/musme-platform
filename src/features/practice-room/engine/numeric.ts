/** Clamps a number into the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Maps any integer onto the pitch-class range 0 to 11, so negative offsets wrap correctly. */
export function wrapPitchClass(value: number): number {
  return ((value % 12) + 12) % 12;
}

/**
 * Reads an index the caller has already bounded. The fallback exists only to satisfy
 * noUncheckedIndexedAccess for typed arrays, which are never read out of range here.
 */
export function valueAt(values: ArrayLike<number>, index: number): number {
  return values[index] ?? 0;
}
