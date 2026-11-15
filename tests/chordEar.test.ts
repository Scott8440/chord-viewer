// Ear training, chord qualities: prompts, voicing, judging answers, options and the record.
import { describe, expect, it } from "vitest";
import {
  answerOrder, chordNames, initialChordEar, makeChordEarPrompt, qualityLabel, reduceChordEar, sanitizeChordEarOptions, voiceChord,
  type ChordEarOptions,
} from "../src/exercises/chordEar";
import { chordEarDrillBody } from "../src/progress/records";
import { createAppState, reduceApp } from "../src/state/app";
import { analyze, chordSemitones } from "../src/theory";
import { chordEarDisplay } from "../src/views/practice";

/** A repeatable sequence of "random" numbers */
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
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

describe("spelling", () => {
  it("names the chord's notes from its root, in the voiced order", () => {
    expect(chordNames("Eb", "M", 0)).toEqual(["Eb", "G", "Bb"]);
    expect(chordNames("C#", "m", 1)).toEqual(["E", "G#", "C#"]);
    expect(chordNames("B", "dim7", 0)).toEqual(["B", "D", "F", "Ab"]);
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
  const p = { rootPc: 2, root: "D", type: "m", inversion: 0, notes: [50, 53, 57], names: ["D", "F", "A"] };

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

  it("buttons in the filter's order, numbered, struck through when wrong; the chord named when right", () => {
    let s = reduceChordEar(initialChordEar(p), { type: "answer", quality: "7" });
    let d = chordEarDisplay(s, ["7", "m", "M"], false, true);
    expect([...d.promptHtml.matchAll(/data-answer="([^"]+)"/g)].map(m => m[1])).toEqual(["M", "m", "7"]);
    expect(d.promptHtml).toContain('<button class="answer wrong" data-answer="7" disabled><kbd>3</kbd>');
    expect(d.feedback).toBe("✗ Not dominant seventh (7). Listen again");
    s = reduceChordEar(s, { type: "answer", quality: "m" });
    d = chordEarDisplay(s, ["7", "m", "M"], false, true);
    expect(d.feedback).toBe("✓ D minor");
    expect(d.promptHtml).toContain('class="answer right" data-answer="m"');
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
    expect(sanitizeChordEarOptions({ types: ["dim", "aug", "x"], inversions: true, broken: true }))
      .toEqual({ types: ["dim", "aug"], inversions: true, broken: true });
  });

  it("saved in settings, changed one at a time", () => {
    const s = createAppState({ earChords: { types: ["M", "m", "dim"] } });
    expect(s.settings.earChords.types).toEqual(["M", "m", "dim"]);
    const t = reduceApp(s, { type: "setEarChordOptions", options: { inversions: true } });
    expect(t.settings.earChords).toMatchObject({ types: ["M", "m", "dim"], inversions: true });
    expect(reduceApp(t, { type: "setEarChordOptions", options: { inversions: true } })).toBe(t);
  });

  it("each chord is a drill record, grouped by quality", () => {
    const r = chordEarDrillBody({ rootPc: 2, root: "D", type: "m", inversion: 1, notes: [], names: [] }, "Minor", ["M", "m"], true, false, 2300.4);
    expect(r).toEqual({ kind: "drill", drill: "chordEar", prompt: "Minor", detail: { type: "m", rootPc: 2, inversion: 1, types: "M,m" },
                        outcome: "firstTry", ms: 2300 });
  });
});
