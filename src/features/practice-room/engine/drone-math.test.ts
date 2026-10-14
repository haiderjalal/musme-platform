import { describe, expect, it } from "vitest";

import {
  isLoopPitchReachable,
  LOOP_FILTER_GROUP_DELAY_SECONDS,
  loopCutoffHz,
  loopDelaySeconds,
  loopFeedbackGain,
  STRING_RATIOS,
} from "./drone-math";

const SAMPLE_RATE_44K = 44100;
const SAMPLE_RATE_48K = 48000;

describe("drone string layout", () => {
  it("uses lower Pa, Sa, upper Sa and lower Sa", () => {
    expect([...STRING_RATIOS]).toEqual([0.75, 1, 2, 0.5]);
  });
});

describe("loopDelaySeconds", () => {
  it("compensates for the loop filter so one pass lasts exactly one period", () => {
    for (const frequency of [65.41, 130.81, 261.63]) {
      const passDuration = loopDelaySeconds(frequency) + LOOP_FILTER_GROUP_DELAY_SECONDS;
      expect(passDuration).toBeCloseTo(1 / frequency, 12);
    }
  });

  it("never drops below the minimum delay", () => {
    expect(loopDelaySeconds(5000)).toBe(0.0005);
  });
});

describe("loopFeedbackGain", () => {
  it("retains 93 percent of amplitude after one second of loop passes", () => {
    for (const frequency of [65.41, 130.81, 261.63]) {
      const gainPerSecond = loopFeedbackGain(frequency) ** frequency;
      expect(gainPerSecond).toBeCloseTo(0.93, 9);
    }
  });

  it("stays below unity so the loop decays rather than growing", () => {
    expect(loopFeedbackGain(130.81)).toBeLessThan(1);
  });
});

describe("loopCutoffHz", () => {
  it("scales with pitch up to the 6 kHz ceiling", () => {
    expect(loopCutoffHz(100)).toBe(3000);
    expect(loopCutoffHz(500)).toBe(6000);
  });
});

describe("isLoopPitchReachable", () => {
  it("reaches the upper Sa for the lower keys at both sample rates", () => {
    expect(isLoopPitchReachable(261.63, SAMPLE_RATE_44K)).toBe(true);
    expect(isLoopPitchReachable(261.63, SAMPLE_RATE_48K)).toBe(true);
  });

  it("cannot reach 349 Hz at 44.1 kHz, where the render quantum caps the loop", () => {
    expect(isLoopPitchReachable(349.23, SAMPLE_RATE_44K)).toBe(false);
  });

  it("reaches 349 Hz at 48 kHz", () => {
    expect(isLoopPitchReachable(349.23, SAMPLE_RATE_48K)).toBe(true);
  });

  it("cannot reach 494 Hz at either sample rate", () => {
    expect(isLoopPitchReachable(493.88, SAMPLE_RATE_44K)).toBe(false);
    expect(isLoopPitchReachable(493.88, SAMPLE_RATE_48K)).toBe(false);
  });
});
