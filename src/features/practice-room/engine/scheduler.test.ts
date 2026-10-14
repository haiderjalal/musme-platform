import { describe, expect, it } from "vitest";

import {
  createBeatCursor,
  planBeats,
  takeDueBeats,
  type BeatCursor,
  type BeatEvent,
} from "./scheduler";
import { TAALS } from "./taals";

const LOOKAHEAD_SECONDS = 0.12;

describe("planBeats", () => {
  it("spaces beats at 60 / bpm", () => {
    const { events } = planBeats({
      clockTime: 0,
      lookaheadSeconds: 5,
      taal: TAALS.teentaal,
      bpm: 84,
      cursor: createBeatCursor(0),
    });

    const expectedSpacing = 60 / 84;
    for (let i = 1; i < events.length; i++) {
      const previous = events[i - 1];
      const current = events[i];
      if (!previous || !current) throw new Error("Expected planned beat events.");
      expect(current.time - previous.time).toBeCloseTo(expectedSpacing, 9);
    }
  });

  it("wraps beat indexes at the taal length and advances the cycle", () => {
    const { events } = planBeats({
      clockTime: 0,
      lookaheadSeconds: 100,
      taal: TAALS.dadra,
      bpm: 60,
      cursor: createBeatCursor(0),
    });

    const beatIndexes = events.slice(0, 13).map((event) => event.beatIndex);
    expect(beatIndexes).toEqual([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0]);
    expect(events[6]?.cycleIndex).toBe(1);
    expect(events[12]?.cycleIndex).toBe(2);
  });

  it("keeps every planned beat inside the lookahead window", () => {
    const clockTime = 3.2;
    const { events, cursor } = planBeats({
      clockTime,
      lookaheadSeconds: LOOKAHEAD_SECONDS,
      taal: TAALS.keherwa,
      bpm: 120,
      cursor: createBeatCursor(3.1),
    });

    for (const event of events) {
      expect(event.time).toBeLessThan(clockTime + LOOKAHEAD_SECONDS);
    }
    expect(cursor.time).toBeGreaterThanOrEqual(clockTime + LOOKAHEAD_SECONDS);
  });

  it("never emits the same beat twice across consecutive calls with advancing clock time", () => {
    let cursor: BeatCursor = createBeatCursor(0.08);
    const emitted: BeatEvent[] = [];

    for (let clock = 0; clock <= 6; clock += 0.025) {
      const plan = planBeats({
        clockTime: clock,
        lookaheadSeconds: LOOKAHEAD_SECONDS,
        taal: TAALS.teentaal,
        bpm: 96,
        cursor,
      });
      emitted.push(...plan.events);
      cursor = plan.cursor;
    }

    const times = emitted.map((event) => event.time);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1] ?? Number.NEGATIVE_INFINITY);
    }
    const expectedCount = Math.ceil((6 + LOOKAHEAD_SECONDS - 0.08) / (60 / 96));
    expect(Math.abs(emitted.length - expectedCount)).toBeLessThanOrEqual(1);
  });

  it("applies a tempo step from the first interval after the cycle wraps", () => {
    const { events, bpm } = planBeats({
      clockTime: 0,
      lookaheadSeconds: 8,
      taal: TAALS.dadra,
      bpm: 60,
      cursor: createBeatCursor(0),
      onCycleStart: (cycleIndex, currentBpm) => (cycleIndex === 1 ? 120 : currentBpm),
    });

    // Cycle 0 runs at 60 BPM (1 s). The sam of cycle 1 is at 6 s, and the interval after it is 0.5 s.
    expect(events[5]?.time).toBeCloseTo(5, 9);
    expect(events[6]?.time).toBeCloseTo(6, 9);
    expect(events[7]?.time).toBeCloseTo(6.5, 9);
    expect(events[8]?.time).toBeCloseTo(7, 9);
    expect(bpm).toBe(120);
  });

  it("accents the sam and gives matras a softer accent", () => {
    const { events } = planBeats({
      clockTime: 0,
      lookaheadSeconds: 2,
      taal: TAALS.dadra,
      bpm: 60,
      cursor: createBeatCursor(0),
    });
    expect(events[0]?.accent).toBe(1);
    expect(events[1]?.accent).toBeCloseTo(0.8, 9);
  });

  it("refuses a tempo that would stall the planning loop", () => {
    expect(() =>
      planBeats({
        clockTime: 0,
        lookaheadSeconds: 1,
        taal: TAALS.dadra,
        bpm: 0,
        cursor: createBeatCursor(0),
      }),
    ).toThrow(RangeError);
  });
});

describe("takeDueBeats", () => {
  const queue: BeatEvent[] = [
    { time: 1.0, beatIndex: 0, cycleIndex: 0, bol: "dha", accent: 1 },
    { time: 1.5, beatIndex: 1, cycleIndex: 0, bol: "dhin", accent: 0.8 },
    { time: 2.0, beatIndex: 2, cycleIndex: 0, bol: "dhin", accent: 0.8 },
  ];

  it("returns beats whose time has passed and keeps the rest pending", () => {
    const { due, pending } = takeDueBeats(queue, 1.6);
    expect(due.map((beat) => beat.beatIndex)).toEqual([0, 1]);
    expect(pending.map((beat) => beat.beatIndex)).toEqual([2]);
  });

  it("returns nothing due before the first beat", () => {
    const { due, pending } = takeDueBeats(queue, 0.5);
    expect(due).toEqual([]);
    expect(pending).toHaveLength(3);
  });

  it("returns everything due once the clock has passed the last beat", () => {
    const { due, pending } = takeDueBeats(queue, 10);
    expect(due).toHaveLength(3);
    expect(pending).toEqual([]);
  });
});
