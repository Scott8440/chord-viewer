// Practice history: records built from what finished, export/import, the store and the recorder.
import { describe, expect, it } from "vitest";
import { DEFAULT_EXERCISE_OPTIONS } from "../src/exercises/prescriptive";
import { progressionChords, progressionById } from "../src/exercises/progressions";
import { initialRoutine, itemExercise, reduceRoutine, routineById } from "../src/exercises/routines";
import { scaleExercise } from "../src/exercises/scales";
import { runResult } from "../src/exercises/sequence";
import { createRecorder } from "../src/progress/recorder";
import {
  chordDrillBody, exportFile, noteDrillBody, parseExport, progressionDrillBody, RECORD_VERSION, routineBody, runBody,
  upgradeRecord, type ProgressRecord,
} from "../src/progress/records";
import { createMemoryStore } from "../src/progress/store";
import { buildKey } from "../src/theory";
import { startTransport } from "../src/timing/transport";

const C = buildKey("C:major")!;
const meta = (id: string, at = 1000) => ({ id, v: RECORD_VERSION, at, device: "dev" });

describe("run records", () => {
  const ex = scaleExercise(C, "natural", 1);

  it("keep the exercise, its settings and the result", () => {
    const r = runBody("scales", ex, DEFAULT_EXERCISE_OPTIONS, 0, runResult([0, 500, 1000], 2));
    expect(r).toMatchObject({ kind: "run", exercise: "scales", exerciseId: "scale:C:major::1", title: "C major", key: "C:major",
                              tempo: null, mistakes: 2, durationMs: 1000, bpm: 120, evenness: 1, timing: null, routineSession: null });
  });

  it("keep the metronome settings when played to it", () => {
    const timing = { onTime: 0.9, meanOffsetMs: -10, spreadMs: 8, slips: 0, bpm: 96, subdivision: 2 as const };
    const opts = { ...DEFAULT_EXERCISE_OPTIONS, metronome: true, bpm: 96, subdivision: 2 as const };
    const r = runBody("scales", ex, opts, -25, runResult([0, 300], 0, timing), "session-1");
    expect(r.tempo).toEqual({ bpm: 96, subdivision: 2, strictness: "strict", latencyMs: -25 });
    expect(r).toMatchObject({ timing, routineSession: "session-1" });
  });
});

describe("routine records", () => {
  const scales = routineById("scales-circle")!;
  const base = DEFAULT_EXERCISE_OPTIONS;
  /** Plays the item in progress through, cleanly, from `t` */
  const playItem = (r: ReturnType<typeof initialRoutine>, t: number) =>
    r.current.exercise.steps.reduce((s, st, i) =>
      reduceRoutine(s, { type: "noteOn", note: 60 + (r.current.exercise.basePc) + (st.kind === "note" ? st.offset : 0), time: t + 100 * i }), r);

  it("a session part-way: items reached, time from first note to last, not finished", () => {
    let r = initialRoutine(scales, "sharps", base);
    r = playItem(r, 1000);
    r = reduceRoutine(r, { type: "skip", held: [] });
    const body = routineBody(r, "s1", "sharps", 0, i => itemExercise(r.items[i], r.base), perf => 1_700_000_000_000 + perf);
    expect(body).toMatchObject({ kind: "routine", session: "s1", routine: "scales-circle", direction: "sharps", finished: false,
                                 totalItems: 12, durationMs: 1400, startedAt: 1_700_000_001_000, totalMistakes: 0, tempo: null });
    expect(body.items).toEqual([
      { exercise: "scales", exerciseId: "scale:C:major::1", key: "C:major", skipped: false, mistakes: 0, evenness: 1, onTime: null },
      { exercise: "scales", exerciseId: "scale:G:major::1", key: "G:major", skipped: true },
    ]);
  });

  it("a finished session", () => {
    let r = initialRoutine(scales, "sharps", base);
    for (let i = 0; i < 12; i++) r = playItem(r, 10_000 * i);
    expect(r.status).toBe("done");
    const body = routineBody(r, "s2", "sharps", 0, i => itemExercise(r.items[i], r.base), p => p);
    expect(body).toMatchObject({ finished: true, totalItems: 12 });
    expect(body.items).toHaveLength(12);
  });

  it("notes the metronome a session was played to", () => {
    const grid = { transport: startTransport(100, 4, 0), subdivision: 1 as const, strictness: "strict" as const, latencyMs: 0 };
    const r = initialRoutine(scales, "flats", { ...base, metronome: true, bpm: 100 }, [], grid);
    expect(routineBody(r, "s3", "flats", 12, () => r.current.exercise, p => p).tempo)
      .toEqual({ bpm: 100, subdivision: 1, strictness: "strict", latencyMs: 12 });
  });
});

describe("drill records", () => {
  it("notes: first try, corrected or skipped", () => {
    const p = { pc: 6, name: "F#" };
    expect(noteDrillBody(p, true, false, 812.4)).toEqual({ kind: "drill", drill: "notes", prompt: "F#", detail: { pc: 6 }, outcome: "firstTry", ms: 812 });
    expect(noteDrillBody(p, true, true, 0).outcome).toBe("corrected");
    expect(noteDrillBody(p, false, true, 0).outcome).toBe("skipped");
  });

  it("chords: as asked, with what's needed to group them", () => {
    const named = chordDrillBody({ rootPc: 0, root: "C", type: "maj7", inversion: { number: 1, bass: "E", bassPc: 4 } }, true, false, 1500);
    expect(named).toMatchObject({ prompt: "Cmaj7/E", detail: { type: "maj7", rootPc: 0, style: "names", inversion: 1 } });
    const roman = chordDrillBody({ rootPc: 2, root: "D", type: "7", roman: { numeral: "V7", keyValue: "G:major", filterIgnored: false } }, true, true, 2000);
    expect(roman).toMatchObject({ prompt: "V7 in G major", outcome: "corrected", detail: { style: "roman", numeral: "V7", key: "G:major" } });
  });

  it("progressions: first try only if every chord was", () => {
    const def = progressionById(PROG_ID)!;
    const p = { id: def.id, name: def.name, keyValue: "C:major", chords: progressionChords(def, C) };
    expect(progressionDrillBody(p, true, p.chords.length, 5000)).toMatchObject({ drill: "progressions", outcome: "firstTry",
      prompt: `${def.name} in C major`, detail: { progression: def.id, key: "C:major", chords: p.chords.length } });
    expect(progressionDrillBody(p, true, p.chords.length - 1, 0).outcome).toBe("corrected");
    expect(progressionDrillBody(p, false, 0, 0).outcome).toBe("skipped");
  });
});
const PROG_ID = "I-V-vi-IV";

describe("reading records back", () => {
  const good = { ...noteDrillBody({ pc: 0, name: "C" }, true, false, 100), ...meta("a") };

  it("keeps valid records, drops malformed ones and ones from a newer version", () => {
    expect(upgradeRecord(good)).toEqual(good);
    expect(upgradeRecord({ ...good, id: "" })).toBeNull();
    expect(upgradeRecord({ ...good, kind: "nonsense" })).toBeNull();
    expect(upgradeRecord({ ...good, at: "yesterday" })).toBeNull();
    expect(upgradeRecord({ ...good, v: RECORD_VERSION + 1 })).toBeNull();
    expect(upgradeRecord("x")).toBeNull();
  });

  it("an export file round-trips, and other files are refused", () => {
    const file = JSON.stringify(exportFile([good], 5));
    expect(parseExport(file)).toEqual({ records: [good], skipped: 0 });
    expect(parseExport(JSON.stringify({ ...JSON.parse(file), records: [good, { junk: 1 }] }))).toEqual({ records: [good], skipped: 1 });
    expect(parseExport("{not json")).toEqual({ error: "That file isn't valid JSON." });
    expect(parseExport(JSON.stringify({ records: [] }))).toEqual({ error: "That isn't a practice history file." });
  });
});

describe("store", () => {
  const rec = (id: string, at: number) => ({ ...noteDrillBody({ pc: 0, name: "C" }, true, false, 100), ...meta(id, at) }) as ProgressRecord;

  it("keeps records oldest first", async () => {
    const s = createMemoryStore();
    await s.add(rec("b", 2)); await s.add(rec("a", 1));
    expect((await s.all()).map(r => r.id)).toEqual(["a", "b"]);
    expect(await s.count()).toBe(2);
  });

  it("merging adds only records it doesn't have (by id), so importing twice is harmless", async () => {
    const s = createMemoryStore([rec("a", 1)]);
    expect(await s.merge([rec("a", 1), rec("b", 2), rec("c", 3)])).toBe(2);
    expect(await s.merge([rec("b", 2)])).toBe(0);
    expect(await s.count()).toBe(3);
  });
});

describe("recorder", () => {
  it("stamps each record with an id, the schema version, the time and the device, then stores it", async () => {
    const store = createMemoryStore();
    let n = 0;
    const recorder = createRecorder(Promise.resolve(store), "my-device", () => 1234, () => `id-${++n}`);
    const seen: string[] = [];
    recorder.onRecorded(r => seen.push(r.id));
    recorder.record(noteDrillBody({ pc: 0, name: "C" }, true, false, 100));
    recorder.record(noteDrillBody({ pc: 2, name: "D" }, false, false, 100));
    await new Promise(r => setTimeout(r, 0));
    const all = await store.all();
    expect(all.map(r => ({ id: r.id, v: r.v, at: r.at, device: r.device }))).toEqual([
      { id: "id-1", v: RECORD_VERSION, at: 1234, device: "my-device" },
      { id: "id-2", v: RECORD_VERSION, at: 1234, device: "my-device" },
    ]);
    expect(seen).toEqual(["id-1", "id-2"]);
  });
});
