// The notes an exercise expects, drawn on the staff a page at a time.
import { describe, expect, it } from "vitest";
import { diatonicChordsExercise } from "../src/exercises/diatonicChords";
import { scaleExercise } from "../src/exercises/scales";
import { initialSequence, reduceSequence } from "../src/exercises/sequence";
import { chromaticExercise } from "../src/exercises/technique";
import { buildKey } from "../src/theory";
import { exerciseRow, inOctaveOf, PAGE_STEPS } from "../src/views/exerciseRow";

const play = (s: ReturnType<typeof initialSequence>, notes: number[]) =>
  notes.reduce((st, note, i) => reduceSequence(st, { type: "noteOn", note, time: i * 100 }), s);
const firsts = (row: ReturnType<typeof exerciseRow>) => row.notes.map(n => (n.midi as number[])[0]);

describe("exerciseRow", () => {
  it("shows the first page before a run, the first step current, in an octave near the staves", () => {
    const row = exerciseRow(initialSequence(scaleExercise(buildKey("D:major")!, "natural", 1)));
    expect(row.slots).toBe(PAGE_STEPS);
    // A one-octave scale fits on one page: 15 steps
    expect(firsts(row)).toEqual([62, 64, 66, 67, 69, 71, 73, 74, 73, 71, 69, 67, 66, 64, 62]);
    expect(row.notes.slice(0, 8).map(n => n.names)).toEqual([["D"], ["E"], ["F#"], ["G"], ["A"], ["B"], ["C#"], ["D"]]);
    expect(row.notes.map(n => n.style)).toEqual(["current", ...Array(14).fill(undefined)]);
    expect(row.heldAt).toBeNull();
  });

  it("follows the run's octave; a miss turns the step red", () => {
    let s = play(initialSequence(scaleExercise(buildKey("C:major")!, "natural", 1)), [48, 50, 52, 53, 55, 57, 59, 60, 59]);
    const row = exerciseRow(s);
    expect(firsts(row)).toEqual([48, 50, 52, 53, 55, 57, 59, 60, 59, 57, 55, 53, 52, 50, 48]);
    expect(row.notes.map(n => n.style)).toEqual([...Array(9).fill("done"), "current", ...Array(5).fill(undefined)]);
    s = reduceSequence(s, { type: "noteOn", note: 61, time: 2000 });
    expect(exerciseRow(s).notes[9].style).toBe("wrong");
  });

  it("turns the page with the step being played, and spells as the exercise does", () => {
    // The one-octave chromatic scale: 25 steps, so a second page from step 16
    const s = { ...initialSequence(chromaticExercise(buildKey("C:major")!, 1)), status: "playing" as const, anchor: 60, index: 16 };
    const row = exerciseRow(s);
    expect(row.notes.map(n => n.names![0])).toEqual(["Ab", "G", "Gb", "F", "E", "Eb", "D", "Db", "C"]);
    expect(row.notes[0].style).toBe("current");
    // A two-octave scale from B starts low enough not to climb far above the staff
    expect(firsts(exerciseRow(initialSequence(chromaticExercise(buildKey("B:major")!, 2))))[0]).toBe(59);
  });

  it("draws chord steps in root position, close, climbing with the key", () => {
    const row = exerciseRow(initialSequence(diatonicChordsExercise(buildKey("F:major")!, { sevenths: false, rootPosition: true })));
    expect(row.notes[0]).toMatchObject({ midi: [65, 69, 72], names: ["F", "A", "C"] });
    expect(row.notes[1]).toMatchObject({ midi: [67, 70, 74], names: ["G", "Bb", "D"] });
  });
});

describe("exerciseRow before a run, after playing", () => {
  it("draws the next exercise in the octave last played in, not where it would sit by itself", () => {
    // G major over two octaves would start on G3 by itself (G6 is far above the staff) …
    const g2 = initialSequence(scaleExercise(buildKey("G:major")!, "natural", 2));
    expect(firsts(exerciseRow(g2))[0]).toBe(55);
    // … but after a scale from F♯4, it starts on G4, where the player will start it
    expect(firsts(exerciseRow(g2, 66))[0]).toBe(67);
    // Round the circle: G after C4 is G4, not G3
    expect(firsts(exerciseRow(initialSequence(scaleExercise(buildKey("G:major")!, "natural", 1)), 60))[0]).toBe(67);
    expect(inOctaveOf(11, 50)).toBe(59);   // B3: the octave of D3
  });
});
