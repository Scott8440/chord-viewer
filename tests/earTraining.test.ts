// Ear training: prompts, options and judging.
import { describe, expect, it } from "vitest";
import {
  degreeName, initialMelody, makeEarPrompt, makeMelodyPrompt, pickTonic, reduceMelody, sanitizeEarOptions, tonicMidi,
  type EarPrompt, type MelodyPrompt,
} from "../src/exercises/earTraining";
import { initialNotePractice, reduceNotePractice } from "../src/exercises/notePractice";
import { earDrillBody, melodyDrillBody } from "../src/progress/records";
import { createAppState, reduceApp } from "../src/state/app";
import { KEY_MAJORS } from "../src/theory";

const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe("tonicMidi", () => {
  it("puts every tonic between F♯3 and F4", () => {
    for (const t of KEY_MAJORS) {
      const n = tonicMidi(t);
      expect(n).toBeGreaterThanOrEqual(54);
      expect(n).toBeLessThanOrEqual(65);
    }
    expect(tonicMidi("C")).toBe(60);
    expect(tonicMidi("F#")).toBe(54);
    expect(tonicMidi("F")).toBe(65);
  });
});

describe("makeEarPrompt", () => {
  it("plays the chosen degree above the tonic, in the chosen octave, spelled in the key", () => {
    // Each pick is two rng calls: the degree (of 1 and 5), then the octave
    expect(makeEarPrompt(seq(0.9, 0), "Eb", ["1", "5"])).toEqual({ keyValue: "Eb:major", degree: "5", note: 70, pc: 10, name: "Bb" });
    expect(makeEarPrompt(seq(0.9, 0.9), "Eb", ["1", "5"])).toMatchObject({ degree: "5", note: 82 });
    expect(makeEarPrompt(seq(0), "Eb", ["1", "5"])).toMatchObject({ degree: "1", note: 63, name: "Eb" });
    expect(makeEarPrompt(seq(0), "D", ["7"])).toMatchObject({ degree: "7", note: 73, name: "C#" });
  });

  it("uses two octaves for every degree", () => {
    const notes = new Set<number>();
    let p: EarPrompt | undefined;
    for (let i = 0; i < 300; i++) { p = makeEarPrompt(Math.random, "C", ["1", "5"], p); notes.add(p.note); }
    expect([...notes].sort((a, b) => a - b)).toEqual([60, 67, 72, 79]);
  });

  it("only asks for the allowed degrees", () => {
    const seen = new Set<string>();
    let p: EarPrompt | undefined;
    for (let i = 0; i < 300; i++) { p = makeEarPrompt(Math.random, "G", ["1", "3", "5"], p); seen.add(p.degree); }
    expect([...seen].sort()).toEqual(["1", "3", "5"]);
  });

  it("never plays the same note twice in a row, but may repeat a degree in another octave", () => {
    const prev = makeEarPrompt(seq(0), "C", ["1", "5"]);   // C4
    expect(makeEarPrompt(seq(0, 0, 0, 0.9), "C", ["1", "5"], prev)).toMatchObject({ degree: "1", note: 72 });
    expect(makeEarPrompt(seq(0, 0, 0.9, 0), "C", ["1", "5"], prev)).toMatchObject({ degree: "5", note: 67 });
    // A new key may start on the same degree and octave
    expect(makeEarPrompt(seq(0), "G", ["1", "5"], prev)).toMatchObject({ degree: "1", note: 55 });
  });
});

describe("pickTonic", () => {
  it("keeps a chosen tonic and picks a different random one", () => {
    expect(pickTonic(seq(0.5), "Ab")).toBe("Ab");
    expect(pickTonic(seq(0, 0.99), "random", "C")).toBe("B");
  });
});

describe("degreeName", () => {
  it("names every semitone above the tonic", () => {
    expect([0, 3, 6, 7, 10, 11, -1, 15].map(degreeName)).toEqual(["1", "b3", "#4", "5", "b7", "7", "7", "b3"]);
  });
});

describe("options", () => {
  it("defaults to a random tonic, degrees 1 and 5, and 3-note melodies", () => {
    expect(sanitizeEarOptions(undefined)).toEqual({ tonic: "random", degrees: ["1", "5"], melodyLength: 3 });
    expect(createAppState().settings.ear).toEqual({ tonic: "random", degrees: ["1", "5"], melodyLength: 3 });
  });

  it("keeps known degrees in scale order and rejects unknown tonics and lengths", () => {
    expect(sanitizeEarOptions({ tonic: "H", degrees: ["5", "3", "9", "1"], melodyLength: 7 }))
      .toEqual({ tonic: "random", degrees: ["1", "3", "5"], melodyLength: 3 });
    expect(sanitizeEarOptions({ tonic: "F#", degrees: [], melodyLength: 5 })).toEqual({ tonic: "F#", degrees: ["1", "5"], melodyLength: 5 });
  });

  it("is set through the app reducer, ignoring no-op changes", () => {
    const s = reduceApp(createAppState(), { type: "setEarOptions", options: { degrees: ["1", "3", "5"] } });
    expect(s.settings.ear.degrees).toEqual(["1", "3", "5"]);
    expect(reduceApp(s, { type: "setEarOptions", options: { degrees: ["5", "3", "1"] } })).toBe(s);
    expect(createAppState({ ear: { tonic: "Bb", degrees: ["1", "4"] } }).settings.ear).toEqual({ tonic: "Bb", degrees: ["1", "4"], melodyLength: 3 });
    expect(reduceApp(s, { type: "setEarOptions", options: { melodyLength: 6 } }).settings.ear.melodyLength).toBe(6);
  });
});

describe("judging", () => {
  it("accepts the played note in any octave", () => {
    const p = makeEarPrompt(seq(0.9), "C", ["1", "5"]);   // G4
    let s = reduceNotePractice(initialNotePractice(p), { type: "play", note: 64 });
    expect(s).toMatchObject({ status: "wrong", missed: true });
    s = reduceNotePractice(s, { type: "play", note: 43 });
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 0, prompt: { degree: "5" } });
  });
});

describe("makeMelodyPrompt", () => {
  it("starts on the root, then the given number of in-key notes from the allowed degrees", () => {
    for (let i = 0; i < 200; i++) {
      const m = makeMelodyPrompt(Math.random, "D", ["1", "3", "5"], 4);
      expect(m.keyValue).toBe("D:major");
      expect(m.notes[0]).toEqual({ degree: "1", note: 62, pc: 2, name: "D" });
      expect(m.notes).toHaveLength(5);
      for (const n of m.notes) {
        expect(["1", "3", "5"]).toContain(n.degree);
        expect(["D", "F#", "A"]).toContain(n.name);
        expect(n.note).toBeGreaterThanOrEqual(62);
        expect(n.note).toBeLessThan(62 + 24);
        expect(n.pc).toBe(n.note % 12);
      }
    }
  });

  it("never leaps more than an octave, and never repeats a note straight away when another is in reach", () => {
    for (let i = 0; i < 200; i++) {
      const notes = makeMelodyPrompt(Math.random, "C", ["1", "2", "5", "7"], 8).notes.map(n => n.note);
      for (let j = 1; j < notes.length; j++) {
        expect(Math.abs(notes[j] - notes[j - 1])).toBeLessThanOrEqual(12);
        expect(notes[j]).not.toBe(notes[j - 1]);
      }
    }
  });

  it("repeats the only note there is", () => {
    const m = makeMelodyPrompt(seq(0), "C", ["1"], 3);
    expect(m.notes.map(n => n.note)).toEqual([60, 72, 60, 72]);
  });

  it("never gives the same melody twice running", () => {
    let prev = makeMelodyPrompt(Math.random, "C", ["1", "5"], 2);
    for (let i = 0; i < 100; i++) {
      const m = makeMelodyPrompt(Math.random, "C", ["1", "5"], 2, prev);
      expect(m.notes.map(n => n.note)).not.toEqual(prev.notes.map(n => n.note));
      prev = m;
    }
  });
});

describe("reduceMelody", () => {
  const melody: MelodyPrompt = {
    keyValue: "C:major",
    notes: [{ degree: "1", note: 60, pc: 0, name: "C" }, { degree: "5", note: 67, pc: 7, name: "G" },
            { degree: "3", note: 64, pc: 4, name: "E" }],
  };

  it("steps through the notes in order, root first, in any octave, then counts the melody right first time", () => {
    let s = reduceMelody(initialMelody(melody), { type: "play", note: 48 });
    s = reduceMelody(s, { type: "play", note: 55 });
    expect(s).toMatchObject({ index: 2, status: "waiting" });
    s = reduceMelody(s, { type: "play", note: 76 });
    expect(s).toMatchObject({ index: 3, status: "correct", answered: 1, firstTry: 1 });
    expect(reduceMelody(s, { type: "play", note: 60 })).toBe(s);
  });

  it("holds the step on a wrong note, and the melody then isn't right first time", () => {
    let s = reduceMelody(initialMelody(melody), { type: "play", note: 62 });
    expect(s).toMatchObject({ index: 0, status: "wrong", played: 62, missed: true });
    s = reduceMelody(s, { type: "play", note: 60 });
    s = reduceMelody(s, { type: "play", note: 67 });
    s = reduceMelody(s, { type: "play", note: 64 });
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 0 });
  });

  it("starts the next melody fresh, and counts a skip once", () => {
    let s = reduceMelody(initialMelody(melody), { type: "play", note: 60 });
    s = reduceMelody(s, { type: "skip", prompt: melody });
    expect(s).toMatchObject({ index: 0, status: "waiting", missed: false, answered: 1, firstTry: 0 });
    s = reduceMelody(s, { type: "next", prompt: melody });
    expect(s).toMatchObject({ index: 0, answered: 1 });
  });

  it("is recorded as a whole, grouped by length", () => {
    expect(melodyDrillBody(melody, ["1", "3", "5"], true, true, 4000)).toEqual({
      kind: "drill", drill: "melody", prompt: "Root + 2 notes",
      detail: { key: "C:major", melody: "1 5 3", length: 2, degrees: "1,3,5" }, outcome: "corrected", ms: 4000,
    });
  });
});

describe("earDrillBody", () => {
  it("records the degree as the prompt, with the key and the degrees on offer", () => {
    const p = makeEarPrompt(seq(0.9, 0), "A", ["1", "5"]);
    expect(earDrillBody(p, ["1", "5"], true, false, 1234.4)).toEqual({
      kind: "drill", drill: "ear", prompt: "Degree 5",
      detail: { degree: "5", key: "A:major", note: 64, degrees: "1,5" }, outcome: "firstTry", ms: 1234,
    });
  });
});
