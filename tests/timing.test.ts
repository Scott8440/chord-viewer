// The metronome's timing layer: the transport, judging steps against its grid, and timed sequences and routines.
import { describe, expect, it } from "vitest";
import { DEFAULT_EXERCISE_OPTIONS, sanitizeExerciseOptions } from "../src/exercises/prescriptive";
import { initialRoutine, reduceRoutine, routineById } from "../src/exercises/routines";
import { scaleExercise } from "../src/exercises/scales";
import { bestRun, initialSequence, reduceSequence, runResult, type SequenceState } from "../src/exercises/sequence";
import { createAppState, reduceApp } from "../src/state/app";
import { buildKey } from "../src/theory";
import { judgeTime, timingSummary, timingVerdict, windowMs, type TimingGrid } from "../src/timing/grid";
import { beatAt, retempo, startTransport, timeOfBeat } from "../src/timing/transport";
import { sequenceDisplay } from "../src/views/practice";

/** 120 BPM, beat 0 at t = 1000: beats every 500 ms */
const transport = startTransport(120, 4, 1000);
const grid = (o: Partial<TimingGrid> = {}): TimingGrid => ({ transport, subdivision: 1, strictness: "strict", latencyMs: 0, ...o });

describe("transport", () => {
  it("maps times to beats and back", () => {
    expect(beatAt(transport, 1000)).toBe(0);
    expect(beatAt(transport, 2250)).toBe(2.5);
    expect(timeOfBeat(transport, 3)).toBe(2500);
  });

  it("a new tempo carries on from the current beat", () => {
    const slower = retempo(transport, 60, 2000);   // beat 2
    expect(beatAt(slower, 2000)).toBe(2);
    expect(beatAt(slower, 3000)).toBe(3);
    expect(retempo(transport, 120, 5000)).toBe(transport);
  });
});

describe("judging a step against the grid", () => {
  it("on time within the window, else early or late", () => {
    const g = grid();
    expect(judgeTime(g, 1510, null)).toEqual({ slot: 1, offsetMs: 10, slipped: 0 });
    expect(timingVerdict(g, judgeTime(g, 1450, null))).toBe("onTime");
    expect(timingVerdict(g, judgeTime(g, 1445, null))).toBe("early");
    expect(timingVerdict(g, judgeTime(g, 1560, null))).toBe("late");
    expect(timingVerdict(grid({ strictness: "loose" }), judgeTime(g, 1560, null))).toBe("onTime");
  });

  it("takes the latency off note times", () => {
    expect(judgeTime(grid({ latencyMs: 30 }), 1530, null).offsetMs).toBe(0);
  });

  it("slots follow the subdivision", () => {
    const eighths = grid({ subdivision: 2 });
    expect(judgeTime(eighths, 1250, null)).toEqual({ slot: 1, offsetMs: 0, slipped: 0 });
    expect(judgeTime(eighths, 1500, 1)).toEqual({ slot: 2, offsetMs: 0, slipped: 0 });
  });

  it("a step a whole slot away has slipped", () => {
    const g = grid();
    expect(judgeTime(g, 2500, 1)).toMatchObject({ slot: 3, slipped: 1 });
    expect(timingVerdict(g, judgeTime(g, 2500, 1))).toBe("late");
    expect(timingVerdict(g, judgeTime(g, 1500, 1))).toBe("early");   // the same slot again: too soon
  });

  it("the window never covers more than 40% of a slot", () => {
    expect(windowMs(grid())).toBe(50);
    // 16ths at 240 BPM: 62.5 ms slots
    expect(windowMs(grid({ transport: startTransport(240, 4, 0), subdivision: 4 }))).toBe(25);
  });

  it("sums up a run: share on time, lean (rushing or dragging), spread and slips", () => {
    const g = grid();
    const t = timingSummary(g, [
      { slot: 0, offsetMs: -20, slipped: 0 }, { slot: 1, offsetMs: -10, slipped: 0 },
      { slot: 2, offsetMs: -60, slipped: 0 }, { slot: 4, offsetMs: 10, slipped: 1 },
    ]);
    expect(t.onTime).toBe(0.5);
    expect(t.meanOffsetMs).toBe(-30);
    expect(t.slips).toBe(1);
    expect(t.spreadMs).toBeCloseTo(21.6, 1);
    expect(t).toMatchObject({ bpm: 120, subdivision: 1 });
  });
});

describe("timed sequences", () => {
  const Cmajor = scaleExercise(buildKey("C:major")!, "natural", 1);
  const notes = Cmajor.steps.map(st => 60 + (st.kind === "note" ? st.offset : 0));
  /** Plays the scale at the given times */
  const play = (s: SequenceState, times: number[]) =>
    times.reduce((st, time, i) => reduceSequence(st, { type: "noteOn", note: notes[i], time }), s);
  const eighths = grid({ subdivision: 2 });
  const onTheGrid = (from: number) => notes.map((_, i) => 1000 + 250 * (from + i));

  it("times every step and sums up the run", () => {
    const times = onTheGrid(0);
    times[5] += 60;   // one late note
    const s = play(initialSequence(Cmajor, [], eighths), times);
    expect(s.status).toBe("done");
    expect(s.timings.map(t => t.slot)).toEqual(notes.map((_, i) => i));
    expect(s.result!.timing!.onTime).toBeCloseTo(14 / 15);
    expect(sequenceDisplay(s, "names").promptHtml.match(/step done late/g)).toHaveLength(1);
    expect(sequenceDisplay(s, "names").label).toContain("120 BPM, eighths");
  });

  it("a run may start on any slot", () => {
    const s = play(initialSequence(Cmajor, [], eighths), onTheGrid(3));
    expect(s.result!.timing).toMatchObject({ onTime: 1, slips: 0 });
  });

  it("after a stumble, the rest of the run is due from where it picked up", () => {
    const times = onTheGrid(0).map((t, i) => i >= 4 ? t + 250 : t);   // a slot lost before the fifth note
    const s = play(initialSequence(Cmajor, [], eighths), times);
    expect(s.timings.map(t => t.slipped)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(s.result!.timing).toMatchObject({ slips: 1 });
    expect(s.result!.timing!.onTime).toBeCloseTo(14 / 15);
  });

  it("without the metronome, runs aren't timed", () => {
    expect(play(initialSequence(Cmajor), onTheGrid(0)).result!.timing).toBeNull();
  });

  it("a new tempo keeps the run going; another subdivision, or the metronome going off, restarts it", () => {
    const s = play(initialSequence(Cmajor, [], eighths), onTheGrid(0).slice(0, 4));
    const faster = { ...eighths, transport: retempo(transport, 140, 2000) };
    expect(reduceSequence(s, { type: "setGrid", grid: faster })).toMatchObject({ status: "playing", index: 4 });
    expect(reduceSequence(s, { type: "setGrid", grid: grid({ subdivision: 4 }) })).toMatchObject({ status: "ready", timings: [] });
    expect(reduceSequence(s, { type: "setGrid", grid: null })).toMatchObject({ status: "ready", grid: null });
  });

  it("the best run is the most on time when runs were timed", () => {
    const timed = (onTime: number) => runResult([0, 1], 0, { onTime, meanOffsetMs: 0, spreadMs: 0, slips: 0, bpm: 120, subdivision: 1 });
    const a = { ...timed(0.7), evenness: 1 }, b = { ...timed(0.9), evenness: 0.5 };
    expect(bestRun([a, b])).toBe(b);
  });
});

describe("timed routines", () => {
  const scales = routineById("scales-circle")!;
  const eighths = grid({ subdivision: 2 });

  it("every item is played to the same grid", () => {
    let r = initialRoutine(scales, "sharps", DEFAULT_EXERCISE_OPTIONS, [], eighths);
    expect(r.current.grid).toBe(eighths);
    // Play C major through
    const steps = r.current.exercise.steps;
    steps.forEach((st, i) => { r = reduceRoutine(r, { type: "noteOn", note: 60 + (st.kind === "note" ? st.offset : 0), time: 1000 + 250 * i }); });
    expect(r.index).toBe(1);
    expect(r.current.grid).toBe(eighths);
    expect(r.previous!.result.timing!.onTime).toBe(1);
  });

  it("the grid follows the metronome", () => {
    const r = reduceRoutine(initialRoutine(scales, "sharps", DEFAULT_EXERCISE_OPTIONS), { type: "setGrid", grid: eighths });
    expect(r.current.grid).toBe(eighths);
  });
});

describe("metronome settings", () => {
  it("are validated: tempo clamped to 30–240, a known subdivision and strictness", () => {
    expect(sanitizeExerciseOptions({ bpm: 500, subdivision: 3, strictness: "lax", metronome: "yes" }))
      .toMatchObject({ bpm: 240, subdivision: 1, strictness: "strict", metronome: false });
    expect(sanitizeExerciseOptions({ bpm: 12.4 }).bpm).toBe(30);
    expect(sanitizeExerciseOptions({ bpm: 96.6, subdivision: 4 })).toMatchObject({ bpm: 97, subdivision: 4 });
  });

  it("latency is a whole number of ms within range, saved like the other settings", () => {
    expect(createAppState({ latencyMs: 25 }).settings.latencyMs).toBe(25);
    expect(createAppState({ latencyMs: "x" }).settings.latencyMs).toBe(0);
    const s = createAppState();
    expect(reduceApp(s, { type: "setLatency", ms: 999 }).settings.latencyMs).toBe(300);
    expect(reduceApp(s, { type: "setLatency", ms: 0 })).toBe(s);
  });

  it("the transport is set by whatever drives the clock", () => {
    const s = createAppState();
    expect(s.transport).toBeNull();
    const t = reduceApp(s, { type: "setTransport", transport });
    expect(t.transport).toBe(transport);
    expect(reduceApp(t, { type: "setTransport", transport })).toBe(t);
  });
});
