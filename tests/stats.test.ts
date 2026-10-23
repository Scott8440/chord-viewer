// What the Progress view charts, worked out from records.
import { describe, expect, it } from "vitest";
import { RECORD_VERSION, type ProgressRecord } from "../src/progress/records";
import {
  dailyMedian, dayOf, dayStart, drillsPerDay, exerciseLabel, exerciseOptions, exerciseRuns, practicePerDay, routineOptions,
  routineSessions, since, summary, weakestPrompts,
} from "../src/progress/stats";
import { niceTicks } from "../src/views/charts";

let n = 0;
const at = (day: string, hour = 10) => dayStart(day) + hour * 3600_000;
const meta = (when: number) => ({ id: `r${++n}`, v: RECORD_VERSION, at: when, device: "d" });
const run = (when: number, o: Partial<ProgressRecord & { kind: "run" }> = {}) => ({
  kind: "run", exercise: "scales", exerciseId: "scale:C:major::1", title: "C major", key: "C:major", tempo: null,
  mistakes: 0, durationMs: 10_000, bpm: 100, evenness: 0.9, timing: null, routineSession: null, ...meta(when), ...o,
}) as ProgressRecord;
const routine = (when: number, o: Record<string, unknown> = {}) => ({
  kind: "routine", session: "s", routine: "scales-circle", name: "Major scales, circle of fifths", direction: "sharps",
  startedAt: when, durationMs: 300_000, finished: true, totalItems: 12, items: [], totalMistakes: 3, tempo: null, ...meta(when), ...o,
}) as ProgressRecord;
const drill = (when: number, outcome: string, o: Record<string, unknown> = {}) => ({
  kind: "drill", drill: "chords", prompt: "Cmaj7", detail: {}, outcome, ms: 2000, ...meta(when), ...o,
}) as ProgressRecord;

describe("days", () => {
  it("are local calendar days", () => {
    expect(dayOf(at("2026-03-05", 23))).toBe("2026-03-05");
    expect(dayOf(at("2026-03-05", 0))).toBe("2026-03-05");
    expect(dayStart("2026-03-05")).toBe(new Date(2026, 2, 5).getTime());
  });

  it("since: records from a time on", () => {
    const rs = [run(at("2026-03-01")), run(at("2026-03-05"))];
    expect(since(rs, at("2026-03-03"))).toHaveLength(1);
    expect(since(rs, null)).toHaveLength(2);
  });
});

describe("practice time", () => {
  it("adds runs on their own, routine sessions (not their runs again) and drills (each capped at a minute)", () => {
    const rs = [
      run(at("2026-03-01"), { durationMs: 20_000 }),
      run(at("2026-03-01"), { durationMs: 15_000, routineSession: "s" }),   // inside the routine below
      routine(at("2026-03-01"), { durationMs: 120_000 }),
      drill(at("2026-03-01"), "firstTry", { ms: 5_000 }),
      drill(at("2026-03-01"), "skipped", { ms: 600_000 }),                 // left on screen: counts a minute
      run(at("2026-03-03"), { durationMs: 30_000 }),
    ];
    expect(practicePerDay(rs)).toEqual([{ day: "2026-03-01", ms: 205_000 }, { day: "2026-03-03", ms: 30_000 }]);
    expect(summary(rs)).toEqual({ daysPractised: 2, practiceMs: 235_000, runs: 3, cleanRuns: 3, routinesFinished: 1, drillPrompts: 2 });
  });
});

describe("routines", () => {
  it("only finished sessions, most played routine first", () => {
    const rs = [
      routine(at("2026-03-02"), { durationMs: 250_000, totalMistakes: 1 }), routine(at("2026-03-01")),
      routine(at("2026-03-03"), { finished: false }),
      routine(at("2026-03-03"), { routine: "triads-circle", name: "Diatonic chords, circle of fifths" }),
    ];
    expect(routineOptions(rs).map(r => [r.id, r.finished])).toEqual([["scales-circle", 2], ["triads-circle", 1]]);
    expect(routineSessions(rs, "scales-circle").map(s => [s.durationMs, s.mistakes])).toEqual([[300_000, 3], [250_000, 1]]);
  });
});

describe("exercises", () => {
  it("are labelled with what defines them", () => {
    expect(exerciseLabel({ exercise: "scales", exerciseId: "scale:C:major::2", title: "C major" })).toBe("C major scale, 2 octaves");
    expect(exerciseLabel({ exercise: "scales", exerciseId: "scale:A:minor:harmonic:1", title: "A harmonic minor" })).toBe("A harmonic minor scale, 1 octave");
    expect(exerciseLabel({ exercise: "diatonic", exerciseId: "diatonic:G:major:3:any", title: "G major triads" })).toBe("G major triads, any voicing");
    expect(exerciseLabel({ exercise: "diatonic", exerciseId: "diatonic:G:major:7:root", title: "G major sevenths" })).toBe("G major sevenths");
  });

  it("most played first; runs with their timing and metronome", () => {
    const timing = { onTime: 0.8, meanOffsetMs: 0, spreadMs: 0, slips: 0, bpm: 96, subdivision: 2 };
    const rs = [
      run(at("2026-03-01"), { exerciseId: "scale:G:major::1", title: "G major" }),
      run(at("2026-03-02"), { mistakes: 2 }),
      run(at("2026-03-01"), { timing, tempo: { bpm: 96, subdivision: 2, strictness: "strict", latencyMs: 0 }, routineSession: "s" } as never),
    ];
    expect(exerciseOptions(rs).map(o => [o.label, o.runs])).toEqual([["C major scale, 1 octave", 2], ["G major scale, 1 octave", 1]]);
    expect(exerciseRuns(rs, "scale:C:major::1")).toEqual([
      { at: at("2026-03-01"), mistakes: 0, onTime: 0.8, evenness: 0.9, tempo: "96 BPM, eighths", inRoutine: true },
      { at: at("2026-03-02"), mistakes: 2, onTime: null, evenness: 0.9, tempo: null, inRoutine: false },
    ]);
  });

  it("the daily median: a trend through noisy runs, skipping missing values", () => {
    const pts = [{ at: at("2026-03-01", 9), v: 4 }, { at: at("2026-03-01", 10), v: 0 }, { at: at("2026-03-01", 11), v: 1 },
                 { at: at("2026-03-02"), v: null }, { at: at("2026-03-03"), v: 2 }];
    expect(dailyMedian(pts, p => p.v)).toEqual([
      { day: "2026-03-01", at: at("2026-03-01", 12), value: 1, n: 3 },
      { day: "2026-03-03", at: at("2026-03-03", 12), value: 2, n: 1 },
    ]);
  });
});

describe("drills", () => {
  it("right first time per day and drill; skips count against", () => {
    const rs = [drill(at("2026-03-01"), "firstTry"), drill(at("2026-03-01"), "corrected"), drill(at("2026-03-01"), "skipped"),
                drill(at("2026-03-01"), "firstTry", { drill: "notes", prompt: "F#" })];
    const d = drillsPerDay(rs);
    expect(d.chords).toEqual([{ day: "2026-03-01", at: at("2026-03-01", 12), firstTry: 1 / 3, n: 3 }]);
    expect(d.notes[0].firstTry).toBe(1);
    expect(d.progressions).toEqual([]);
  });

  it("the trickiest prompts: asked at least twice, least often right first time, then slowest", () => {
    const rs = [
      drill(1, "corrected", { prompt: "Bdim/F", ms: 6000 }), drill(2, "skipped", { prompt: "Bdim/F" }),
      drill(3, "firstTry", { prompt: "Cmaj7", ms: 1000 }), drill(4, "corrected", { prompt: "Cmaj7", ms: 4000 }),
      drill(5, "firstTry", { prompt: "G" }), drill(6, "firstTry", { prompt: "G" }),   // always right: not tricky
      drill(7, "corrected", { prompt: "E7" }),                                         // asked once: not enough
    ];
    expect(weakestPrompts(rs).map(w => [w.prompt, w.asked, w.firstTry, w.medianMs])).toEqual([["Bdim/F", 2, 0, 6000], ["Cmaj7", 2, 0.5, 2500]]);
  });
});

describe("chart axes", () => {
  it("round ticks covering the values", () => {
    expect(niceTicks(0, 7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0, 1)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(0, 0)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(0, 43)).toEqual([0, 20, 40, 60]);
  });
});
