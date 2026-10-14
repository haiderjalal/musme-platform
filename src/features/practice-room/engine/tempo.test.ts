import { describe, expect, it } from "vitest";

import {
  clampTempo,
  getLayaLabel,
  nextSpeedTrainerTempo,
  TEMPO_MAX_BPM,
  TEMPO_MIN_BPM,
} from "./tempo";

describe("clampTempo", () => {
  it("keeps the minimum and maximum inside the range", () => {
    expect(clampTempo(TEMPO_MIN_BPM)).toBe(40);
    expect(clampTempo(TEMPO_MAX_BPM)).toBe(240);
  });

  it("clamps values beyond either boundary", () => {
    expect(clampTempo(39)).toBe(40);
    expect(clampTempo(241)).toBe(240);
    expect(clampTempo(-500)).toBe(40);
    expect(clampTempo(Number.POSITIVE_INFINITY)).toBe(240);
  });

  it("rounds to whole BPM", () => {
    expect(clampTempo(84.4)).toBe(84);
    expect(clampTempo(84.6)).toBe(85);
  });

  it("falls back to the minimum for NaN", () => {
    expect(clampTempo(Number.NaN)).toBe(40);
  });
});

describe("getLayaLabel", () => {
  it("switches labels at the placeholder thresholds", () => {
    expect(getLayaLabel(69)).toBe("Slow");
    expect(getLayaLabel(70)).toBe("Medium");
    expect(getLayaLabel(150)).toBe("Medium");
    expect(getLayaLabel(151)).toBe("Fast");
  });
});

describe("nextSpeedTrainerTempo", () => {
  it("steps by 4 BPM on cycles 4, 8 and so on", () => {
    expect(nextSpeedTrainerTempo(84, 120, 4)).toBe(88);
    expect(nextSpeedTrainerTempo(88, 120, 8)).toBe(92);
  });

  it("does not step on other cycles, or on cycle 0", () => {
    for (const cycle of [0, 1, 2, 3, 5, 6, 7]) {
      expect(nextSpeedTrainerTempo(84, 120, cycle)).toBe(84);
    }
  });

  it("caps the step at the target", () => {
    expect(nextSpeedTrainerTempo(118, 120, 4)).toBe(120);
  });

  it("leaves tempo alone once the target is reached", () => {
    expect(nextSpeedTrainerTempo(120, 120, 4)).toBe(120);
  });

  it("only raises tempo, never pulling a faster tempo down to the target", () => {
    expect(nextSpeedTrainerTempo(130, 120, 4)).toBe(130);
  });

  it("never exceeds the target over a long run", () => {
    let tempo = 84;
    const visited: number[] = [];
    for (let cycle = 1; cycle <= 200; cycle++) {
      tempo = nextSpeedTrainerTempo(tempo, 120, cycle);
      visited.push(tempo);
    }
    expect(tempo).toBe(120);
    expect(Math.max(...visited)).toBeLessThanOrEqual(120);
  });
});
