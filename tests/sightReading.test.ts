// Sight reading: lines of notes in a key and range, played back at the exact pitch.
import { describe, expect, it } from "vitest";
import { initialMelody, reduceMelody } from "../src/exercises/earTraining";
import {
  keyFifths, makeExcerptPrompt, makeReadingPrompt, pickReadingKey, READING_KEYS, READING_LEVEL_CHOICES, READING_RANGES, readingPool, sanitizeReadingOptions,
  type ReadingPrompt,
} from "../src/exercises/sightReading";
import { readingDrillBody } from "../src/progress/records";
import { createAppState, reduceApp } from "../src/state/app";
import { buildKey } from "../src/theory";
import {
  excerptNotes, staffStep, transposeExcerpt, tupletGroups, writtenName, type Excerpt, type ExcerptFeatures,
} from "../src/exercises/excerpts";
import { readingLoadingDisplay, sightReadingDisplay } from "../src/views/practice";

describe("reading options", () => {
  it("default to songs at level 1 in C major (4 notes on the treble staff when generated), and fall back on anything invalid", () => {
    const defaults = { level: 1, length: 4, range: "treble", key: "C:major" };
    expect(createAppState().settings.reading).toEqual(defaults);
    expect(sanitizeReadingOptions({ level: 9, length: 7, range: "alto", key: "H:major" })).toEqual(defaults);
    expect(sanitizeReadingOptions({ level: 0, length: 8, range: "grand", key: "random" }))
      .toEqual({ level: 0, length: 8, range: "grand", key: "random" });
    expect(READING_LEVEL_CHOICES).toEqual([1, 2, 3, 4, 5, 0]);
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

const FEATURES = {} as ExcerptFeatures;
/** D major, 3/4: F#4 G4 A4 (tied over) | A4 D5 rest */
const tune: Excerpt = {
  id: "1:1.0-2.1", source: 0, key: 2, time: [3, 4], clef: "treble", features: FEATURES,
  bars: [
    [{ v: "q", p: 66, s: 20 }, { v: "8", p: 67, s: 15 }, { v: "8", p: 69, s: 17 }, { v: "q", p: 69, s: 17, tie: 1 }],
    [{ v: "q", p: 69, s: 17 }, { v: "q", d: 1, p: 74, s: 16 }, { v: "8" }],
  ],
};
const SOURCE = { composer: "Franz Schubert", title: "Wiegenlied", scoreId: "1" };

describe("excerpt notes", () => {
  it("are the notes to play: rests left out, a tied note once with each event it's written as", () => {
    expect(excerptNotes(tune).map(n => [n.p, n.events])).toEqual([
      [66, [[0, 0]]], [67, [[0, 1]]], [69, [[0, 2]]], [69, [[0, 3], [1, 0]]], [74, [[1, 1]]],
    ]);
  });

  it("are named as written, the octave going with the letter", () => {
    expect(writtenName(66, 20)).toBe("F#4");
    expect(writtenName(60, 26)).toBe("B#3");
    expect(writtenName(59, 7)).toBe("Cb4");
    expect(staffStep(60, 14)).toBe(28);
  });
});

describe("transposeExcerpt", () => {
  it("moves to another signature, respelled, in the octave with the fewest ledger lines", () => {
    // D major down to C major: a whole step down keeps it on the staff
    const c = transposeExcerpt(tune, 0)!;
    expect(c.key).toBe(0);
    expect(excerptNotes(c).map(n => writtenName(n.p, n.s))).toEqual(["E4", "F4", "G4", "G4", "C5"]);
    // To E♭ major (up a semitone, not down a major 7th)
    expect(excerptNotes(transposeExcerpt(tune, -3)!).map(n => writtenName(n.p, n.s))).toEqual(["G4", "Ab4", "Bb4", "Bb4", "Eb5"]);
    // Rests and rhythm stay as they were
    expect(c.bars[1][2]).toEqual({ v: "8" });
    expect(c.bars[1][1]).toMatchObject({ v: "q", d: 1 });
  });

  it("is the same excerpt when nothing moves", () => {
    expect(transposeExcerpt(tune, 2)).toBe(tune);
  });

  it("gives up rather than write more than a double sharp or flat", () => {
    const chromatic: Excerpt = { ...tune, key: -7, bars: [[{ v: "q", p: 68, s: 22 }]] };   // G♯4: 14 fifths up would be G♯♯♯
    expect(transposeExcerpt(chromatic, 7)).toBeNull();
  });
});

describe("tupletGroups", () => {
  it("closes each group once it fills whole tuplet units", () => {
    const t: [number, number] = [3, 2];
    expect(tupletGroups([{ v: "q" }, { v: "8", t }, { v: "8", t }, { v: "8", t }, { v: "8", t }, { v: "8", t }, { v: "8", t }]))
      .toEqual([{ from: 1, to: 4, t }, { from: 4, to: 7, t }]);
    // A quarter and an 8th make a triplet of 8ths
    expect(tupletGroups([{ v: "q", t }, { v: "8", t }, { v: "h" }])).toEqual([{ from: 0, to: 2, t }]);
    expect(tupletGroups([{ v: "h" }])).toEqual([]);
  });
});

describe("song prompts", () => {
  it("are transposed into the key's signature, a note per note to play", () => {
    expect(keyFifths(buildKey("Eb:major")!)).toBe(-3);
    expect(keyFifths(buildKey("B:minor")!)).toBe(2);
    const p = makeExcerptPrompt(tune, SOURCE, 2, "A:minor")!;
    expect(p.keyValue).toBe("A:minor");
    expect(p.range).toBe("treble");
    expect(p.notes.map(n => n.name)).toEqual(["E4", "F4", "G4", "G4", "C5"]);
    expect(p.music!.events[3]).toEqual([[0, 3], [1, 0]]);
    expect(p.music!.excerpt.key).toBe(0);
  });

  it("are played back like any line, a tied note once", () => {
    const p = makeExcerptPrompt(tune, SOURCE, 2, "D:major")!;
    let s = initialMelody(p);
    for (const note of [66, 67, 69, 69, 74]) s = reduceMelody(s, { type: "play", note });
    expect(s.status).toBe("correct");
  });

  it("show the song and the key with its relative, and are recorded by level", () => {
    const p = makeExcerptPrompt(tune, SOURCE, 2, "G:major")!;
    const d = sightReadingDisplay(initialMelody(p));
    expect(d.promptHtml).toContain("Wiegenlied");
    expect(d.promptHtml).toContain("Franz Schubert");
    expect(d.sub).toBe("G major / E minor · level 2 · note 1 of 5");
    expect(readingDrillBody(p, true, true, 1000)).toEqual({
      kind: "drill", drill: "reading", prompt: "Songs, level 2",
      detail: { key: "G:major", level: 2, excerpt: "1:1.0-2.1", length: 5, notes: "B4 C5 D5 D5 G5" },
      outcome: "corrected", ms: 1000,
    });
    expect(readingLoadingDisplay(true).label).toBe("Couldn't load the songs");
  });
});
