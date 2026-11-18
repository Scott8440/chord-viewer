// Scales with both hands together: the steps for each motion, and judging notes played together.
import { describe, expect, it } from "vitest";
import { handsTogetherExercise } from "../src/exercises/scales";
import { initialSequence, reduceSequence, type SequenceAction, type SequenceState } from "../src/exercises/sequence";
import { buildKey } from "../src/theory";

const ex = (
  key: string,
  motion: "parallel" | "contrary",
  form: "natural" | "melodic" = "natural",
  octaves: 1 | 2 = 1,
) => handsTogetherExercise(buildKey(key)!, form, octaves, motion);
const names = (e: ReturnType<typeof ex>) => e.steps.map(s => s.names.join("+"));

describe("the exercise", () => {
  it("parallel: the hands an octave apart, up and back down", () => {
    const e = ex("C:major", "parallel");
    expect(e.steps).toHaveLength(15);
    expect(e.steps[0].offsets).toEqual([-12, 0]);
    expect(e.steps[7].offsets).toEqual([0, 12]);
    expect(e.steps.every(s => s.offsets[1] - s.offsets[0] === 12)).toBe(true);
    expect(names(e).slice(0, 3)).toEqual(["C+C", "D+D", "E+E"]);
  });

  it("contrary: from a shared note, out to the octave each way, and back", () => {
    const e = ex("C:major", "contrary");
    expect(names(e)).toEqual([
      "C",
      "B+D",
      "A+E",
      "G+F",
      "F+G",
      "E+A",
      "D+B",
      "C+C",
      "D+B",
      "E+A",
      "F+G",
      "G+F",
      "A+E",
      "B+D",
      "C",
    ]);
    expect(e.steps[7].offsets).toEqual([-12, 12]);
    // The hands mirror each other about the tonic... in steps of the scale, not half steps
    expect(e.steps.every(s => s.offsets[0] <= 0 && s.offsets[s.offsets.length - 1] >= 0)).toBe(true);
  });

  it("melodic minor: each hand raised going up and natural coming down", () => {
    const e = ex("A:minor", "contrary", "melodic");
    // Out: the right hand rises with F♯ and G♯, the left falls with G and F
    expect(names(e).slice(1, 7)).toEqual(["G+B", "F+C", "E+D", "D+E", "C+F#", "B+G#"]);
    // Back: the right hand falls with G and F, the left rises with F♯ and G♯
    expect(names(e).slice(8, 14)).toEqual(["B+G", "C+F", "D+E", "E+D", "F#+C", "G#+B"]);
  });

  it("two octaves, and a distinct id per motion", () => {
    expect(ex("G:major", "parallel", "natural", 2).steps).toHaveLength(29);
    expect(ex("G:major", "parallel").id).not.toBe(ex("G:major", "contrary").id);
  });
});

describe("judging notes played together", () => {
  /** Plays a step's notes (from middle C), each pressed at `t` and `t + skew`, then released */
  function play(s: SequenceState, notes: number[], t: number, skew = 0): SequenceState {
    const actions: SequenceAction[] = [];
    notes.forEach((n, i) => {
      const at = t + (i ? skew : 0);
      actions.push({ type: "noteOn", note: n, time: at });
      actions.push({ type: "held", notes: notes.slice(0, i + 1), time: at });
    });
    actions.push({ type: "held", notes: [], time: t + 200 });
    return actions.reduce(reduceSequence, s);
  }
  const e = ex("C:major", "parallel");

  it("a step is done once both hands' notes are down; the run measures how far apart they landed", () => {
    let s = initialSequence(e);
    e.steps.forEach((st, i) => {
      s = play(
        s,
        st.offsets.map(o => 60 + o),
        1000 + 500 * i,
        i % 2 ? 30 : 10,
      );
    });
    expect(s.status).toBe("done");
    expect(s.result).toMatchObject({ mistakes: 0, handsApartMs: 10 });
  });

  it("the first step sets the octave: an octave apart, any octave; a wrong note is a mistake", () => {
    let s = play(initialSequence(e), [36, 48], 0);
    expect(s).toMatchObject({ status: "playing", anchor: 48, index: 1 });
    // D+D expected (38, 50): an E is wrong
    s = reduceSequence(s, { type: "noteOn", note: 52, time: 600 });
    expect(s).toMatchObject({ mistakes: 1, lastWrong: { kind: "notes", expected: [38, 50], played: 52 } });
    // One hand alone doesn't finish the step
    s = reduceSequence(s, { type: "held", notes: [38], time: 700 });
    expect(s.index).toBe(1);
    s = reduceSequence(s, { type: "held", notes: [38, 50], time: 710 });
    expect(s.index).toBe(2);
  });

  it("notes held over from the step before don't count against the next (legato)", () => {
    let s = play(initialSequence(e), [48, 60], 0);
    s = reduceSequence(s, { type: "held", notes: [48, 50, 60, 62], time: 500 });
    expect(s.index).toBe(2);
  });
});
