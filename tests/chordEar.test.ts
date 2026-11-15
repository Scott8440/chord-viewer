// Ear training, chord qualities: prompts, voicing, judging answers, options and the record.
import { describe, expect, it } from "vitest";
import {
  answerOrder,
  initialChordEar,
  makeChordEarPrompt,
  qualityLabel,
  reduceChordEar,
  sanitizeChordEarOptions,
  voiceChord,
  type ChordEarOptions,
} from "../src/exercises/chordEar";
import { chordEarDrillBody } from "../src/progress/records";
import { createAppState, reduceApp } from "../src/state/app";
import { analyze, chordSemitones } from "../src/theory";
import { chordEarAnswers, chordEarDisplay } from "../src/views/practice";

/** A repeatable sequence of "random" numbers */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};
const opts: ChordEarOptions = { types: ["M", "m", "dim", "7"], inversions: false, broken: false };

describe("chord tones", () => {
  it("a chord type's semitones, optional tones included", () => {
    expect(chordSemitones("M")).toEqual([0, 4, 7]);
    expect(chordSemitones("7")).toEqual([0, 4, 7, 10]);
    expect(chordSemitones("dim7")).toEqual([0, 3, 6, 9]);
  });

  it("voicing: close above the root, inversions moving the lowest tones up an octave", () => {
    expect(voiceChord(48, "M", 0)).toEqual([48, 52, 55]);
    expect(voiceChord(48, "M", 1)).toEqual([52, 55, 60]);
    expect(voiceChord(48, "7", 3)).toEqual([58, 60, 64, 67]);
  });
});

describe("prompts", () => {
  it("one of the allowed types on a root from C3 to B3, voiced as asked, recognized as that chord", () => {
    for (let i = 0; i < 200; i++) {
      const p = makeChordEarPrompt(Math.random, { ...opts, inversions: true });
      expect(opts.types).toContain(p.type);
      expect(p.notes[0]).toBeGreaterThanOrEqual(48);
      expect(p.notes.at(-1)!).toBeLessThan(84);
      // The app's own recognizer hears the chord it meant to play
      const a = analyze(p.notes, null);
      expect(a?.kind).toBe("chord");
      if (a?.kind === "chord") expect([a.best.rootPc, a.best.alias]).toEqual([p.rootPc, p.type]);
    }
  });

  it("root position unless inversions are on", () => {
    for (let i = 0; i < 50; i++) expect(makeChordEarPrompt(Math.random, opts).inversion).toBe(0);
  });

  it("never the same chord twice running, and roots spelled as chord names usually are", () => {
    // The first draw repeats the previous chord (minor on C♯): it's drawn again
    const previous = makeChordEarPrompt(seq(0.3, 1 / 12 + 0.001), opts);
    expect(previous).toMatchObject({ type: "m", rootPc: 1, root: "C#" });
    const next = makeChordEarPrompt(seq(0.3, 1 / 12 + 0.001, 0, 1 / 12 + 0.001), opts, previous);
    expect(next).toMatchObject({ type: "M", rootPc: 1, root: "Db" });
  });
});

describe("answers", () => {
  const p = { rootPc: 2, root: "D", type: "m", inversion: 0, notes: [50, 53, 57] };

  it("right first time, or after wrong answers (each wrong answer counted once)", () => {
    let s = initialChordEar(p);
    s = reduceChordEar(s, { type: "answer", quality: "M" });
    expect(s).toMatchObject({ status: "wrong", wrong: ["M"], missed: true });
    expect(reduceChordEar(s, { type: "answer", quality: "M" })).toBe(s);
    s = reduceChordEar(s, { type: "answer", quality: "m" });
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 0 });
    expect(reduceChordEar(s, { type: "answer", quality: "dim" })).toBe(s);
    s = reduceChordEar(s, { type: "next", prompt: { ...p, type: "M" } });
    s = reduceChordEar(s, { type: "answer", quality: "M" });
    expect(s).toMatchObject({ answered: 2, firstTry: 1 });
  });

  it("a skip counts as answered, not right first time", () => {
    const s = reduceChordEar(initialChordEar(p), { type: "skip", prompt: { ...p, type: "M" } });
    expect(s).toMatchObject({ answered: 1, firstTry: 0, status: "waiting", wrong: [] });
  });

  it("boxes in the filter's order, numbered, struck through when wrong; the chord named on its box when right", () => {
    let s = reduceChordEar(initialChordEar(p), { type: "answer", quality: "7" });
    let boxes = chordEarAnswers(s, ["7", "m", "M"], true);
    expect(boxes.map(b => [b.id, b.key, b.state, b.disabled])).toEqual([
      ["M", 1, "", false],
      ["m", 2, "", false],
      ["7", 3, "wrong", true],
    ]);
    expect(boxes[2].label).toBe("Dominant seventh (7)");
    expect(chordEarDisplay(s, ["7", "m", "M"], false, true)).toMatchObject({
      promptHtml: "",
      feedback: "✗ Not dominant seventh (7). Listen again",
    });
    s = reduceChordEar(s, { type: "answer", quality: "m" });
    boxes = chordEarAnswers(s, ["7", "m", "M"], true);
    expect(boxes[1]).toMatchObject({ state: "right", detail: "D minor" });
    expect(boxes.every(b => b.disabled)).toBe(true);
    expect(chordEarDisplay(s, ["7", "m", "M"], false, true).feedback).toBe("✓ D minor");
    // Stopped: nothing can be pressed
    expect(chordEarAnswers(initialChordEar(p), ["M", "m"], false).every(b => b.disabled)).toBe(true);
  });

  it("labels and order", () => {
    expect(qualityLabel("M")).toBe("Major");
    expect(qualityLabel("m7b5")).toBe("Half-diminished (m7b5)");
    expect(answerOrder(["m7", "aug", "M"])).toEqual(["M", "aug", "m7"]);
  });
});

describe("options", () => {
  it("at least two known types, else major and minor; inversions and broken off unless set", () => {
    expect(sanitizeChordEarOptions(undefined)).toEqual({ types: ["M", "m"], inversions: false, broken: false });
    expect(sanitizeChordEarOptions({ types: ["dim", "nonsense"] }).types).toEqual(["M", "m"]);
    expect(sanitizeChordEarOptions({ types: ["dim", "aug", "x"], inversions: true, broken: true })).toEqual({
      types: ["dim", "aug"],
      inversions: true,
      broken: true,
    });
  });

  it("saved in settings, changed one at a time", () => {
    const s = createAppState({ earChords: { types: ["M", "m", "dim"] } });
    expect(s.settings.earChords.types).toEqual(["M", "m", "dim"]);
    const t = reduceApp(s, { type: "setEarChordOptions", options: { inversions: true } });
    expect(t.settings.earChords).toMatchObject({ types: ["M", "m", "dim"], inversions: true });
    expect(reduceApp(t, { type: "setEarChordOptions", options: { inversions: true } })).toBe(t);
  });

  it("each chord is a drill record, grouped by quality", () => {
    const r = chordEarDrillBody(
      { rootPc: 2, root: "D", type: "m", inversion: 1, notes: [] },
      "Minor",
      ["M", "m"],
      true,
      false,
      2300.4,
    );
    expect(r).toEqual({
      kind: "drill",
      drill: "chordEar",
      prompt: "Minor",
      detail: { type: "m", rootPc: 2, inversion: 1, types: "M,m", guesses: "" },
      outcome: "firstTry",
      ms: 2300,
    });
    // The wrong answers given first, in order: what it was mistaken for
    const missed = chordEarDrillBody(
      { rootPc: 0, root: "C", type: "aug", inversion: 0, notes: [] },
      "Augmented",
      ["M", "m", "aug", "7"],
      true,
      true,
      5000,
      ["M", "7"],
    );
    expect(missed).toMatchObject({ outcome: "corrected", detail: { guesses: "M,7" } });
  });
});
