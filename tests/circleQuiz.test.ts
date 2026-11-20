// Theory quiz, the circle of fifths: filling in the circle from one given key.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CIRCLE_QUIZ,
  fifthsFromAnchor,
  initialCircleQuiz,
  keyAt,
  makeCirclePrompt,
  newCircleRound,
  reduceCircleQuiz,
  ringKeys,
  roundDone,
  sanitizeCircleQuizOptions,
  spotOf,
  type CircleQuizState,
  type CircleRound,
} from "../src/exercises/circleQuiz";
import { chromaOf } from "../src/theory";

const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
/** G major given at the bottom (spot 6) */
const round: CircleRound = { ring: "major", anchorSpot: 6, anchorKey: 1 };
const prompt = (ask: "where" | "which", spot: number) => ({ round, ask, spot, choices: [] });

describe("circle of fifths quiz", () => {
  it("places the keys clockwise a fifth apart from the given one, wherever it is", () => {
    expect(ringKeys("major")[keyAt(round, 6)]).toBe("G");
    expect(ringKeys("major")[keyAt(round, 7)]).toBe("D"); // a fifth up, clockwise
    expect(ringKeys("major")[keyAt(round, 5)]).toBe("C"); // a fifth down, anticlockwise
    expect(ringKeys("major")[keyAt(round, 0)]).toBe("Db"); // opposite G
    for (let s = 0; s < 12; s++) expect(spotOf(round, keyAt(round, s))).toBe(s);
    expect(fifthsFromAnchor(round, 8)).toBe(2);
    expect(fifthsFromAnchor(round, 1)).toBe(-5);
  });

  it("where: a wrong spot is kept once, the right one fills it in; filled spots aren't answers", () => {
    let s = initialCircleQuiz(prompt("where", 9)); // where does E go? three fifths up from G
    s = reduceCircleQuiz(s, { type: "spot", spot: 6 }); // the given key's spot: not an answer
    expect(s.status).toBe("waiting");
    s = reduceCircleQuiz(s, { type: "spot", spot: 8 });
    s = reduceCircleQuiz(s, { type: "spot", spot: 8 });
    expect(s).toMatchObject({ status: "wrong", tried: [8] });
    s = reduceCircleQuiz(s, { type: "key", key: 4 }); // a key isn't an answer to where
    expect(s.tried).toEqual([8]);
    s = reduceCircleQuiz(s, { type: "spot", spot: 9 });
    expect(s).toMatchObject({ status: "correct", filled: [6, 9], answered: 1, firstTry: 0 });
  });

  it("which: answered from the board or by playing the tonic in any octave", () => {
    let s = initialCircleQuiz(prompt("which", 4)); // two fifths below G: F
    s = reduceCircleQuiz(s, { type: "key", key: 0 }); // C
    expect(s).toMatchObject({ status: "wrong", tried: [0] });
    s = reduceCircleQuiz(s, { type: "play", note: 41 }); // F2
    expect(s).toMatchObject({ status: "correct", filled: [6, 4] });
    // Minor ring: the tonic of the minor key
    const minor: CircleRound = { ring: "minor", anchorSpot: 0, anchorKey: 0 }; // A minor at the top
    let m = initialCircleQuiz({ round: minor, ask: "which", spot: 1, choices: [] }); // E minor
    m = reduceCircleQuiz(m, { type: "play", note: 64 });
    expect(m.status).toBe("correct");
  });

  it("a skip fills the spot in as revealed; every prompt is a spot still open; a full circle starts a new round", () => {
    const rng = seeded(3);
    const o = DEFAULT_CIRCLE_QUIZ;
    let s: CircleQuizState = initialCircleQuiz(makeCirclePrompt(rng, o, newCircleRound(rng, "major"), []));
    const first = s.prompt.round;
    for (let i = 0; i < 11; i++) {
      expect(s.filled).not.toContain(s.prompt.spot);
      s = reduceCircleQuiz(s, {
        type: "skip",
        prompt: makeCirclePrompt(rng, o, s.prompt.round, [...s.filled, s.prompt.spot]),
      });
      if (i < 10) expect(s.prompt.round).toBe(first);
    }
    // The twelfth skip filled the last spot, so the prompt made after it is a new round
    expect(s.prompt.round).not.toBe(first);
    expect(s.filled).toEqual([s.prompt.round.anchorSpot]);
    expect(s.revealed).toEqual([]);
    expect(s.answered).toBe(11);
  });

  it("asks only where or only which when chosen, and starts a new round when the ring changes", () => {
    const rng = seeded(5);
    for (let i = 0; i < 10; i++) {
      expect(makeCirclePrompt(rng, { ring: "major", asks: "where" }, round, [6]).ask).toBe("where");
      expect(makeCirclePrompt(rng, { ring: "major", asks: "which" }, round, [6]).ask).toBe("which");
    }
    expect(makeCirclePrompt(rng, { ring: "minor", asks: "mixed" }, round, [6]).round.ring).toBe("minor");
    const done = { ...initialCircleQuiz(prompt("where", 9)), filled: Array.from({ length: 12 }, (_, i) => i) };
    expect(roundDone(done)).toBe(true);
  });

  it("ring keys are the twelve tonics, a fifth apart", () => {
    for (const ring of ["major", "minor"] as const) {
      const keys = ringKeys(ring);
      for (let i = 0; i < 12; i++) expect((chromaOf(keys[(i + 1) % 12]) - chromaOf(keys[i]) + 12) % 12).toBe(7);
    }
  });

  it("falls back on the defaults for anything not offered", () => {
    expect(sanitizeCircleQuizOptions(undefined)).toEqual(DEFAULT_CIRCLE_QUIZ);
    expect(sanitizeCircleQuizOptions({ ring: "dorian", asks: "why" })).toEqual(DEFAULT_CIRCLE_QUIZ);
    expect(sanitizeCircleQuizOptions({ ring: "minor", asks: "which" })).toEqual({ ring: "minor", asks: "which" });
  });
});
