// Prescriptive exercises: the note-sequence matcher, run measurements, and the scale exercise.
import { describe, expect, it } from "vitest";
import { scaleExercise } from "../src/exercises/scales";
import {
  bestRun, initialSequence, reduceSequence, runResult, type SequenceAction, type SequenceState,
} from "../src/exercises/sequence";
import { createAppState, reduceApp } from "../src/state/app";
import { buildKey } from "../src/theory";
import { sequenceDisplay } from "../src/views/practice";

const C = buildKey("C:major")!;
const Cmajor = scaleExercise(C, "natural", 1);
const run = (s: SequenceState, ...actions: SequenceAction[]) => actions.reduce(reduceSequence, s);
/** Note-ons for MIDI notes, 250 ms apart from `t0` */
const play = (notes: number[], t0 = 0, gap = 250): SequenceAction[] => notes.map((note, i) => ({ type: "noteOn", note, time: t0 + i * gap }));
const absolute = (ex: typeof Cmajor, start: number) => ex.steps.map(st => start + st.offset);

describe("scaleExercise", () => {
  it("goes up and back down one octave, starting and ending on the tonic", () => {
    expect(Cmajor.steps.map(s => s.name).join(" ")).toBe("C D E F G A B C B A G F E D C");
    expect(Cmajor.steps.map(s => s.offset)).toEqual([0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0]);
    expect(Cmajor).toMatchObject({ title: "C major", basePc: 0, keyValue: "C:major" });
  });

  it("covers two octaves with 29 notes", () => {
    const two = scaleExercise(C, "natural", 2);
    expect(two.steps).toHaveLength(29);
    expect(Math.max(...two.steps.map(s => s.offset))).toBe(24);
    expect(two.steps[14]).toEqual({ kind: "note", offset: 24, name: "C" });
  });

  it("spells from the key, with sharps and flats as the scale needs", () => {
    expect(scaleExercise(buildKey("F#:major")!, "natural", 1).steps.slice(0, 8).map(s => s.name).join(" ")).toBe("F# G# A# B C# D# E# F#");
    expect(scaleExercise(buildKey("Eb:major")!, "natural", 1).steps.slice(0, 8).map(s => s.name).join(" ")).toBe("Eb F G Ab Bb C D Eb");
  });

  it("has the three minor forms; melodic comes down as natural minor", () => {
    const Am = buildKey("A:minor")!;
    expect(scaleExercise(Am, "natural", 1).steps.map(s => s.name).join(" ")).toBe("A B C D E F G A G F E D C B A");
    expect(scaleExercise(Am, "harmonic", 1).steps.map(s => s.name).join(" ")).toBe("A B C D E F G# A G# F E D C B A");
    expect(scaleExercise(Am, "melodic", 1).steps.map(s => s.name).join(" ")).toBe("A B C D E F# G# A G F E D C B A");
    expect(scaleExercise(Am, "melodic", 1).title).toBe("A melodic minor");
  });

  it("ids differ with every setting that changes the notes", () => {
    const ids = new Set([Cmajor, scaleExercise(C, "natural", 2), scaleExercise(buildKey("A:minor")!, "natural", 1),
      scaleExercise(buildKey("A:minor")!, "harmonic", 1), scaleExercise(C, "harmonic", 1)].map(e => e.id));
    expect(ids.size).toBe(4);   // the minor form does not matter in a major key
  });
});

describe("reduceSequence", () => {
  const start = initialSequence(Cmajor);

  it("starts on the first note in any octave and then needs the exact notes", () => {
    const s = run(start, ...play(absolute(Cmajor, 72)));
    expect(s).toMatchObject({ status: "done", anchor: 72, mistakes: 0 });
    expect(s.result).toMatchObject({ mistakes: 0, durationMs: 14 * 250, bpm: 240, evenness: 1 });
  });

  it("asks to start on the right note, without counting a mistake", () => {
    const s = run(start, { type: "noteOn", note: 62, time: 0 });
    expect(s).toMatchObject({ status: "ready", startHint: true, mistakes: 0 });
  });

  it("counts a wrong note as a mistake and waits for the right one", () => {
    let s = run(start, ...play([60, 62]), { type: "noteOn", note: 63, time: 600 });
    expect(s).toMatchObject({ status: "playing", index: 2, mistakes: 1, lastWrong: { expected: 64, played: 63 } });
    s = run(s, { type: "noteOn", note: 76, time: 700 });       // right note, wrong octave
    expect(s).toMatchObject({ index: 2, mistakes: 2, lastWrong: { expected: 64, played: 76 } });
    s = run(s, { type: "noteOn", note: 64, time: 800 });
    expect(s).toMatchObject({ index: 3, mistakes: 2, lastWrong: null });
  });

  it("is repeatable: playing the first note again starts a new run and keeps every result", () => {
    let s = run(start, ...play(absolute(Cmajor, 60)));
    s = run(s, ...play(absolute(Cmajor, 48), 10000, 300));
    expect(s.runs).toHaveLength(2);
    expect(s).toMatchObject({ status: "done", anchor: 48 });
    expect(s.runs[1].bpm).toBeCloseTo(200, 6);
  });

  it("restart abandons the current run", () => {
    const s = run(start, ...play([60, 62, 64]), { type: "restart" });
    expect(s).toMatchObject({ status: "ready", index: 0, anchor: null, mistakes: 0, runs: [] });
  });

  it("a new exercise starts fresh; the same one changes nothing", () => {
    const s = run(start, ...play(absolute(Cmajor, 60)));
    expect(reduceSequence(s, { type: "setExercise", exercise: scaleExercise(C, "melodic", 1) })).toBe(s);
    expect(reduceSequence(s, { type: "setExercise", exercise: scaleExercise(C, "natural", 2) })).toMatchObject({ status: "ready", runs: [] });
  });
});

describe("run measurements", () => {
  it("tempo and evenness come from the gaps between notes", () => {
    expect(runResult([0, 500, 1000, 1500], 0)).toMatchObject({ durationMs: 1500, bpm: 120, evenness: 1 });
    const uneven = runResult([0, 400, 1000, 1400], 1);       // gaps 400, 600, 400
    expect(uneven.bpm).toBeCloseTo(60000 / (1400 / 3), 6);
    expect(uneven.evenness).toBeLessThan(0.85);
    expect(runResult([0], 0)).toMatchObject({ bpm: 0, evenness: 1 });
  });

  it("the best run has the fewest mistakes, then the most even", () => {
    const a = { mistakes: 1, durationMs: 1, bpm: 1, evenness: 0.99, timing: null }, b = { mistakes: 0, durationMs: 1, bpm: 1, evenness: 0.8, timing: null },
          c = { mistakes: 0, durationMs: 1, bpm: 1, evenness: 0.9, timing: null };
    expect(bestRun([a, b, c])).toBe(c);
    expect(bestRun([])).toBeNull();
  });
});

describe("sequenceDisplay", () => {
  it("shows the scale, progress and feedback", () => {
    let s = run(initialSequence(Cmajor), ...play([60, 62]));
    let d = sequenceDisplay(s, "names");
    expect(d.label).toBe("Play C major up and back down, one octave, starting on any C");
    expect(d.promptHtml).toMatch(/^<div class="seqTitle">C major<\/div><div class="seqRow"><span class="step done">/);
    expect(d.skipLabel).toBe("Restart");
    s = run(s, { type: "noteOn", note: 63, time: 600 });
    expect(sequenceDisplay(s, "names").feedback).toBe("✗ Expected E, not E♭");
    s = run(s, { type: "noteOn", note: 52, time: 700 });
    expect(sequenceDisplay(s, "names").feedback).toBe("✗ Right note, wrong octave: E higher");
    expect(sequenceDisplay(s, "names").sub).toBe("2 mistakes so far");
  });

  it("reports a run when it ends", () => {
    const s = run(initialSequence(Cmajor), ...play(absolute(Cmajor, 60)));
    const d = sequenceDisplay(s, "names");
    expect(d).toMatchObject({ status: "correct", feedback: "✓ Clean run · 240 BPM · 100% even",
                              sub: "Play C to go again", score: "1 run · 1 clean · best: 100% even" });
  });

  it("shows the notes to play as dots, not names", () => {
    const d = sequenceDisplay(run(initialSequence(Cmajor), ...play([60, 62])), "names");
    const row = d.promptHtml.split('<div class="seqRow">')[1];
    expect(row.match(/<span class="main">([^<]*)<\/span>/g)!.every(m => m.includes("•"))).toBe(true);
    expect(row.match(/class="step done"/g)).toHaveLength(2);
    expect(row.match(/class="step current"/g)).toHaveLength(1);
  });

  it("writes accidentals as symbols in the title and instruction, without touching other words", () => {
    const d = sequenceDisplay(initialSequence(scaleExercise(buildKey("Bb:minor")!, "melodic", 2)), "names");
    expect(d.label).toBe("Play B♭ melodic minor up and back down, two octaves, starting on any B♭");
    expect(d.promptHtml).toMatch(/^<div class="seqTitle">B♭ melodic minor<\/div>/);
  });

  it("asks for the starting note", () => {
    expect(sequenceDisplay(run(initialSequence(Cmajor), { type: "noteOn", note: 61, time: 0 }), "names").feedback).toBe("Start on C");
  });
});

describe("exercise settings", () => {
  it("default to C major, natural minor, one octave, arpeggios from the root, triads in root position, metronome off", () => {
    expect(createAppState().settings.exercise).toEqual({ key: "C:major", minorForm: "natural", octaves: 1, inversion: 0, sevenths: false,
      rootPosition: true, metronome: false, bpm: 80, subdivision: 1, strictness: "strict" });
  });

  it("change one option at a time, keep the rest, and ignore invalid values", () => {
    const s = createAppState();
    const t = reduceApp(s, { type: "setExerciseOptions", options: { octaves: 2, key: "F#:minor" } });
    expect(t.settings.exercise).toMatchObject({ key: "F#:minor", octaves: 2, minorForm: "natural" });
    expect(reduceApp(t, { type: "setExerciseOptions", options: { octaves: 2 } })).toBe(t);
    expect(reduceApp(s, { type: "setExerciseOptions", options: { key: "nonsense" } })).toBe(s);
  });

  it("load saved options, including scale options saved by an older version, and drop bad ones", () => {
    expect(createAppState({ exercise: { key: "Eb:minor", minorForm: "melodic", octaves: 2 } }).settings.exercise)
      .toMatchObject({ key: "Eb:minor", minorForm: "melodic", octaves: 2, sevenths: false, rootPosition: true });
    expect(createAppState({ exercise: { key: "bogus", octaves: 7, sevenths: "yes" } }).settings.exercise)
      .toEqual(createAppState().settings.exercise);
    expect(createAppState({ exercise: "garbage" }).settings.exercise).toEqual(createAppState().settings.exercise);
  });

  it("are separate from the header key, which exercises never use", () => {
    const s = reduceApp(createAppState(), { type: "setKey", value: "G:major" });
    expect(s.settings).toMatchObject({ keyValue: "G:major", exercise: { key: "C:major" } });
  });
});
