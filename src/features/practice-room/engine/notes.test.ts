import { describe, expect, it } from "vitest";

import {
  clampReferencePitch,
  frequencyToNote,
  getSwaraName,
  pitchClassName,
  REFERENCE_PITCH_MAX_HZ,
  REFERENCE_PITCH_MIN_HZ,
  saFrequencyHz,
} from "./notes";

const SA_C = 0;

describe("frequencyToNote", () => {
  it("reads A4 at 440 Hz as exactly in tune", () => {
    const reading = frequencyToNote(440, 440);
    expect(reading?.noteName).toBe("A4");
    expect(reading?.nearestMidi).toBe(69);
    expect(reading?.centsDeviation).toBe(0);
  });

  it("reports a positive deviation for 442 Hz against A4 = 440", () => {
    const reading = frequencyToNote(442, 440);
    expect(reading?.centsDeviation).toBeGreaterThan(0);
    expect(reading?.centsDeviation).toBeCloseTo(8, 0);
  });

  it("reports a negative deviation for a flat note", () => {
    expect(frequencyToNote(438, 440)?.centsDeviation).toBeLessThan(0);
  });

  it("names octaves from scientific pitch notation", () => {
    expect(frequencyToNote(261.6256, 440)?.noteName).toBe("C4");
    expect(frequencyToNote(130.8128, 440)?.noteName).toBe("C3");
  });

  it("returns cents as an integer", () => {
    const reading = frequencyToNote(437.3, 440);
    expect(Number.isInteger(reading?.centsDeviation)).toBe(true);
  });

  it("returns null for frequencies or references that are not positive and finite", () => {
    expect(frequencyToNote(0, 440)).toBeNull();
    expect(frequencyToNote(-220, 440)).toBeNull();
    expect(frequencyToNote(Number.NaN, 440)).toBeNull();
    expect(frequencyToNote(Number.POSITIVE_INFINITY, 440)).toBeNull();
    expect(frequencyToNote(440, 0)).toBeNull();
  });
});

describe("getSwaraName", () => {
  it("maps E to Ga and G to Pa when Sa is C", () => {
    expect(getSwaraName(4, SA_C)).toBe("Ga");
    expect(getSwaraName(7, SA_C)).toBe("Pa");
  });

  it("maps A to Dha when Sa is C", () => {
    expect(getSwaraName(9, SA_C)).toBe("Dha");
  });

  it("returns Sa for the tonic itself, whatever the key", () => {
    expect(getSwaraName(9, 9)).toBe("Sa");
  });
});

describe("pitch class helpers", () => {
  it("names pitch classes and wraps negative values", () => {
    expect(pitchClassName(0)).toBe("C");
    expect(pitchClassName(-1)).toBe("B");
  });

  it("gives Sa frequencies that start at C3 and span one octave", () => {
    expect(saFrequencyHz(0)).toBeCloseTo(130.8128, 3);
    expect(saFrequencyHz(12)).toBeCloseTo(saFrequencyHz(0), 9);
  });
});

describe("clampReferencePitch", () => {
  it("keeps the A4 reference between 415 and 466 Hz", () => {
    expect(clampReferencePitch(400)).toBe(REFERENCE_PITCH_MIN_HZ);
    expect(clampReferencePitch(500)).toBe(REFERENCE_PITCH_MAX_HZ);
    expect(clampReferencePitch(440)).toBe(440);
  });
});
