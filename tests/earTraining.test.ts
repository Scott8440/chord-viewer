// Ear training: prompts, options and judging.
import { describe, expect, it } from "vitest";
import {
  degreeName, makeEarPrompt, pickTonic, sanitizeEarOptions, tonicMidi, type EarPrompt,
} from "../src/exercises/earTraining";
import { initialNotePractice, reduceNotePractice } from "../src/exercises/notePractice";
import { earDrillBody } from "../src/progress/records";
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
  it("plays the chosen degree above the tonic, spelled in the key", () => {
    // Degrees 1 and 5, the rng picks the second
    expect(makeEarPrompt(seq(0.9), "Eb", ["1", "5"])).toEqual({ keyValue: "Eb:major", degree: "5", note: 70, pc: 10, name: "Bb" });
    expect(makeEarPrompt(seq(0), "Eb", ["1", "5"])).toMatchObject({ degree: "1", note: 63, name: "Eb" });
    expect(makeEarPrompt(seq(0), "D", ["7"])).toMatchObject({ degree: "7", note: 73, name: "C#" });
  });

  it("only asks for the allowed degrees", () => {
    const seen = new Set<string>();
    let p: EarPrompt | undefined;
    for (let i = 0; i < 300; i++) { p = makeEarPrompt(Math.random, "G", ["1", "3", "5"], p); seen.add(p.degree); }
    expect([...seen].sort()).toEqual(["1", "3", "5"]);
  });

  it("never asks for the same degree twice in a row in a key, unless it's the only one", () => {
    const prev = makeEarPrompt(seq(0), "C", ["1", "5"]);
    expect(makeEarPrompt(seq(0, 0.9), "C", ["1", "5"], prev).degree).toBe("5");
    expect(makeEarPrompt(seq(0), "C", ["1"], prev).degree).toBe("1");
    // A new key may start on the same degree
    expect(makeEarPrompt(seq(0), "G", ["1", "5"], prev).degree).toBe("1");
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
  it("defaults to a random tonic with degrees 1 and 5", () => {
    expect(sanitizeEarOptions(undefined)).toEqual({ tonic: "random", degrees: ["1", "5"] });
    expect(createAppState().settings.ear).toEqual({ tonic: "random", degrees: ["1", "5"] });
  });

  it("keeps known degrees in scale order and rejects unknown tonics", () => {
    expect(sanitizeEarOptions({ tonic: "H", degrees: ["5", "3", "9", "1"] })).toEqual({ tonic: "random", degrees: ["1", "3", "5"] });
    expect(sanitizeEarOptions({ tonic: "F#", degrees: [] })).toEqual({ tonic: "F#", degrees: ["1", "5"] });
  });

  it("is set through the app reducer, ignoring no-op changes", () => {
    const s = reduceApp(createAppState(), { type: "setEarOptions", options: { degrees: ["1", "3", "5"] } });
    expect(s.settings.ear.degrees).toEqual(["1", "3", "5"]);
    expect(reduceApp(s, { type: "setEarOptions", options: { degrees: ["5", "3", "1"] } })).toBe(s);
    expect(createAppState({ ear: { tonic: "Bb", degrees: ["1", "4"] } }).settings.ear).toEqual({ tonic: "Bb", degrees: ["1", "4"] });
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

describe("earDrillBody", () => {
  it("records the degree as the prompt, with the key and the degrees on offer", () => {
    const p = makeEarPrompt(seq(0.9), "A", ["1", "5"]);
    expect(earDrillBody(p, ["1", "5"], true, false, 1234.4)).toEqual({
      kind: "drill", drill: "ear", prompt: "Degree 5",
      detail: { degree: "5", key: "A:major", note: 64, degrees: "1,5" }, outcome: "firstTry", ms: 1234,
    });
  });
});
