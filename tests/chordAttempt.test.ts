// The shared chord-attempt tracker.
import { describe, expect, it } from "vitest";
import { freshAttempt, trackAttempt, type ChordAttempt } from "../src/exercises/chordAttempt";

const isC = (notes: number[]) => notes.map(n => n % 12).sort((a, b) => a - b).join() === "0,4,7";
const feed = (a: ChordAttempt, ...steps: number[][]) => {
  const outcomes: string[] = [];
  for (const notes of steps) { const r = trackAttempt(a, notes, isC); a = r.attempt; outcomes.push(r.outcome.kind === "miss" ? "miss:" + r.outcome.notes.join(",") : r.outcome.kind); }
  return { attempt: a, outcomes };
};

describe("trackAttempt", () => {
  it("matches as soon as the held keys form the target, rolled or not", () => {
    expect(feed(freshAttempt(), [48], [48, 52], [48, 52, 55]).outcomes).toEqual(["none", "none", "match"]);
  });

  it("matches a target reached by releasing keys (legato)", () => {
    expect(feed(freshAttempt([48, 52, 55, 59]), [48, 52, 55]).outcomes).toEqual(["match"]);
  });

  it("judges a miss only after new presses and then all keys up, reporting the fullest set", () => {
    expect(feed(freshAttempt(), [50], [50, 53, 57], [50, 53], []).outcomes).toEqual(["none", "none", "none", "miss:50,53,57"]);
  });

  it("does not count letting go of keys that were already held", () => {
    expect(feed(freshAttempt([50, 53, 57]), [50, 53], []).outcomes).toEqual(["none", "none"]);
  });

  it("starts fresh after a match or a miss", () => {
    const r = feed(freshAttempt(), [48, 52, 55], [48, 52], []);
    expect(r.outcomes).toEqual(["match", "none", "none"]);
    expect(r.attempt).toEqual(freshAttempt());
  });
});
