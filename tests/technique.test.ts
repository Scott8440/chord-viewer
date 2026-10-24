// Technique exercises: five-finger patterns, arpeggios, broken chords and the chromatic scale.
import { describe, expect, it } from "vitest";
import { PRESCRIPTIVE, DEFAULT_EXERCISE_OPTIONS } from "../src/exercises/prescriptive";
import { routineById } from "../src/exercises/routines";
import { initialSequence, reduceSequence, type SequenceExercise } from "../src/exercises/sequence";
import { arpeggioExercise, brokenChordExercise, chromaticExercise, fiveFingerExercise } from "../src/exercises/technique";
import { exerciseLabel } from "../src/progress/stats";
import { buildKey } from "../src/theory";

const notes = (e: SequenceExercise) => e.steps.map(s => s.kind === "note" ? s.offset : "chord");
const names = (e: SequenceExercise) => e.steps.map(s => s.kind === "note" ? s.name : `${s.chord.root}${s.chord.type}`);

describe("five-finger patterns", () => {
  it("are the first five notes up and down, then the tonic chord in root position", () => {
    const e = fiveFingerExercise(buildKey("D:major")!);
    expect(names(e)).toEqual(["D", "E", "F#", "G", "A", "G", "F#", "E", "D", "DM"]);
    const last = e.steps[e.steps.length - 1];
    expect(last.kind === "chord" && last.chord.inversion?.number).toBe(0);
    expect(names(fiveFingerExercise(buildKey("C:minor")!)).slice(0, 5)).toEqual(["C", "D", "Eb", "F", "G"]);
  });
});

describe("arpeggios", () => {
  it("go up and back down from the root, over one or two octaves", () => {
    const e = arpeggioExercise(buildKey("A:minor")!, 1, 0);
    expect(names(e)).toEqual(["A", "C", "E", "A", "E", "C", "A"]);
    expect(notes(e)).toEqual([0, 3, 7, 12, 7, 3, 0]);
    expect(notes(arpeggioExercise(buildKey("C:major")!, 2, 0))).toEqual([0, 4, 7, 12, 16, 19, 24, 19, 16, 12, 7, 4, 0]);
  });

  it("start from the 3rd or 5th in an inversion, ending where they started", () => {
    expect(names(arpeggioExercise(buildKey("Eb:major")!, 1, 1))).toEqual(["G", "Bb", "Eb", "G", "Eb", "Bb", "G"]);
    expect(notes(arpeggioExercise(buildKey("C:major")!, 1, 2))).toEqual([7, 12, 16, 19, 16, 12, 7]);
  });
});

describe("broken chords", () => {
  it("break the tonic chord in each position, low–middle–high–middle, up to the root and back", () => {
    const e = brokenChordExercise(buildKey("C:major")!, 1);
    expect(names(e)).toEqual([
      "C", "E", "G", "E", "E", "G", "C", "G", "G", "C", "E", "C", "C",
      "C", "E", "C", "G", "G", "C", "G", "E", "E", "G", "E", "C",
    ]);
    expect(notes(e).slice(0, 13)).toEqual([0, 4, 7, 4, 4, 7, 12, 7, 7, 12, 16, 12, 12]);
    expect(brokenChordExercise(buildKey("C:major")!, 2).steps).toHaveLength(2 * 24 + 1);
  });
});

describe("chromatic scale", () => {
  it("goes up in sharps and down in flats, the tonic keeping its name", () => {
    const e = chromaticExercise(buildKey("Eb:major")!, 1);
    expect(names(e).slice(0, 13)).toEqual(["Eb", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C", "C#", "D", "Eb"]);
    expect(names(e).slice(13)).toEqual(["D", "Db", "C", "B", "Bb", "A", "Ab", "G", "Gb", "F", "E", "Eb"]);
    expect(notes(chromaticExercise(buildKey("C:major")!, 2))).toHaveLength(49);
  });
});

describe("as prescriptive exercises", () => {
  it("are built from the shared options and play like any sequence", () => {
    const o = { ...DEFAULT_EXERCISE_OPTIONS, key: "G:major", octaves: 1 as const, inversion: 1 as const };
    const e = PRESCRIPTIVE.arpeggios.build(o);
    expect(e.id).toBe("arpeggio:G:major:1:1");
    let s = initialSequence(e);
    // B3 sets the octave of the run
    for (const n of [59, 62, 67, 71, 67, 62, 59]) s = reduceSequence(s, { type: "noteOn", note: n, time: 0 });
    expect(s.status).toBe("done");
    expect(s.result?.mistakes).toBe(0);
  });

  it("are labelled in progress charts, and go round the circle in the technique routine", () => {
    expect(exerciseLabel({ exercise: "arpeggios", exerciseId: "arpeggio:G:major:1:2", title: "G major arpeggio" }))
      .toBe("G major arpeggio, first inversion, 2 octaves");
    expect(exerciseLabel({ exercise: "chromatic", exerciseId: "chromatic:C:1", title: "Chromatic scale from C" }))
      .toBe("Chromatic scale from C, 1 octave");
    const items = routineById("technique-circle")!.items("sharps");
    expect(items.slice(0, 4).map(i => i.exercise)).toEqual(["fiveFinger", "scales", "arpeggios", "brokenChords"]);
    expect(items).toHaveLength(48);
  });
});
