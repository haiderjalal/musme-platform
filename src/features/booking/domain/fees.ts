const BASIS_POINTS_PER_UNIT = 10_000;

/**
 * Platform fee in minor currency units, rounded down so the platform never takes a fraction
 * of a unit the teacher is owed. feeBps is the fee in basis points (100 = 1%).
 */
export function calculatePlatformFee(priceMinor: number, feeBps: number): number {
  if (!Number.isInteger(priceMinor) || priceMinor < 0) {
    throw new RangeError("priceMinor must be a non-negative integer.");
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > BASIS_POINTS_PER_UNIT) {
    throw new RangeError("feeBps must be an integer between 0 and 10000.");
  }
  return Math.floor((priceMinor * feeBps) / BASIS_POINTS_PER_UNIT);
}
