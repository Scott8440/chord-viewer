// Ladders: levels unlocked by rounds played well, worked out from the round records.
import { describe, expect, it } from "vitest";
import { CHORD_PRACTICE_TYPES } from "../src/exercises/chordPractice";
import {
  CHORD_EAR_LADDER,
  ladderProgress,
  roundsToUnlock,
  UNLOCK_ROUNDS,
  UNLOCK_SHARE,
} from "../src/exercises/ladders";

const at = (level: number, share: number) => ({ level, share });

describe("unlocking", () => {
  it("starts with only the first level", () => {
    expect(ladderProgress(4, [])).toEqual({ unlocked: 0, streaks: [0, 0, 0, 0] });
    expect(roundsToUnlock(ladderProgress(4, []), 0)).toBe(UNLOCK_ROUNDS);
  });

  it("two rounds in a row at 85% or better unlock the next level", () => {
    expect(UNLOCK_SHARE).toBe(0.85);
    expect(ladderProgress(4, [at(0, 0.85)]).unlocked).toBe(0);
    expect(roundsToUnlock(ladderProgress(4, [at(0, 0.9)]), 0)).toBe(1);
    expect(ladderProgress(4, [at(0, 0.9), at(0, 0.85)]).unlocked).toBe(1);
    // A round under 85% starts the count again
    expect(ladderProgress(4, [at(0, 0.9), at(0, 0.8), at(0, 0.95)]).unlocked).toBe(0);
    expect(ladderProgress(4, [at(0, 0.9), at(0, 0.8), at(0, 0.95), at(0, 1)]).unlocked).toBe(1);
  });

  it("only goes up: poor rounds later don't lock a level again", () => {
    const p = ladderProgress(4, [at(0, 1), at(0, 1), at(1, 0.2), at(0, 0.1), at(1, 0.3)]);
    expect(p.unlocked).toBe(1);
    expect(roundsToUnlock(p, 0)).toBe(0);
    expect(roundsToUnlock(p, 1)).toBe(2);
  });

  it("rounds at another level in between don't break a level's run", () => {
    expect(ladderProgress(4, [at(0, 1), at(0, 1), at(1, 0.9), at(0, 0.2), at(1, 0.9)]).unlocked).toBe(2);
  });

  it("stops at the top, and ignores levels the ladder doesn't have", () => {
    const rounds = [0, 0, 1, 1, 2, 2, 3, 3, 3, 3].map(l => at(l, 1));
    expect(ladderProgress(4, rounds).unlocked).toBe(3);
    expect(ladderProgress(4, [at(7, 1), at(-1, 1), at(0.5, 1)]).unlocked).toBe(0);
  });
});

describe("the chord-quality ladder", () => {
  it("uses only types chord practice knows, each level a choice of two or more", () => {
    for (const level of CHORD_EAR_LADDER.levels) {
      expect(level.options.types.length).toBeGreaterThanOrEqual(2);
      for (const t of level.options.types) expect(CHORD_PRACTICE_TYPES).toContain(t);
    }
  });

  it("no two levels play the same thing", () => {
    const keys = CHORD_EAR_LADDER.levels.map(l => `${[...l.options.types].sort()}|${l.options.inversions}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
