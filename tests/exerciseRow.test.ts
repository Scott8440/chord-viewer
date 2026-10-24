// The notes an exercise expects, drawn on the staff a page at a time.
import { describe, expect, it } from "vitest";
import { diatonicChordsExercise } from "../src/exercises/diatonicChords";
import { scaleExercise } from "../src/exercises/scales";
import { initialSequence, reduceSequence } from "../src/exercises/sequence";
import { chromaticExercise } from "../src/exercises/technique";
import { buildKey } from "../src/theory";
import { exerciseRow, PAGE_STEPS } from "../src/views/exerciseRow";

const play = (s: ReturnType<typeof initialSequence>, notes: number[]) =>
  notes.reduce((st, note, i) => reduceSequence(st, { type: "noteOn", note, time: i * 100 }), s);

describe("exerciseRow", () => {
  it("shows the first page before a run, the first step current, in an octave near the staves", () => {
    const row = exerciseRow(initialSequence(scaleExercise(buildKey("D:major")!, "natural", 1)));
    expect(row.slots).toBe(PAGE_STEPS);
    expect(row.notes.map(n => n.midi)).toEqual([[62], [64], [66], [67], [69], [71], [73], [74]]);
    expect(row.notes.map(n => n.names)).toEqual([["D"], ["E"], ["F#"], ["G"], ["A"], ["B"], ["C#"], ["D"]]);
    expect(row.notes.map(n => n.style)).toEqual(["current", ...Array(7).fill(undefined)]);
    expect(row.heldAt).toBeNull();
  });

  it("follows the run's octave and turns the page with the step being played; a miss turns the step red", () => {
    let s = play(initialSequence(scaleExercise(buildKey("C:major")!, "natural", 1)), [48, 50, 52, 53, 55, 57, 59, 60, 59]);
    const row = exerciseRow(s);
    // Steps 8–14: B A G F E D C, with the B played
    expect(row.notes.map(n => (n.midi as number[])[0])).toEqual([59, 57, 55, 53, 52, 50, 48]);
    expect(row.notes.map(n => n.style)).toEqual(["done", "current", undefined, undefined, undefined, undefined, undefined]);
    s = reduceSequence(s, { type: "noteOn", note: 61, time: 2000 });
    expect(exerciseRow(s).notes[1].style).toBe("wrong");
  });

  it("keeps a two-octave scale from climbing far above the staff, and spells as the exercise does", () => {
    const row = exerciseRow(initialSequence(chromaticExercise(buildKey("B:major")!, 2)));
    expect((row.notes[0].midi as number[])[0]).toBe(59);
    const down = exerciseRow({ ...initialSequence(chromaticExercise(buildKey("C:major")!, 1)), index: 16 });
    expect(down.notes.map(n => n.names![0])).toEqual(["Ab", "G", "Gb", "F", "E", "Eb", "D", "Db"]);
  });

  it("draws chord steps in root position, close, climbing with the key", () => {
    const row = exerciseRow(initialSequence(diatonicChordsExercise(buildKey("F:major")!, { sevenths: false, rootPosition: true })));
    expect(row.notes[0]).toMatchObject({ midi: [65, 69, 72], names: ["F", "A", "C"] });
    expect(row.notes[1]).toMatchObject({ midi: [67, 70, 74], names: ["G", "Bb", "D"] });
  });
});
