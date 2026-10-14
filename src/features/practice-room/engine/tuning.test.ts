import { describe, expect, it } from "vitest";

import {
  applyTunerFrame,
  describeTuning,
  formatTuningSummary,
  getMeterScale,
  getNeedleAngleDegrees,
  getTuningStatus,
  isTunerFrameDue,
  SILENT_TUNER_READING,
  TUNER_FRAME_INTERVAL_MS,
} from "./tuning";

describe("getTuningStatus", () => {
  it("reads within the tolerance as in tune, including the edges", () => {
    expect(getTuningStatus(0)).toBe("In tune");
    expect(getTuningStatus(5)).toBe("In tune");
    expect(getTuningStatus(-5)).toBe("In tune");
  });

  it("reads flat and sharp just outside the tolerance", () => {
    expect(getTuningStatus(-6)).toBe("Flat");
    expect(getTuningStatus(6)).toBe("Sharp");
  });
});

describe("describeTuning", () => {
  it("describes 442 Hz against A4 = 440 as sharp, with Sa on C", () => {
    const display = describeTuning(442, 440, 0);
    expect(display?.status).toBe("Sharp");
    expect(display?.centsDeviation).toBe(8);
    expect(display?.swara).toBe("Dha");
    expect(display?.saName).toBe("C");
  });

  it("returns null when the frequency is not usable", () => {
    expect(describeTuning(0, 440, 0)).toBeNull();
  });
});

describe("formatTuningSummary", () => {
  it("writes the status, cents and swara in plain words", () => {
    const display = describeTuning(442, 440, 0);
    if (!display) throw new Error("Expected a tuning display.");
    expect(formatTuningSummary(display)).toBe("Sharp, +8 cents. Swara Dha, with Sa on C.");
  });
});

describe("applyTunerFrame", () => {
  it("keeps the last note when a frame has no pitch", () => {
    const tuned = applyTunerFrame(SILENT_TUNER_READING, { level: 0.2, frequency: 440 }, 440, 0);
    const silent = applyTunerFrame(tuned, { level: 0.01, frequency: null }, 440, 0);
    expect(silent.display).toEqual(tuned.display);
    expect(silent.level).toBe(0.01);
  });
});

describe("tuner frame throttle", () => {
  it("allows a new reading once the interval has passed", () => {
    expect(isTunerFrameDue(1000, 1000 + TUNER_FRAME_INTERVAL_MS - 1)).toBe(false);
    expect(isTunerFrameDue(1000, 1000 + TUNER_FRAME_INTERVAL_MS)).toBe(true);
  });

  it("allows the first reading", () => {
    expect(isTunerFrameDue(Number.NEGATIVE_INFINITY, 0)).toBe(true);
  });

  it("runs at 20 to 30 readings a second", () => {
    const readsPerSecond = 1000 / TUNER_FRAME_INTERVAL_MS;
    expect(readsPerSecond).toBeGreaterThanOrEqual(20);
    expect(readsPerSecond).toBeLessThanOrEqual(30);
  });
});

describe("needle and meter mapping", () => {
  it("limits the needle to plus or minus 50 cents", () => {
    expect(getNeedleAngleDegrees(0)).toBe(0);
    expect(getNeedleAngleDegrees(80)).toBeCloseTo(60, 9);
    expect(getNeedleAngleDegrees(-80)).toBeCloseTo(-60, 9);
  });

  it("keeps meter bars between their minimum and full height", () => {
    expect(getMeterScale(0, 1)).toBeCloseTo(0.08, 9);
    expect(getMeterScale(1, 1)).toBe(1);
  });
});
