// Sight reading: lines of notes in a key and range, played back at the exact pitch.
import { describe, expect, it } from "vitest";
import { initialMelody, reduceMelody } from "../src/exercises/earTraining";
import {
  makeReadingPrompt, pickReadingKey, READING_KEYS, READING_RANGES, readingPool, sanitizeReadingOptions,
  type ReadingPrompt,
} from "../src/exercises/sightReading";
import { readingDrillBody } from "../src/progress/records";
import { createAppState, reduceApp } from "../src/state/app";
import { buildKey } from "../src/theory";

describe("reading options", () => {
  it("default to 4 notes on the treble staff in C major, and fall back on anything invalid", () => {
    expect(createAppState().settings.reading).toEqual({ length: 4, range: "treble", key: "C:major" });
    expect(sanitizeReadingOptions({ length: 7, range: "alto", key: "H:major" })).toEqual({ length: 4, range: "treble", key: "C:major" });
    expect(sanitizeReadingOptions({ length: 8, range: "grand", key: "random" })).toEqual({ length: 8, range: "grand", key: "random" });
    expect(READING_KEYS).toHaveLength(25);
  });

  it("are set through the app reducer, ignoring no-op changes", () => {
    const s = reduceApp(createAppState(), { type: "setReadingOptions", options: { range: "bass" } });
    expect(s.settings.reading.range).toBe("bass");
    expect(reduceApp(s, { type: "setReadingOptions", options: { range: "bass" } })).toBe(s);
  });

  it("pick the chosen key, or a random one other than the last", () => {
    expect(pickReadingKey(Math.random, "G:minor")).toBe("G:minor");
    for (let i = 0; i < 50; i++) expect(pickReadingKey(Math.random, "random", "C:major")).not.toBe("C:major");
  });
});

describe("readingPool", () => {
  it("is the key signature's notes within the staff's range", () => {
    expect(readingPool(buildKey("C:major")!, "treble")).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81]);
    // Natural minor: no raised 7th against the signature
    expect(readingPool(buildKey("A:minor")!, "bass")).not.toContain(56);
    expect(readingPool(buildKey("D:major")!, "bass").every(n => n >= 40 && n <= 60)).toBe(true);
    expect(readingPool(buildKey("D:major")!, "bass")).toContain(42);   // F♯2
  });
});

describe("makeReadingPrompt", () => {
  it("gives a line of the right length, in the key and range, never a 6th apart or the same note twice running", () => {
    for (const range of Object.keys(READING_RANGES) as (keyof typeof READING_RANGES)[]) {
      const key = buildKey("Eb:major")!;
      const pool = readingPool(key, range);
      for (let i = 0; i < 100; i++) {
        const p = makeReadingPrompt(Math.random, "Eb:major", range, 6);
        expect(p.notes).toHaveLength(6);
        p.notes.forEach((n, j) => {
          expect(pool).toContain(n.note);
          if (j) {
            expect(n.note).not.toBe(p.notes[j - 1].note);
            expect(Math.abs(n.note - p.notes[j - 1].note)).toBeLessThanOrEqual(9);
          }
        });
      }
    }
  });

  it("names its notes in the key, with octaves", () => {
    const seq = () => 0;
    const p = makeReadingPrompt(seq, "F:major", "treble", 1);
    expect(p.notes[0]).toEqual({ note: 60, name: "C4" });
    const flat = makeReadingPrompt(Math.random, "F:major", "treble", 8).notes.find(n => n.note % 12 === 10);
    if (flat) expect(flat.name).toMatch(/^Bb\d$/);
  });

  it("never repeats the last line when it can help it", () => {
    let prev = makeReadingPrompt(Math.random, "C:major", "treble", 2);
    for (let i = 0; i < 100; i++) {
      const p = makeReadingPrompt(Math.random, "C:major", "treble", 2, prev);
      expect(p.notes.map(n => n.note)).not.toEqual(prev.notes.map(n => n.note));
      prev = p;
    }
  });
});

describe("playing a line back", () => {
  const line: ReadingPrompt = { keyValue: "C:major", range: "treble", notes: [{ note: 64, name: "E4" }, { note: 67, name: "G4" }] };

  it("needs the exact notes in order; a wrong one holds the step", () => {
    let s = reduceMelody(initialMelody(line), { type: "play", note: 79 });
    expect(s).toMatchObject({ status: "wrong", index: 0, missed: true });
    s = reduceMelody(s, { type: "play", note: 64 });
    s = reduceMelody(s, { type: "play", note: 67 });
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 0 });
  });

  it("is recorded by length and staff", () => {
    expect(readingDrillBody(line, true, false, 2400)).toEqual({
      kind: "drill", drill: "reading", prompt: "2 notes, treble",
      detail: { key: "C:major", range: "treble", length: 2, notes: "E4 G4" }, outcome: "firstTry", ms: 2400,
    });
  });
});
