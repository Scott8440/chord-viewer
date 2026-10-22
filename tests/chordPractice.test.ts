// Chord practice exercise: prompts, the type filter and judging held chords.
import { describe, expect, it } from "vitest";
import {
  CHORD_PRACTICE_TYPES, initialChordPractice, isChord, makeChordPrompt, reduceChordPractice, sanitizeChordTypes,
  type ChordPracticeAction, type ChordPracticeState, type ChordPrompt,
} from "../src/exercises/chordPractice";
import { createAppState, reduceApp } from "../src/state/app";
import { buildKey, templateById } from "../src/theory";

const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };
const Cmaj7: ChordPrompt = { rootPc: 0, root: "C", type: "maj7" };
const run = (s: ChordPracticeState, ...actions: ChordPracticeAction[]) => actions.reduce((x, a) => reduceChordPractice(x, a), s);
const held = (...notes: number[]): ChordPracticeAction => ({ type: "held", notes });

describe("chord types", () => {
  it("every practice type is a known chord template", () => {
    for (const id of CHORD_PRACTICE_TYPES) expect(templateById(id), id).toBeDefined();
  });

  it("sanitizing keeps known types in display order and never returns an empty list", () => {
    expect(sanitizeChordTypes(["maj7", "bogus", "M"])).toEqual(["M", "maj7"]);
    expect(sanitizeChordTypes([])).toEqual(["M", "m"]);
    expect(sanitizeChordTypes(["13"])).toEqual(["M", "m"]);   // a template, but not offered for practice
  });

  it("app settings default to major and minor and accept a new filter", () => {
    const s = createAppState();
    expect(s.settings.chordTypes).toEqual(["M", "m"]);
    expect(reduceApp(s, { type: "setChordTypes", types: ["maj7", "M"] }).settings.chordTypes).toEqual(["M", "maj7"]);
  });
});

describe("makeChordPrompt", () => {
  it("only uses the allowed types", () => {
    const seen = new Set<string>();
    let p: ChordPrompt | undefined;
    for (let i = 0; i < 300; i++) { p = makeChordPrompt(Math.random, ["M", "maj7"], null, p); seen.add(p.type); }
    expect([...seen].sort()).toEqual(["M", "maj7"]);
  });

  it("spells roots conventionally without a key, and from the key with one", () => {
    expect(makeChordPrompt(seq(1 / 12, 0), ["M"], null).root).toBe("Db");
    expect(makeChordPrompt(seq(1 / 12, 0), ["m"], null).root).toBe("C#");
    expect(makeChordPrompt(seq(6 / 12, 0), ["M"], buildKey("Db:major")).root).toBe("Gb");
  });

  it("never repeats the same chord", () => {
    const p = makeChordPrompt(seq(0, 0, 0, 0, 2 / 12, 0), ["maj7"], null, Cmaj7);
    expect(p).toMatchObject({ rootPc: 2, type: "maj7" });
  });
});

describe("isChord", () => {
  it("accepts any voicing, inversion or octave, with doubled notes", () => {
    expect(isChord([48, 52, 55, 59], Cmaj7)).toBe(true);           // close
    expect(isChord([40, 55, 59, 60, 64], Cmaj7)).toBe(true);       // first inversion, doubled E
    expect(isChord([36, 59, 64, 67, 72], Cmaj7)).toBe(true);       // spread
  });

  it("rejects missing or extra tones, and by default a left-out 5th", () => {
    expect(isChord([48, 52, 55], Cmaj7)).toBe(false);              // no 7th
    expect(isChord([48, 52, 55, 59, 62], Cmaj7)).toBe(false);      // extra D
    expect(isChord([48, 52, 59], Cmaj7)).toBe(false);              // no 5th
    expect(isChord([48, 52, 59], Cmaj7, { allowOmissions: true })).toBe(true);
    expect(isChord([], Cmaj7)).toBe(false);
  });
});

describe("reduceChordPractice", () => {
  const start = initialChordPractice(Cmaj7);

  it("is correct as soon as the held keys form the chord, even rolled", () => {
    const s = run(start, held(48), held(48, 52), held(48, 52, 55), held(48, 52, 55, 59));
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 1, attempt: [48, 52, 55, 59] });
  });

  it("judges a wrong attempt when every key is released, using the fullest set held", () => {
    let s = run(start, held(48, 52, 55), held(52, 55), held());
    expect(s).toMatchObject({ status: "wrong", attempt: [48, 52, 55], missed: true, answered: 0 });
    s = run(s, held(48, 52, 55, 59));
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 0 });
  });

  it("does not judge until keys are released, so a chord can be fixed while held", () => {
    const s = run(start, held(48, 52, 55, 58), held(48, 52, 55), held(48, 52, 55, 59));
    expect(s).toMatchObject({ status: "correct", firstTry: 1 });
  });

  it("ignores input after a correct answer", () => {
    const s = run(start, held(48, 52, 55, 59));
    expect(reduceChordPractice(s, held())).toBe(s);
  });

  it("waits for all keys up when a new prompt appears while keys are held", () => {
    let s = run(start, held(48, 52, 55, 59), { type: "next", prompt: { rootPc: 0, root: "C", type: "M" }, held: [48, 52, 55, 59] });
    expect(s).toMatchObject({ status: "waiting", waitForRelease: true, answered: 1, firstTry: 1 });
    s = run(s, held(48, 52, 55));                 // still holding: ignored, even though it is C major
    expect(s.status).toBe("waiting");
    s = run(s, held(), held(48, 52, 55));
    expect(s).toMatchObject({ status: "correct", answered: 2, firstTry: 2 });
  });

  it("counts a skip as answered but not right first time", () => {
    const s = run(start, { type: "skip", prompt: { rootPc: 2, root: "D", type: "M" }, held: [] });
    expect(s).toMatchObject({ prompt: { rootPc: 2 }, status: "waiting", answered: 1, firstTry: 0 });
  });
});
