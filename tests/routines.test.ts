// Routines: sets of exercises played in order (e.g. every major scale round the circle of fifths).
import { describe, expect, it } from "vitest";
import { DEFAULT_EXERCISE_OPTIONS, type ExerciseOptions } from "../src/exercises/prescriptive";
import {
  circleOfFifths, eachKey, initialRoutine, itemExercise, reduceRoutine, routineById, routineSummary, ROUTINES,
  sanitizeRoutineOptions, type RoutineAction, type RoutineState,
} from "../src/exercises/routines";
import type { SequenceExercise } from "../src/exercises/sequence";
import { createAppState, reduceApp } from "../src/state/app";
import { matchTemplate } from "../src/theory";
import { routineDisplay } from "../src/views/practice";

const scales = routineById("scales-circle")!;
const base: ExerciseOptions = { ...DEFAULT_EXERCISE_OPTIONS, key: "A:minor" };
let clock = 0;
const run = (s: RoutineState, ...actions: RoutineAction[]) => actions.reduce(reduceRoutine, s);

/** Plays an exercise perfectly from C4-ish: note steps as note-ons, chord steps as held chords */
function playExercise(ex: SequenceExercise, gap = 200, mistakeAt = -1): RoutineAction[] {
  const out: RoutineAction[] = [];
  const anchor = 60 + ex.basePc;
  ex.steps.forEach((st, i) => {
    if (i === mistakeAt) out.push({ type: "noteOn", note: anchor + 1 + (st.kind === "note" ? st.offset : 0), time: clock += gap });
    if (st.kind === "note") out.push({ type: "noteOn", note: anchor + st.offset, time: clock += gap });
    else {
      const m = matchTemplate([], st.chord.rootPc, st.chord.type);
      const notes = [...m.missing, ...m.omitted].map(t => 48 + st.chord.rootPc + t.pc).sort((a, b) => a - b);
      out.push({ type: "held", notes, time: clock += gap }, { type: "held", notes: [], time: clock += 1 });
    }
  });
  return out;
}
const playCurrent = (s: RoutineState, mistakeAt = -1) => run(s, ...playExercise(s.current.exercise, 200, mistakeAt));

describe("circle of fifths", () => {
  it("goes sharps first or flats first, starting on C", () => {
    expect(circleOfFifths("sharps").map(k => k.split(":")[0]).join(" ")).toBe("C G D A E B F# Db Ab Eb Bb F");
    expect(circleOfFifths("flats").map(k => k.split(":")[0]).join(" ")).toBe("C F Bb Eb Ab Db F# B E A D G");
  });
});

describe("routines", () => {
  it("are data pointing at exercises, one or more per key", () => {
    expect(scales.items("sharps")).toHaveLength(12);
    expect(scales.items("sharps")[1]).toEqual({ exercise: "scales", options: { key: "G:major" } });
    const both = routineById("scale-triads-circle")!.items("flats");
    expect(both.slice(0, 4)).toEqual(eachKey(["C:major", "F:major"], ["scales", "diatonic"]));
    expect(new Set(ROUTINES.map(r => r.id)).size).toBe(ROUTINES.length);
  });

  it("build each item from the player's settings, with the item's key", () => {
    const ex = itemExercise({ exercise: "scales", options: { key: "D:major" } }, { ...base, octaves: 2 });
    expect(ex.title).toBe("D major");
    expect(ex.steps).toHaveLength(29);   // two octaves, from the settings
  });
});

describe("reduceRoutine", () => {
  const start = () => initialRoutine(scales, "sharps", base);

  it("moves on to the next key when a run finishes, recording the result", () => {
    let s = playCurrent(start());
    expect(s).toMatchObject({ index: 1, status: "playing", previous: { index: 0 } });
    expect(s.outcomes).toHaveLength(1);
    expect(s.current.exercise.title).toBe("G major");
    expect(s.current.status).toBe("ready");
    // The previous result shows until the next key starts
    s = run(s, { type: "noteOn", note: 67, time: clock += 200 });
    expect(s.previous).toBeNull();
  });

  it("records mistakes but still moves on", () => {
    const s = playCurrent(start(), 3);
    expect(s.index).toBe(1);
    expect(s.outcomes[0]).toMatchObject({ mistakes: 1 });
  });

  it("can skip a key, and finishes after the last one with a summary", () => {
    let s = run(start(), { type: "skip", held: [] });
    expect(s.outcomes).toEqual(["skipped"]);
    for (let i = 1; i < 12; i++) s = playCurrent(s, i === 5 ? 2 : -1);
    expect(s.status).toBe("done");
    const sum = routineSummary(s);
    expect(sum).toMatchObject({ finished: 11, clean: 10, skipped: 1, totalMistakes: 1 });
    expect(sum.weakest.map(w => w.index)).toEqual([5]);
    expect(sum.durationMs).toBeGreaterThan(0);
    expect(run(s, { type: "noteOn", note: 60, time: 0 })).toBe(s);   // nothing happens after the end
  });

  it("hands over from a scale to the key's chords without counting the scale's last note against them", () => {
    let s = initialRoutine(routineById("scale-triads-circle")!, "sharps", base);
    s = playCurrent(s);
    expect(s.current.exercise.title).toBe("C major triads");
    // The scale's last note (C) is still down when the triads begin; letting go of it is not a wrong chord
    s = run(s, { type: "held", notes: [60], time: clock += 10 }, { type: "held", notes: [], time: clock += 10 });
    expect(s.current).toMatchObject({ mistakes: 0, startHint: false });
    s = playCurrent(s);
    expect(s).toMatchObject({ index: 2, outcomes: [{ mistakes: 0 }, { mistakes: 0 }] });
  });

  it("applies new exercise settings from the item in progress on", () => {
    let s = start();
    s = run(s, { type: "setBase", base: { ...base, octaves: 2 } });
    expect(s.current.exercise.steps).toHaveLength(29);
    s = playCurrent(s);
    expect(s.current.exercise.steps).toHaveLength(29);
  });
});

describe("routineDisplay", () => {
  it("shows the overview, progress and the previous key's result", () => {
    const s = playCurrent(initialRoutine(scales, "sharps", base), 3);
    const d = routineDisplay(s, "names");
    expect(d.promptHtml).toMatch(/^<div class="routineRow"><span class="step flawed"><span class="main">C<\/span><\/span><span class="step current"><span class="main">G<\/span>/);
    expect(d.sub).toBe("2 / 12");
    expect(d.feedback).toMatch(/^C major: 1 mistake · /);
    expect(d.score).toBe("1 / 12 done · 0 clean");
    expect(d.label).toBe("Play G major up and back down, one octave, starting on any G");
  });

  it("groups a key's exercises into one entry, saying which part is up", () => {
    let s = initialRoutine(routineById("scale-triads-circle")!, "sharps", base);
    const entries = (html: string) => html.match(/<span class="step [a-z]+">/g)!.length;
    expect(entries(routineDisplay(s, "names").promptHtml)).toBe(12 + 15);   // 12 keys, then the scale's own row
    expect(routineDisplay(s, "names").promptHtml).toContain('<span class="step current"><span class="main">C</span><span class="other">scale</span>');
    s = playCurrent(s);
    expect(routineDisplay(s, "names").promptHtml).toContain('<span class="step current"><span class="main">C</span><span class="other">chords</span>');
    s = playCurrent(s);
    expect(routineDisplay(s, "names").promptHtml).toMatch(/^<div class="routineRow"><span class="step done"><span class="main">C<\/span><span class="other">&nbsp;<\/span>/);
  });

  it("summarizes the routine at the end", () => {
    let s = initialRoutine(scales, "sharps", base);
    for (let i = 0; i < 12; i++) s = playCurrent(s, i === 6 ? 1 : -1);
    const d = routineDisplay(s, "names");
    expect(d.feedback).toMatch(/^12 of 12 played · 11 clean · 1 mistake · /);
    expect(d.sub).toBe("Weakest: F♯ major (1 mistake)");
    expect(d.skipLabel).toBe("Start again");
  });
});

describe("routine settings", () => {
  it("default to the first routine, sharps first, and ignore bad values", () => {
    expect(createAppState().settings.routine).toEqual({ id: "scales-circle", direction: "sharps" });
    expect(sanitizeRoutineOptions({ id: "nope", direction: "sideways" })).toEqual({ id: "scales-circle", direction: "sharps" });
    const s = reduceApp(createAppState(), { type: "setRoutineOptions", options: { direction: "flats" } });
    expect(s.settings.routine).toEqual({ id: "scales-circle", direction: "flats" });
    expect(reduceApp(s, { type: "setRoutineOptions", options: { direction: "flats" } })).toBe(s);
  });
});
