// Diatonic chords exercise, chord steps in the sequence matcher, mixed sequences, the exercise registry,
// and the shared player-input helper.
import { describe, expect, it } from "vitest";
import { diatonicChordsExercise } from "../src/exercises/diatonicChords";
import { DEFAULT_EXERCISE_OPTIONS, PRESCRIPTIVE } from "../src/exercises/prescriptive";
import {
  initialSequence, reduceSequence, type SequenceAction, type SequenceExercise, type SequenceState,
} from "../src/exercises/sequence";
import { heldNotes, onPlayerInput } from "../src/modes/performance";
import { createAppState, reduceApp, type AppAction } from "../src/state/app";
import { createStore } from "../src/state/store";
import { analyze, buildKey, KEY_MAJORS, KEY_MINORS, matchTemplate, prettyAcc, templateById } from "../src/theory";
import { sequenceDisplay } from "../src/views/practice";

const C = buildKey("C:major")!;
const triads = diatonicChordsExercise(C, { sevenths: false, rootPosition: true });
const run = (s: SequenceState, ...actions: SequenceAction[]) => actions.reduce(reduceSequence, s);
let clock = 0;
const held = (...notes: number[]): SequenceAction => ({ type: "held", notes, time: clock += 500 });
const names = (ex: typeof triads) => ex.steps.map(st => st.chord.root + templateById(st.chord.type)!.symbol).join(" ");
const numerals = (ex: typeof triads) => ex.steps.map(st => st.chord.roman!.numeral).join(" ");
/** Close root-position voicing of a chord step, from C3 up */
const voice = (c: { rootPc: number; type: string }) => {
  const m = matchTemplate([], c.rootPc, c.type);
  return [...m.missing, ...m.omitted].map(t => 48 + c.rootPc + t.pc).sort((a, b) => a - b);
};
/** Plays every chord of an exercise, lifting all keys between chords */
const playAll = (s: SequenceState, ex: typeof triads) =>
  ex.steps.reduce((x, st) => run(x, held(...voice(st.chord)), held()), s);

describe("diatonicChordsExercise", () => {
  it("is the key's triads from I up to vii° and back to I", () => {
    expect(names(triads)).toBe("C Dm Em F G Am Bdim C");
    expect(numerals(triads)).toBe("I ii iii IV V vi vii° I");
    expect(triads).toMatchObject({ title: "C major triads", keyValue: "C:major", basePc: 0 });
    expect(triads.instruction).toBe("Play the diatonic triads of C major in order, I up to vii° and back to I, each in root position");
  });

  it("has seventh chords, and harmonic minor's V7 and vii°7 in minor keys", () => {
    const am7 = diatonicChordsExercise(buildKey("A:minor")!, { sevenths: true, rootPosition: false });
    expect(names(am7)).toBe("Am7 Bm7b5 Cmaj7 Dm7 E7 Fmaj7 G#dim7 Am7");
    expect(numerals(am7)).toBe("i7 iiø7 IIImaj7 iv7 V7 VImaj7 vii°7 i7");
    expect(am7.steps.every(st => !st.chord.inversion)).toBe(true);
    expect(am7.instruction).toMatch(/in any voicing$/);
  });

  it("every chord analyzes back to itself and its numeral, in every key", () => {
    for (const [tonics, mode] of [[KEY_MAJORS, "major"], [KEY_MINORS, "minor"]] as const) {
      for (const tonic of tonics) for (const sevenths of [false, true]) {
        const key = buildKey(`${tonic}:${mode}`)!;
        for (const st of diatonicChordsExercise(key, { sevenths, rootPosition: true }).steps) {
          const r = analyze(voice(st.chord), key);
          expect(r?.text).toBe(st.chord.root + templateById(st.chord.type)!.symbol);
          expect(r?.roman).toBe(prettyAcc(st.chord.roman!.numeral));
        }
      }
    }
  });

  it("ids change with every option that changes the chords", () => {
    const ids = new Set([true, false].flatMap(sevenths => [true, false].map(rootPosition =>
      diatonicChordsExercise(C, { sevenths, rootPosition }).id)));
    expect(ids.size).toBe(4);
  });
});

describe("chord steps in a sequence", () => {
  const start = initialSequence(triads);

  it("runs through every chord, timing each one", () => {
    clock = 0;
    const s = playAll(start, triads);
    expect(s).toMatchObject({ status: "done", mistakes: 0 });
    expect(s.result).toMatchObject({ mistakes: 0, durationMs: 7000, bpm: 60, evenness: 1 });
  });

  it("accepts legato: common tones held between chords", () => {
    // Hand moves straight from chord to chord without ever lifting every key: C, Dm, Em, F
    const s = run(start, held(48, 52, 55), held(50, 53, 57), held(52, 55, 59), held(53, 57, 60));
    expect(s.index).toBe(4);
  });

  it("requires root position when asked: the right notes over the wrong bass are a mistake", () => {
    let s = run(start, held(48, 52, 55), held(), held(53, 57, 62), held());    // Dm/F
    expect(s).toMatchObject({ index: 1, mistakes: 1, lastWrong: { kind: "chord", notes: [53, 57, 62] } });
    expect(sequenceDisplay(s, "names").feedback).toBe("✗ Right notes, wrong bass. Put D in the bass");
    s = run(s, held(50, 53, 57));
    expect(s.index).toBe(2);
  });

  it("says what was played instead, with its numeral", () => {
    const s = run(start, held(48, 52, 55), held(), held(52, 55, 59), held());   // Em instead of Dm
    // Closest moves first (E→F, G→A), and root position needs D in the bass
    expect(sequenceDisplay(s, "roman").feedback).toBe("✗ That was Em (iii). Replace E with F, replace G with A, add D, remove B and put D in the bass");
  });

  it("asks for the first chord without counting a mistake, and a finished run restarts on a re-struck first chord", () => {
    let s = run(start, held(50, 53, 57), held());
    expect(s).toMatchObject({ status: "ready", startHint: true, mistakes: 0 });
    expect(sequenceDisplay(s, "names").feedback).toBe("Start with C");
    expect(sequenceDisplay(s, "roman").feedback).toBe("Start with I");
    // Finish, keeping the last chord (C) down
    s = triads.steps.reduce((x, st, i) => run(x, held(...voice(st.chord)), ...(i < triads.steps.length - 1 ? [held()] : [])), s);
    expect(s.status).toBe("done");
    // Still holding C: no new run until it is played again
    s = run(s, held(48, 52));
    expect(s.status).toBe("done");
    s = run(s, held(), held(48, 52, 55));
    expect(s).toMatchObject({ status: "playing", index: 1 });
  });

  it("shows each chord in the prompt's notation, revealing the other one when played", () => {
    const s = run(start, held(48, 52, 55));
    const roman = sequenceDisplay(s, "roman");
    expect(roman.promptHtml).toContain('<span class="step done"><span class="main">I</span><span class="other">C</span></span>');
    expect(roman.promptHtml).toContain('<span class="step current"><span class="main">ii</span><span class="other">&nbsp;</span></span>');
    const named = sequenceDisplay(s, "names");
    expect(named.promptHtml).toContain('<span class="step done"><span class="main">C</span><span class="other">I</span></span>');
    expect(named.sub).toBe("");
  });
});

describe("mixed sequences", () => {
  // A C-major arpeggio, then the C chord: note steps then a chord step
  const ex: SequenceExercise = {
    id: "mixed", title: "C", instruction: "", basePc: 0, keyValue: "C:major",
    steps: [{ kind: "note", offset: 0, name: "C" }, { kind: "note", offset: 4, name: "E" }, { kind: "note", offset: 7, name: "G" },
            { kind: "chord", chord: triads.steps[0].chord }],
  };

  it("judges note steps on note-ons and chord steps on the held keys", () => {
    let s = initialSequence(ex);
    for (const note of [60, 64, 67]) s = run(s, { type: "noteOn", note, time: clock += 100 }, held(note), held());
    // Releasing the last note of the arpeggio is not a failed attempt at the chord that follows
    expect(s).toMatchObject({ index: 3, anchor: 60, mistakes: 0 });
    s = run(s, { type: "noteOn", note: 72, time: clock += 100 });   // a note-on during a chord step is not judged
    expect(s.mistakes).toBe(0);
    s = run(s, held(48, 52, 55));
    expect(s.status).toBe("done");
  });
});

describe("prescriptive exercise registry", () => {
  it("builds each exercise in the chosen key, reacting only to the options it uses", () => {
    for (const [id, def] of Object.entries(PRESCRIPTIVE)) {
      const base = def.build(DEFAULT_EXERCISE_OPTIONS);
      expect(def.build({ ...DEFAULT_EXERCISE_OPTIONS, key: "Eb:minor" }).keyValue, id).toBe("Eb:minor");
      for (const option of ["minorForm", "octaves", "sevenths", "rootPosition"] as const) {
        const changed = { ...DEFAULT_EXERCISE_OPTIONS, key: "A:minor",
          [option]: option === "minorForm" ? "melodic" : option === "octaves" ? 2 : !DEFAULT_EXERCISE_OPTIONS[option] };
        const differs = def.build(changed).id !== def.build({ ...DEFAULT_EXERCISE_OPTIONS, key: "A:minor" }).id;
        expect(differs, `${id} / ${option}`).toBe((def.options as readonly string[]).includes(option));
      }
      expect(base.steps.length).toBeGreaterThan(0);
    }
  });
});

describe("onPlayerInput", () => {
  it("reports note-ons and held-key changes with the time of the event, note-ons first", () => {
    const store = createStore<ReturnType<typeof createAppState>, AppAction>(reduceApp, createAppState());
    const calls: string[] = [];
    const off = onPlayerInput(store, {
      noteOn: (note, time) => calls.push(`on ${note} @${time}`),
      held: (notes, time) => calls.push(`held ${notes.join(",")} @${time}`),
    });
    const ev = (type: "noteOn" | "noteOff", note: number, time: number): AppAction =>
      ({ type: "input", event: { type, note, velocity: 90, time, source: "a", channel: 0 } });
    store.dispatch(ev("noteOn", 60, 10));
    store.dispatch(ev("noteOn", 64, 20));
    store.dispatch(ev("noteOff", 60, 30));
    store.dispatch({ type: "input", event: { type: "pedal", down: true, time: 40, source: "a", channel: 0 } });
    off();
    store.dispatch(ev("noteOn", 67, 50));
    expect(calls).toEqual(["on 60 @10", "held 60 @10", "on 64 @20", "held 60,64 @20", "held 64 @30"]);
    expect(heldNotes(store.getState())).toEqual([64, 67]);
  });
});
