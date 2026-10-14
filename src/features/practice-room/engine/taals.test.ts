import { describe, expect, it } from "vitest";

import {
  getBeatRole,
  groupBeatsByVibhag,
  isTaalKey,
  TAAL_KEYS,
  TAALS,
  validateTaal,
  type TaalDefinition,
} from "./taals";

describe("taal definitions", () => {
  it.each(TAAL_KEYS)("%s passes validation", (key) => {
    expect(validateTaal(TAALS[key])).toEqual({ valid: true, errors: [] });
  });

  it("places Teentaal tali on 0, 4 and 12 and khali on 8", () => {
    expect(TAALS.teentaal.tali).toEqual([0, 4, 12]);
    expect(TAALS.teentaal.khali).toEqual([8]);
  });

  it("gives every taal one bol per matra", () => {
    for (const key of TAAL_KEYS) {
      expect(TAALS[key].bols).toHaveLength(TAALS[key].beats);
    }
  });
});

describe("validateTaal", () => {
  const dadra = TAALS.dadra;

  it("reports vibhags that do not sum to the beat count", () => {
    const broken: TaalDefinition = { ...dadra, vibhags: [3, 2] };
    const result = validateTaal(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("vibhags sum to 5, expected 6");
  });

  it("reports tali or khali indexes outside the cycle", () => {
    const outOfRange: TaalDefinition = { ...dadra, tali: [0, 6] };
    expect(validateTaal(outOfRange).valid).toBe(false);
  });

  it("reports a beat marked as both tali and khali", () => {
    const overlapping: TaalDefinition = { ...dadra, tali: [0, 3], khali: [3] };
    const result = validateTaal(overlapping);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("both tali and khali");
  });

  it("reports a bol list that does not match the beat count", () => {
    const shortBols: TaalDefinition = { ...dadra, bols: ["dha", "na"] };
    expect(validateTaal(shortBols).valid).toBe(false);
  });
});

describe("beat roles and vibhag grouping", () => {
  it("marks beat 0 as sam even when it is also a tali", () => {
    expect(getBeatRole(TAALS.teentaal, 0)).toBe("sam");
    expect(getBeatRole(TAALS.teentaal, 4)).toBe("tali");
    expect(getBeatRole(TAALS.teentaal, 8)).toBe("khali");
    expect(getBeatRole(TAALS.teentaal, 5)).toBe("matra");
  });

  it("groups Jhaptaal beats into its 2, 3, 2, 3 vibhags", () => {
    const groups = groupBeatsByVibhag(TAALS.jhaptaal).map((group) =>
      group.map((beat) => beat.index),
    );
    expect(groups).toEqual([
      [0, 1],
      [2, 3, 4],
      [5, 6],
      [7, 8, 9],
    ]);
  });
});

describe("isTaalKey", () => {
  it("accepts known keys and rejects anything else", () => {
    expect(isTaalKey("keherwa")).toBe(true);
    expect(isTaalKey("ektaal")).toBe(false);
  });
});
