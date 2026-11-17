// Ear training, progressions: the numerals and levels, picking and voicing progressions, and judging chord by chord.
import { describe, expect, it } from "vitest";
import { CHORD_PRACTICE_TYPES } from "../src/exercises/chordPractice";
import {
  chordsText,
  COMMON_LOOPS,
  initialProgressionEar,
  makeProgressionEarPrompt,
  NUMERALS,
  numeralsText,
  pickNumerals,
  PROGRESSION_EAR_LADDER,
  reduceProgressionEar,
  sanitizeProgressionEarOptions,
  voiceLead,
} from "../src/exercises/progressionEar";
import { analyze } from "../src/theory";

/** A repeatable sequence of "random" numbers */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};
const spread = () => seq(...Array.from({ length: 101 }, (_, i) => (i * 0.6180339887) % 1));

describe("levels", () => {
  it("each offers numerals the drill knows, at least three, a new one at each step within a key's mode", () => {
    for (const level of PROGRESSION_EAR_LADDER.levels) {
      expect(level.options.numerals.length).toBeGreaterThanOrEqual(3);
      for (const n of level.options.numerals) expect(NUMERALS[n], n).toBeTruthy();
    }
    expect(PROGRESSION_EAR_LADDER.levels[0].options.numerals).toEqual(["I", "IV", "V"]);
  });

  it("every common loop fits some level", () => {
    for (const loop of COMMON_LOOPS)
      expect(
        PROGRESSION_EAR_LADDER.levels.some(
          l => l.options.mode === loop.mode && loop.numerals.every(n => l.options.numerals.includes(n)),
        ),
        loop.numerals.join("-"),
      ).toBe(true);
  });
});

describe("options", () => {
  it("random key, four chords, the first level unless saved otherwise; kept to what's offered", () => {
    expect(sanitizeProgressionEarOptions(undefined)).toEqual({ tonic: "random", length: 4, level: 0 });
    expect(sanitizeProgressionEarOptions({ tonic: "7", length: 6, level: 3 })).toEqual({
      tonic: "7",
      length: 6,
      level: 3,
    });
    expect(sanitizeProgressionEarOptions({ tonic: "H", length: 7, level: 99 })).toEqual({
      tonic: "random",
      length: 4,
      level: PROGRESSION_EAR_LADDER.levels.length - 1,
    });
  });
});

describe("progressions", () => {
  it("only the level's numerals, never the same chord twice running when random, the length asked for", () => {
    const rng = spread();
    for (const level of PROGRESSION_EAR_LADDER.levels)
      for (let i = 0; i < 40; i++) {
        const ns = pickNumerals(rng, level.options, 5);
        expect(ns).toHaveLength(5);
        for (const n of ns) expect(level.options.numerals).toContain(n);
      }
  });

  it("half the time a common loop, repeated to fill a longer progression", () => {
    // 0.1 < 0.5: a loop; the first loop that fits level 2 (I, IV, V, vi) is I–V–vi–IV
    expect(pickNumerals(seq(0.1, 0), PROGRESSION_EAR_LADDER.levels[1].options, 8)).toEqual([
      "I",
      "V",
      "vi",
      "IV",
      "I",
      "V",
      "vi",
      "IV",
    ]);
  });

  it("spells each chord in the key, sharps and flats as the key has them", () => {
    const c = makeProgressionEarPrompt(seq(0.1, 0), { tonic: "random", length: 4, level: 1 }, 0);
    expect(numeralsText(c)).toBe("I–V–vi–IV");
    expect(chordsText(c)).toBe("C–G–Am–F");
    expect(c.cadence.map(x => x.name)).toEqual(["C", "F", "G", "C"]);
    const e = makeProgressionEarPrompt(seq(0.1, 0), { tonic: "random", length: 4, level: 1 }, 4);
    expect(chordsText(e)).toBe("E–B–C♯m–A");
    const bb = makeProgressionEarPrompt(seq(0.1, 0), { tonic: "random", length: 4, level: 1 }, 10);
    expect(chordsText(bb)).toBe("B♭–F–Gm–E♭");
    // Minor keys: the minor cadence, with a major V
    const am = makeProgressionEarPrompt(seq(0.1, 0), { tonic: "random", length: 4, level: 6 }, 9);
    expect(am.keyValue).toBe("A:minor");
    expect(am.cadence.map(x => x.name)).toEqual(["Am", "Dm", "E", "Am"]);
    // The first minor loop that fits level 7 (no III yet) is i–iv–v–i
    expect(chordsText(am)).toBe("Am–Dm–Em–Am");
  });

  it("each chord: the root low down, the triad above, heard as that chord; the hand moves little between chords", () => {
    for (const level of [1, 5, 7])
      for (let tonicPc = 0; tonicPc < 12; tonicPc++) {
        const p = makeProgressionEarPrompt(spread(), { tonic: "random", length: 8, level }, tonicPc);
        let previous: number[] | null = null;
        for (const c of p.chords) {
          const [bass, ...upper] = c.notes;
          expect(bass).toBeGreaterThanOrEqual(40);
          expect(bass).toBeLessThanOrEqual(51);
          expect(upper[0]).toBeGreaterThanOrEqual(55);
          const a = analyze(c.notes, null);
          expect(a?.kind, c.name).toBe("chord");
          if (a?.kind === "chord") expect(CHORD_PRACTICE_TYPES).toContain(a.best.alias);
          // Each upper voice moves at most a fourth (smooth voice leading)
          if (previous) upper.forEach((n, i) => expect(Math.abs(n - previous![i])).toBeLessThanOrEqual(5));
          previous = upper;
        }
      }
  });

  it("voice leading picks the inversion nearest the chord before", () => {
    // C major (C E G from middle C) to F major: the nearest is C F A (C stays, E and G step up)
    const [, f] = voiceLead(
      seq(0),
      [
        { pc: 0, quality: "M" },
        { pc: 5, quality: "M" },
      ],
      [60, 64, 67],
    );
    expect(f.slice(1)).toEqual([60, 65, 69]);
  });

  it("never the same progression twice running", () => {
    const rng = spread();
    let previous = makeProgressionEarPrompt(rng, { tonic: "random", length: 3, level: 0 }, 0);
    for (let i = 0; i < 50; i++) {
      const p = makeProgressionEarPrompt(rng, { tonic: "random", length: 3, level: 0 }, 0, previous);
      expect(numeralsText(p)).not.toBe(numeralsText(previous));
      previous = p;
    }
  });
});

describe("judging", () => {
  const prompt = makeProgressionEarPrompt(seq(0.1, 0), { tonic: "random", length: 4, level: 1 }, 0); // I–V–vi–IV

  it("chord by chord: a right answer moves on, the last one answers the progression", () => {
    let s = initialProgressionEar(prompt);
    for (const n of ["I", "V", "vi"]) {
      s = reduceProgressionEar(s, { type: "answer", numeral: n });
      expect(s.status).toBe("waiting");
    }
    expect(s.index).toBe(3);
    s = reduceProgressionEar(s, { type: "answer", numeral: "IV" });
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 1, guesses: [] });
  });

  it("a wrong answer waits on that chord, is struck out, and is kept for the mix-ups", () => {
    let s = initialProgressionEar(prompt);
    s = reduceProgressionEar(s, { type: "answer", numeral: "I" });
    s = reduceProgressionEar(s, { type: "answer", numeral: "IV" });
    expect(s).toMatchObject({ status: "wrong", index: 1, wrong: ["IV"], guesses: ["V>IV"] });
    // The same wrong answer again changes nothing
    expect(reduceProgressionEar(s, { type: "answer", numeral: "IV" })).toBe(s);
    s = reduceProgressionEar(s, { type: "answer", numeral: "V" });
    expect(s).toMatchObject({ status: "waiting", index: 2, wrong: [] });
    for (const n of ["vi", "IV"]) s = reduceProgressionEar(s, { type: "answer", numeral: n });
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 0, guesses: ["V>IV"] });
  });

  it("moving on starts the next progression from its first chord", () => {
    let s = reduceProgressionEar(initialProgressionEar(prompt), { type: "answer", numeral: "I" });
    s = reduceProgressionEar(s, { type: "skip", prompt });
    expect(s).toMatchObject({ index: 0, wrong: [], guesses: [], answered: 1, firstTry: 0 });
  });
});
