// Ear training, intervals: the intervals and levels, prompts and how they're played, options and judging.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTERVAL_EAR,
  INTERVAL_EAR_LADDER,
  INTERVAL_IDS,
  INTERVALS,
  initialIntervalEar,
  intervalLabel,
  intervalNotes,
  intervalOrder,
  makeIntervalEarPrompt,
  offeredIntervals,
  playOrder,
  reduceIntervalEar,
  sanitizeIntervalEarOptions,
  type IntervalEarOptions,
} from "../src/exercises/intervalEar";

/** A repeatable sequence of "random" numbers */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};
const free = (intervals: string[], play: IntervalEarOptions["play"] = "up"): IntervalEarOptions => ({
  ...DEFAULT_INTERVAL_EAR,
  intervals,
  play,
  ladder: false,
});

describe("intervals", () => {
  it("every interval in the octave, a half step apart, smallest first", () => {
    expect(INTERVALS.map(i => i.semitones)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(intervalLabel("TT")).toBe("Tritone");
    expect(intervalOrder(["P8", "m3", "P5"])).toEqual(["m3", "P5", "P8"]);
  });

  it("levels start with the three easiest to tell apart, add more each time, and end with all twelve", () => {
    const levels = INTERVAL_EAR_LADDER.levels.map(l => l.options.intervals);
    expect(levels[0]).toEqual(["M3", "P5", "P8"]);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].length).toBeGreaterThan(levels[i - 1].length);
      for (const id of levels[i - 1]) expect(levels[i]).toContain(id);
    }
    expect(levels.at(-1)).toEqual(INTERVAL_IDS);
  });
});

describe("options", () => {
  it("the ladder, playing up, the simple sound unless saved otherwise; at least two intervals", () => {
    expect(sanitizeIntervalEarOptions(undefined)).toEqual(DEFAULT_INTERVAL_EAR);
    expect(
      sanitizeIntervalEarOptions({ intervals: ["P8", "m2", "x"], play: "mixed", sound: "piano", ladder: false }),
    ).toEqual({
      ...DEFAULT_INTERVAL_EAR,
      intervals: ["m2", "P8"],
      play: "mixed",
      sound: "piano",
      ladder: false,
    });
    expect(sanitizeIntervalEarOptions({ intervals: ["m2"], play: "sideways", level: 42 })).toMatchObject({
      intervals: DEFAULT_INTERVAL_EAR.intervals,
      play: "up",
      level: INTERVAL_EAR_LADDER.levels.length - 1,
    });
  });

  it("on the ladder its level's intervals, with free choice the player's", () => {
    expect(offeredIntervals({ ...DEFAULT_INTERVAL_EAR, level: 1 })).toEqual(["m3", "M3", "P5", "P8"]);
    expect(offeredIntervals(free(["m2", "M7"]))).toEqual(["m2", "M7"]);
  });
});

describe("prompts", () => {
  it("two notes the interval apart, the lower from C3, the upper below G5, spelled by the interval", () => {
    for (let i = 0; i < 300; i++) {
      const p = makeIntervalEarPrompt(Math.random, free(INTERVAL_IDS as string[]));
      const size = INTERVALS.find(x => x.id === p.interval)!.semitones;
      expect(p.high - p.low).toBe(size);
      expect(p.low).toBeGreaterThanOrEqual(48);
      expect(p.high).toBeLessThan(80);
    }
    // C up a minor 3rd is E♭, not D♯; D♭ up an augmented 4th is G
    const at = (interval: string, pc: number) => {
      // pick: the interval, then the lower note (48 + pc)
      const i = INTERVAL_IDS.indexOf(interval);
      return makeIntervalEarPrompt(seq((i + 0.5) / 12, (pc + 0.5) / 20), free(INTERVAL_IDS as string[]));
    };
    expect(at("m3", 0)).toMatchObject({ lowName: "C", highName: "E♭", low: 48, high: 51 });
    expect(at("TT", 1)).toMatchObject({ lowName: "D♭", highName: "G" });
  });

  it("played up, down or together as chosen; a mix picks among all three", () => {
    const p = makeIntervalEarPrompt(seq(0.4, 0.1), free(["m3", "P5"], "down"));
    expect(playOrder(p)).toEqual([p.high, p.low]);
    expect(intervalNotes(p)).toMatch(/ down to /);
    const together = makeIntervalEarPrompt(seq(0.4, 0.1), free(["m3", "P5"], "together"));
    expect(intervalNotes(together)).toMatch(/ together$/);
    const seen = new Set(
      Array.from({ length: 200 }, () => makeIntervalEarPrompt(Math.random, free(["m3", "P5"], "mixed")).direction),
    );
    expect(seen).toEqual(new Set(["up", "down", "together"]));
  });

  it("never the same interval from the same note twice running", () => {
    let previous = makeIntervalEarPrompt(Math.random, free(["m3", "P5"]));
    for (let i = 0; i < 100; i++) {
      const p = makeIntervalEarPrompt(Math.random, free(["m3", "P5"]), previous);
      expect(p.interval === previous.interval && p.low === previous.low).toBe(false);
      previous = p;
    }
  });
});

describe("judging", () => {
  const prompt = makeIntervalEarPrompt(seq(0.5 / 12, 0.5 / 20), free(INTERVAL_IDS as string[])); // m2 from C3

  it("right first time, or after wrong answers (each struck out and kept)", () => {
    expect(reduceIntervalEar(initialIntervalEar(prompt), { type: "answer", interval: "m2" })).toMatchObject({
      status: "correct",
      firstTry: 1,
    });
    let s = reduceIntervalEar(initialIntervalEar(prompt), { type: "answer", interval: "M2" });
    expect(s).toMatchObject({ status: "wrong", wrong: ["M2"], missed: true });
    expect(reduceIntervalEar(s, { type: "answer", interval: "M2" })).toBe(s);
    s = reduceIntervalEar(s, { type: "answer", interval: "m2" });
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 0 });
  });
});
