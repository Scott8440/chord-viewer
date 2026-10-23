// Chord practice's key option: none, random every few prompts, or one key's diatonic chords.
import { describe, expect, it } from "vitest";
import { CHORD_KEYS, pickChordKey, sanitizeChordKey } from "../src/exercises/chordPractice";
import { diatonicChords, makeDiatonicNamePrompt } from "../src/exercises/romanPrompts";
import { chordDrillBody } from "../src/progress/records";
import { createAppState, reduceApp } from "../src/state/app";
import { buildKey } from "../src/theory";

const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe("chord key option", () => {
  it("offers none, random and the 24 keys, defaulting to none", () => {
    expect(CHORD_KEYS.slice(0, 3)).toEqual(["none", "random", "C:major"]);
    expect(CHORD_KEYS).toHaveLength(26);
    expect(sanitizeChordKey("Q:major")).toBe("none");
    expect(sanitizeChordKey("F#:minor")).toBe("F#:minor");
    expect(createAppState().settings.chordKey).toBe("none");
    expect(createAppState({ chordKey: "random" }).settings.chordKey).toBe("random");
  });

  it("is set through the app reducer, ignoring no-op changes", () => {
    const s = reduceApp(createAppState(), { type: "setChordKey", value: "Eb:major" });
    expect(s.settings.chordKey).toBe("Eb:major");
    expect(reduceApp(s, { type: "setChordKey", value: "Eb:major" })).toBe(s);
  });

  it("picks no key for none, the chosen key, or a random key other than the last", () => {
    expect(pickChordKey(seq(0.5), "none")).toBeNull();
    expect(pickChordKey(seq(0.5), "G:minor")).toBe("G:minor");
    expect(pickChordKey(seq(0, 0.5), "random", "C:major")).not.toBe("C:major");
  });
});

describe("makeDiatonicNamePrompt", () => {
  it("asks for a diatonic chord of the key by name, spelled in the key", () => {
    const key = buildKey("Bb:major")!;
    const diatonic = diatonicChords(key).map(c => c.root + c.type);
    for (let i = 0; i < 200; i++) {
      const p = makeDiatonicNamePrompt(Math.random, ["M", "m", "dim", "7"], key);
      expect(p.roman).toBeUndefined();
      expect(p.inKey).toEqual({ keyValue: "Bb:major", filterIgnored: false });
      expect(diatonic).toContain(p.root + p.type);
    }
  });

  it("falls back to any diatonic triad, flagged, when no selected type is in the key", () => {
    const p = makeDiatonicNamePrompt(Math.random, ["aug"], buildKey("C:major")!);
    expect(p.inKey!.filterIgnored).toBe(true);
    expect(["M", "m", "dim"]).toContain(p.type);
  });

  it("records the key it was drawn from", () => {
    const p = makeDiatonicNamePrompt(seq(0), ["M"], buildKey("D:major")!);
    expect(chordDrillBody(p, true, false, 1000)).toMatchObject({ prompt: "D", detail: { key: "D:major", style: "names" } });
  });
});
