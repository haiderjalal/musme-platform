import { describe, expect, it } from "vitest";

import { detectPitch, rms } from "./pitch";

// The Web Audio tuner analyser uses 2048 samples, so the accuracy table uses the same window.
const WINDOW_SAMPLES = 2048;
const ACCURACY_TOLERANCE_CENTS = 2;

// Partial amplitudes for harmonics 1..n. Two profiles cover a weak and a strong second harmonic.
const HARMONIC_PROFILES: readonly {
  readonly name: string;
  readonly amplitudes: readonly number[];
}[] = [
  { name: "decaying harmonics", amplitudes: [1, 0.5, 0.25, 0.125] },
  { name: "strong second harmonic", amplitudes: [0.4, 1, 0.6] },
];

const TEST_FREQUENCIES_HZ = [
  80, 98, 110, 130.81, 146.83, 164.81, 174.61, 196, 220, 246.94, 261.63, 293.66, 329.63, 349.23,
  392, 440, 523.25, 659.26, 783.99, 880, 1000,
] as const;

const SAMPLE_RATES = [44100, 48000] as const;

function synthesizeTone(
  frequency: number,
  sampleRate: number,
  amplitudes: readonly number[],
  length: number,
): Float32Array {
  const samples = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    let value = 0;
    amplitudes.forEach((amplitude, harmonicIndex) => {
      const harmonic = harmonicIndex + 1;
      value += amplitude * Math.sin((2 * Math.PI * harmonic * frequency * n) / sampleRate);
    });
    samples[n] = value * 0.3;
  }
  return samples;
}

function centsBetween(measured: number, expected: number): number {
  return 1200 * Math.log2(measured / expected);
}

/** Deterministic noise so the "unclear signal" test is repeatable. */
function pseudoRandomNoise(length: number): Float32Array {
  const samples = new Float32Array(length);
  let seed = 12345;
  for (let n = 0; n < length; n++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    samples[n] = (seed / 0x7fffffff) * 2 - 1;
  }
  return samples;
}

describe("rms", () => {
  it("returns the amplitude of a constant signal", () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 6);
  });

  it("returns 0 for an empty buffer", () => {
    expect(rms(new Float32Array(0))).toBe(0);
  });
});

describe("detectPitch accuracy (YIN)", () => {
  for (const profile of HARMONIC_PROFILES) {
    for (const sampleRate of SAMPLE_RATES) {
      for (const frequency of TEST_FREQUENCIES_HZ) {
        it(`detects ${frequency} Hz at ${sampleRate} Hz with ${profile.name} within 2 cents`, () => {
          const buffer = synthesizeTone(frequency, sampleRate, profile.amplitudes, WINDOW_SAMPLES);
          const detected = detectPitch(buffer, sampleRate);

          expect(detected).not.toBeNull();
          expect(Math.abs(centsBetween(detected ?? 0, frequency))).toBeLessThanOrEqual(
            ACCURACY_TOLERANCE_CENTS,
          );
        });
      }
    }
  }
});

describe("detectPitch unclear input", () => {
  it("returns null for silence", () => {
    expect(detectPitch(new Float32Array(WINDOW_SAMPLES), 44100)).toBeNull();
  });

  it("returns null for a tone too quiet to be a note", () => {
    const quiet = synthesizeTone(220, 44100, [1], WINDOW_SAMPLES).map((sample) => sample * 0.01);
    expect(detectPitch(quiet, 44100)).toBeNull();
  });

  it("returns null for broadband noise with no period", () => {
    expect(detectPitch(pseudoRandomNoise(WINDOW_SAMPLES), 44100)).toBeNull();
  });

  it("returns null when the buffer is too short to hold one period of the lowest pitch", () => {
    const short = synthesizeTone(220, 44100, [1], 256);
    expect(detectPitch(short, 44100)).toBeNull();
  });
});
