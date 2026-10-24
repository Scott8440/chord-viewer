// Sight reading: generated lines and passages from songs (melody or piano), played back at the exact pitch, a note
// or a chord at a time.
import { describe, expect, it } from "vitest";
import {
  staffStep, transposeStaves, tupletGroups, writtenName, type Excerpt, type ExcerptFeatures, type ExcerptStaff,
} from "../src/exercises/excerpts";
import {
  excerptLevel, initialReading, keyFifths, makeExcerptPrompt, makeReadingPrompt, pickReadingKey, READING_KEYS,
  READING_LEVEL_CHOICES, READING_RANGES, readingPool, reduceReading, sanitizeReadingOptions, type ReadingPrompt,
} from "../src/exercises/sightReading";
import { musicOf } from "../src/modes/sightReading";
import { readingDrillBody } from "../src/progress/records";
import { createAppState, reduceApp } from "../src/state/app";
import { buildKey } from "../src/theory";
import { readingLoadingDisplay, sightReadingDisplay } from "../src/views/practice";

const notesOf = (p: ReadingPrompt) => p.steps.map(s => s.map(n => n.note));
const namesOf = (p: ReadingPrompt) => p.steps.map(s => s.map(n => n.name).join("+"));

describe("reading options", () => {
  it("default to the melody at level 1 in C major (4 notes on the treble staff when generated), and fall back on anything invalid", () => {
    const defaults = { level: 1, part: "voice", length: 4, range: "treble", key: "C:major" };
    expect(createAppState().settings.reading).toEqual(defaults);
    expect(sanitizeReadingOptions({ level: 9, part: "feet", length: 7, range: "alto", key: "H:major" })).toEqual(defaults);
    expect(sanitizeReadingOptions({ level: 0, part: "both", length: 8, range: "grand", key: "random" }))
      .toEqual({ level: 0, part: "both", length: 8, range: "grand", key: "random" });
    expect(READING_LEVEL_CHOICES).toEqual([1, 2, 3, 4, 5, 0]);
    expect(READING_KEYS).toHaveLength(25);
  });

  it("are set through the app reducer, ignoring no-op changes", () => {
    const s = reduceApp(createAppState(), { type: "setReadingOptions", options: { range: "bass" } });
    expect(s.settings.reading.range).toBe("bass");
    expect(reduceApp(s, { type: "setReadingOptions", options: { range: "bass" } })).toBe(s);
    expect(reduceApp(s, { type: "setReadingOptions", options: { part: "lh" } }).settings.reading.part).toBe("lh");
  });

  it("pick the chosen key, or a random one other than the last", () => {
    expect(pickReadingKey(Math.random, "G:minor")).toBe("G:minor");
    for (let i = 0; i < 50; i++) expect(pickReadingKey(Math.random, "random", "C:major")).not.toBe("C:major");
  });
});

describe("generated lines", () => {
  it("draw from the key signature's notes within the staff's range", () => {
    expect(readingPool(buildKey("C:major")!, "treble")).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81]);
    // Natural minor: no raised 7th against the signature
    expect(readingPool(buildKey("A:minor")!, "bass")).not.toContain(56);
    expect(readingPool(buildKey("D:major")!, "bass")).toContain(42);   // F♯2
  });

  it("are the right length, in the key and range, never a 6th apart or the same note twice running", () => {
    for (const range of Object.keys(READING_RANGES) as (keyof typeof READING_RANGES)[]) {
      const pool = readingPool(buildKey("Eb:major")!, range);
      for (let i = 0; i < 100; i++) {
        const notes = notesOf(makeReadingPrompt(Math.random, "Eb:major", range, 6)).map(s => s[0]);
        expect(notes).toHaveLength(6);
        notes.forEach((n, j) => {
          expect(pool).toContain(n);
          if (j) {
            expect(n).not.toBe(notes[j - 1]);
            expect(Math.abs(n - notes[j - 1])).toBeLessThanOrEqual(9);
          }
        });
      }
    }
  });

  it("name their notes in the key, with octaves, and never repeat the last line", () => {
    expect(makeReadingPrompt(() => 0, "F:major", "treble", 1).steps[0]).toEqual([{ note: 60, name: "C4" }]);
    let prev = makeReadingPrompt(Math.random, "C:major", "treble", 2);
    for (let i = 0; i < 100; i++) {
      const p = makeReadingPrompt(Math.random, "C:major", "treble", 2, prev);
      expect(notesOf(p)).not.toEqual(notesOf(prev));
      prev = p;
    }
  });
});

describe("playing it back", () => {
  const line: ReadingPrompt = { keyValue: "C:major", range: "treble", steps: [[{ note: 64, name: "E4" }], [{ note: 67, name: "G4" }]] };

  it("needs the exact notes in order; a wrong one holds the step", () => {
    let s = reduceReading(initialReading(line), { type: "play", note: 79 });
    expect(s).toMatchObject({ status: "wrong", index: 0, missed: true });
    s = reduceReading(s, { type: "play", note: 64 });
    s = reduceReading(s, { type: "play", note: 67 });
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 0 });
  });

  it("takes a chord's notes in any order, keeping what was struck through a wrong note", () => {
    const chords: ReadingPrompt = { ...line, steps: [[{ note: 60, name: "C4" }, { note: 64, name: "E4" }, { note: 67, name: "G4" }], line.steps[1]] };
    let s = reduceReading(initialReading(chords), { type: "play", note: 67 });
    s = reduceReading(s, { type: "play", note: 67 });
    expect(s).toMatchObject({ index: 0, struck: [67], status: "waiting" });
    s = reduceReading(s, { type: "play", note: 65 });
    expect(s).toMatchObject({ index: 0, struck: [67], status: "wrong" });
    s = reduceReading(s, { type: "play", note: 60 });
    s = reduceReading(s, { type: "play", note: 64 });
    expect(s).toMatchObject({ index: 1, struck: [], status: "waiting" });
    expect(sightReadingDisplay(reduceReading(s, { type: "play", note: 72 })).feedback).toBe("✗ That was C5. Try again");
  });

  it("is recorded by length and staff", () => {
    expect(readingDrillBody(line, true, false, 2400)).toEqual({
      kind: "drill", drill: "reading", prompt: "2 notes, treble",
      detail: { key: "C:major", range: "treble", length: 2, notes: "E4 G4" }, outcome: "firstTry", ms: 2400,
    });
  });
});

const FEATURES: ExcerptFeatures = {
  notes: 5, bars: 2, keyAccidentals: 2, chromatic: 0, range: 8, ledger: 0, maxLeap: 5, stepShare: 0.75, values: 2,
  shortest: 1 / 8, dotted: 0, ties: 0, tuplets: 0, rests: 0, syncopations: 0, compound: false, chord: 1, span: 0, voices: 1,
};
/** D major, 3/4: F#4 G4 A4 (tied over) | A4 D5 rest */
const tune: Excerpt = {
  id: "1:1.0-2.1", source: 0, key: 2, time: [3, 4], parts: { voice: FEATURES },
  staves: [{ clef: "treble", voices: [[
    [{ v: "q", n: [{ p: 66, s: 20 }] }, { v: "8", n: [{ p: 67, s: 15 }] }, { v: "8", n: [{ p: 69, s: 17 }] }, { v: "q", n: [{ p: 69, s: 17, tie: 1 }] }],
    [{ v: "q", n: [{ p: 69, s: 17 }] }, { v: "q", d: 1, n: [{ p: 74, s: 16 }] }, { v: "8" }],
  ]] }],
};
const SOURCE = { composer: "Franz Schubert", title: "Wiegenlied", scoreId: "1" };

describe("transposeStaves", () => {
  const spelled = (staves: ExcerptStaff[]) => staves[0].voices[0].flat().flatMap(e => e.n ?? []).map(n => writtenName(n.p, n.s));

  it("moves to another signature, respelled, in the octave with the fewest ledger lines", () => {
    // D major down to C major: a whole step down keeps it on the staff
    expect(spelled(transposeStaves(tune.staves, 2, 0)!)).toEqual(["E4", "F4", "G4", "G4", "G4", "C5"]);
    // To E♭ major (up a semitone, not down a major 7th)
    expect(spelled(transposeStaves(tune.staves, 2, -3)!)).toEqual(["G4", "Ab4", "Bb4", "Bb4", "Bb4", "Eb5"]);
    // Rests and rhythm stay as they were
    const c = transposeStaves(tune.staves, 2, 0)!;
    expect(c[0].voices[0][1][2]).toEqual({ v: "8" });
    expect(c[0].voices[0][1][1]).toMatchObject({ v: "q", d: 1 });
  });

  it("gives up rather than write more than a double sharp or flat", () => {
    const sharp: ExcerptStaff[] = [{ clef: "treble", voices: [[[{ v: "q", n: [{ p: 68, s: 22 }] }]]] }];   // G♯4
    expect(transposeStaves(sharp, -7, 7)).toBeNull();
  });

  it("names notes as written, the octave going with the letter", () => {
    expect(writtenName(66, 20)).toBe("F#4");
    expect(writtenName(60, 26)).toBe("B#3");
    expect(writtenName(59, 7)).toBe("Cb4");
    expect(staffStep(60, 14)).toBe(28);
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
  it("are transposed into the key's signature, a step per note struck (a tied note once)", () => {
    expect(keyFifths(buildKey("Eb:major")!)).toBe(-3);
    expect(keyFifths(buildKey("B:minor")!)).toBe(2);
    const p = makeExcerptPrompt(tune, SOURCE, "voice", 2, "A:minor")!;
    expect(p).toMatchObject({ keyValue: "A:minor", range: "treble" });
    expect(namesOf(p)).toEqual(["E4", "F4", "G4", "G4", "C5"]);
    expect(p.music!.stepOf[0][0]).toEqual([[0, 1, 2, 3], [3, 4, -1]]);
    expect(excerptLevel(tune, "voice")).toBe(2);   // a 4th and a range over a 5th: past level 1
    expect(excerptLevel(tune, "rh")).toBe(0);
  });

  it("are played back like any line, and coloured as they're played", () => {
    let s = initialReading(makeExcerptPrompt(tune, SOURCE, "voice", 2, "D:major")!);
    for (const note of [66, 67, 69]) s = reduceReading(s, { type: "play", note });
    s = reduceReading(s, { type: "play", note: 50 });
    const styles = musicOf(s).styles[0][0];
    expect(styles[0].map(e => e[0])).toEqual(["done", "done", "done", "wrong"]);
    expect(styles[1].map(e => e[0])).toEqual(["wrong", undefined, undefined]);
    for (const note of [69, 74]) s = reduceReading(s, { type: "play", note });
    expect(s.status).toBe("correct");
  });

  it("show the song and the key with its relative, and are recorded by part and level", () => {
    const p = makeExcerptPrompt(tune, SOURCE, "voice", 2, "G:major")!;
    const d = sightReadingDisplay(initialReading(p));
    expect(d.promptHtml).toContain("Wiegenlied");
    expect(d.promptHtml).toContain("Franz Schubert");
    expect(d.sub).toBe("G major / E minor · level 2 · note 1 of 5");
    expect(readingDrillBody(p, true, true, 1000)).toEqual({
      kind: "drill", drill: "reading", prompt: "Songs, level 2",
      detail: { key: "G:major", part: "voice", level: 2, excerpt: "1:1.0-2.1", length: 5, notes: "B4 C5 D5 D5 G5" },
      outcome: "corrected", ms: 1000,
    });
    expect(readingLoadingDisplay(true).label).toBe("Couldn't load the songs");
  });

  it("read a piano hand, or both hands together as one step per moment", () => {
    const piano: Excerpt = {
      id: "2:1-1", source: 0, key: 0, time: [2, 4], parts: { rh: FEATURES, lh: FEATURES, both: FEATURES },
      staves: [
        { clef: "treble", voices: [[[{ v: "q", n: [{ p: 64, s: 18 }, { p: 67, s: 15 }] }, { v: "q", n: [{ p: 65, s: 13 }] }]]] },
        { clef: "bass", voices: [[[{ v: "h", n: [{ p: 48, s: 14 }] }]]] },
      ],
    };
    expect(namesOf(makeExcerptPrompt(piano, SOURCE, "rh", 1, "C:major")!)).toEqual(["E4+G4", "F4"]);
    expect(namesOf(makeExcerptPrompt(piano, SOURCE, "lh", 1, "C:major")!)).toEqual(["C3"]);
    const both = makeExcerptPrompt(piano, SOURCE, "both", 1, "C:major")!;
    expect(both.range).toBe("grand");
    expect(namesOf(both)).toEqual(["C3+E4+G4", "F4"]);
    const d = sightReadingDisplay(initialReading(both));
    expect(d.sub).toBe("C major / A minor · both hands · level 1 · 1 of 2");
    expect(readingDrillBody(both, true, false, 500).prompt).toBe("Piano, both hands, level 1");
  });
});
