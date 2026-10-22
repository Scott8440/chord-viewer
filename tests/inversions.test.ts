// Chord practice with a required inversion.
import { describe, expect, it } from "vitest";
import {
  initialChordPractice, inversionTones, isChord, makeRomanPrompt, reduceChordPractice, withInversion,
  type ChordPracticeAction, type ChordPracticeState, type ChordPrompt,
} from "../src/exercises/chordPractice";
import { createAppState, reduceApp } from "../src/state/app";
import { buildKey } from "../src/theory";
import { chordPracticeDisplay, inversionFigures } from "../src/views/practice";

const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };
const run = (s: ChordPracticeState, ...actions: ChordPracticeAction[]) => actions.reduce((x, a) => reduceChordPractice(x, a), s);
const held = (...notes: number[]): ChordPracticeAction => ({ type: "held", notes });
const Cmaj7: ChordPrompt = { rootPc: 0, root: "C", type: "maj7" };
/** n-th inversion of a prompt (rng picks index n of the inversion tones) */
const inv = (p: ChordPrompt, n: number) => withInversion(seq((n + 0.5) / inversionTones(p.type).length), p);

describe("inversionTones", () => {
  it("lists the possible bass notes in inversion order, without 9ths", () => {
    const degrees = (type: string) => inversionTones(type).map(t => t.degree);
    expect(degrees("M")).toEqual([1, 3, 5]);
    expect(degrees("maj7")).toEqual([1, 3, 5, 7]);
    expect(degrees("sus4")).toEqual([1, 4, 5]);
    expect(degrees("m9")).toEqual([1, 3, 5, 7]);
    expect(degrees("add9")).toEqual([1, 3, 5]);
  });
});

describe("withInversion", () => {
  it("spells the bass as a chord tone of the prompt", () => {
    expect(inv(Cmaj7, 0).inversion).toEqual({ number: 0, bass: "C", bassPc: 0 });
    expect(inv(Cmaj7, 1).inversion).toEqual({ number: 1, bass: "E", bassPc: 4 });
    expect(inv(Cmaj7, 3).inversion).toEqual({ number: 3, bass: "B", bassPc: 11 });
    expect(inv({ rootPc: 3, root: "Eb", type: "m" }, 1).inversion?.bass).toBe("Gb");
  });
});

describe("isChord with an inversion", () => {
  it("needs the required bass as the lowest note; the rest can be voiced freely", () => {
    const first = inv(Cmaj7, 1);
    expect(isChord([40, 48, 55, 59], first)).toBe(true);        // E C G B
    expect(isChord([40, 55, 59, 60, 64], first)).toBe(true);    // E G B C E
    expect(isChord([48, 52, 55, 59], first)).toBe(false);       // root position
    expect(isChord([48, 52, 55, 59], inv(Cmaj7, 0))).toBe(true);
    expect(isChord([48, 52, 55, 59], Cmaj7)).toBe(true);        // no inversion asked: anything goes
  });

  it("is only correct once the bass is right", () => {
    const s = run(initialChordPractice(inv(Cmaj7, 2)), held(48, 52, 55, 59), held(52, 55, 59), held(43, 52, 55, 59, 60));
    expect(s.status).toBe("correct");
  });
});

describe("inversion display and feedback", () => {
  const wrongAfter = (prompt: ChordPrompt, notes: number[]) =>
    chordPracticeDisplay(run(initialChordPractice(prompt), held(...notes), held()), null).feedback;

  it("shows slash chords and names the inversion", () => {
    const d = chordPracticeDisplay(initialChordPractice(inv(Cmaj7, 1)), null);
    expect(d.promptHtml).toContain('<span class="bass">/E</span>');
    expect(d.sub).toBe("C major seventh · 1st inversion");
    expect(d.label).toBe("Play this chord, with this note in the bass");
    const root = chordPracticeDisplay(initialChordPractice(inv(Cmaj7, 0)), null);
    expect(root.promptHtml).not.toContain('class="bass"');
    expect(root.sub).toBe("C major seventh · root position");
  });

  it("says when only the bass is wrong", () => {
    expect(wrongAfter(inv(Cmaj7, 1), [48, 52, 55, 59])).toBe("✗ Right notes, wrong bass. Put E in the bass");
  });

  it("adds the bass to the other fixes", () => {
    expect(wrongAfter(inv({ rootPc: 0, root: "C", type: "m" }, 1), [48, 52, 55]))
      .toBe("✗ That was C. Replace E with E♭ and put E♭ in the bass");
  });

  it("uses figured bass for Roman numerals", () => {
    expect(inversionFigures(false, 0)).toEqual([]);
    expect(inversionFigures(false, 2)).toEqual(["6", "4"]);
    expect(inversionFigures(true, 1)).toEqual(["6", "5"]);
    expect(inversionFigures(true, 3)).toEqual(["4", "2"]);
    const V7inG = makeRomanPrompt(seq(0.5), ["7"], buildKey("G:major"));
    const d = chordPracticeDisplay(initialChordPractice(inv(V7inG, 1)), null);
    expect(d.promptHtml).toBe('V<span class="fig"><span>6</span><span>5</span></span>');
    expect(d.sub).toBe("in G major · 1st inversion");
    const imaj7 = makeRomanPrompt(seq(0.5), ["maj7"], buildKey("C:major"));   // Imaj7 or IVmaj7
    expect(chordPracticeDisplay(initialChordPractice(inv(imaj7, 2)), null).promptHtml)
      .toMatch(/^I(V)?<span class="ext">maj<\/span><span class="fig"><span>4<\/span><span>3<\/span><\/span>$/);
    const done = run(initialChordPractice(inv(V7inG, 1)), held(42, 50, 57, 60));    // F# D A C
    expect(chordPracticeDisplay(done, null).feedback).toBe("✓ D7/F♯");
  });

  it("is a setting", () => {
    const s = createAppState();
    expect(s.settings.inversions).toBe(false);
    expect(reduceApp(s, { type: "setInversions", on: true }).settings.inversions).toBe(true);
  });
});
