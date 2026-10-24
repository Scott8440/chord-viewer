// What the Progress view charts, worked out from the records. Pure: records (and the time zone's day boundaries,
// via `dayOf`) in, plain series out.
import type { DrillKind, ProgressRecord, RoutineBody, RunBody, DrillBody, RecordMeta } from "./records";
import { INVERSION_NAMES } from "../exercises/technique";

type Run = RunBody & RecordMeta;
type Routine = RoutineBody & RecordMeta;
type Drill = DrillBody & RecordMeta;

/** Local calendar day of a UTC ms time, as a sortable "YYYY-MM-DD" */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local midnight starting a day key */
export const dayStart = (day: string): number => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

/** Records from `from` (UTC ms) on; null = all */
export const since = (records: readonly ProgressRecord[], from: number | null) =>
  from == null ? [...records] : records.filter(r => r.at >= from);

const runs = (rs: readonly ProgressRecord[]) => rs.filter((r): r is Run => r.kind === "run");
const routines = (rs: readonly ProgressRecord[]) => rs.filter((r): r is Routine => r.kind === "routine");
const drills = (rs: readonly ProgressRecord[]) => rs.filter((r): r is Drill => r.kind === "drill");

/** A drill prompt left unanswered longer than this was put down, not worked on: it counts this much */
const DRILL_CAP_MS = 60_000;

/**
 * Time spent playing, per day: exercise runs on their own, routine sessions (which include their runs and the
 * moves between items), and drill prompts (each capped, so a prompt left on screen doesn't count as practice).
 */
export function practicePerDay(records: readonly ProgressRecord[]): { day: string; ms: number }[] {
  const byDay = new Map<string, number>();
  const add = (at: number, ms: number) => byDay.set(dayOf(at), (byDay.get(dayOf(at)) ?? 0) + Math.max(0, ms));
  for (const r of runs(records)) if (!r.routineSession) add(r.at, r.durationMs);
  for (const r of routines(records)) add(r.startedAt || r.at, r.durationMs);
  for (const r of drills(records)) add(r.at, Math.min(r.ms, DRILL_CAP_MS));
  return [...byDay].map(([day, ms]) => ({ day, ms })).sort((a, b) => a.day < b.day ? -1 : 1);
}

export interface Summary {
  daysPractised: number;
  practiceMs: number;
  runs: number;
  cleanRuns: number;
  routinesFinished: number;
  drillPrompts: number;
}

export function summary(records: readonly ProgressRecord[]): Summary {
  const perDay = practicePerDay(records), rs = runs(records);
  return {
    daysPractised: perDay.filter(d => d.ms > 0).length,
    practiceMs: perDay.reduce((n, d) => n + d.ms, 0),
    runs: rs.length,
    cleanRuns: rs.filter(r => !r.mistakes).length,
    routinesFinished: routines(records).filter(r => r.finished).length,
    drillPrompts: drills(records).length,
  };
}

export interface RoutineOption { id: string; name: string; finished: number }

/** Routines with at least one finished session, most played first */
export function routineOptions(records: readonly ProgressRecord[]): RoutineOption[] {
  const m = new Map<string, RoutineOption>();
  for (const r of routines(records)) if (r.finished) {
    const o = m.get(r.routine) ?? { id: r.routine, name: r.name, finished: 0 };
    o.finished++;
    m.set(r.routine, o);
  }
  return [...m.values()].sort((a, b) => b.finished - a.finished || a.name.localeCompare(b.name));
}

export interface RoutinePoint { at: number; durationMs: number; mistakes: number; direction: string; bpm: number | null }

/** Each finished session of a routine, oldest first */
export const routineSessions = (records: readonly ProgressRecord[], routine: string): RoutinePoint[] =>
  routines(records).filter(r => r.finished && r.routine === routine)
    .map(r => ({ at: r.startedAt || r.at, durationMs: r.durationMs, mistakes: r.totalMistakes, direction: r.direction, bpm: r.tempo?.bpm ?? null }))
    .sort((a, b) => a.at - b.at);

export interface ExerciseOption { exerciseId: string; label: string; runs: number }

/** "C major scale, 1 octave", "A harmonic minor scale, 2 octaves", "C major triads, any voicing" */
export function exerciseLabel(r: Pick<RunBody, "exercise" | "exerciseId" | "title">): string {
  const parts = r.exerciseId.split(":");
  if (r.exercise === "scales") {
    const octaves = Number(parts[parts.length - 1]) || 1;
    return `${r.title} scale, ${octaves} octave${octaves > 1 ? "s" : ""}`;
  }
  if (r.exercise === "diatonic") return `${r.title}${parts[parts.length - 1] === "any" ? ", any voicing" : ""}`;
  const octaves = (n: string) => `${n} octave${n === "2" ? "s" : ""}`;
  if (r.exercise === "arpeggios") {
    const inversion = Number(parts[3]);
    return `${r.title}${inversion ? `, ${INVERSION_NAMES[inversion]}` : ""}, ${octaves(parts[4])}`;
  }
  if (r.exercise === "brokenChords" || r.exercise === "chromatic") return `${r.title}, ${octaves(parts[parts.length - 1])}`;
  return r.title;
}

/** Exercises with runs, most played first */
export function exerciseOptions(records: readonly ProgressRecord[]): ExerciseOption[] {
  const m = new Map<string, ExerciseOption>();
  for (const r of runs(records)) {
    const o = m.get(r.exerciseId) ?? { exerciseId: r.exerciseId, label: exerciseLabel(r), runs: 0 };
    o.runs++;
    m.set(r.exerciseId, o);
  }
  return [...m.values()].sort((a, b) => b.runs - a.runs || a.label.localeCompare(b.label));
}

export interface RunPoint {
  at: number;
  mistakes: number;
  /** Share on time (0–1) against the metronome, null without it */
  onTime: number | null;
  evenness: number;
  /** "96 BPM, eighths", or null without the metronome */
  tempo: string | null;
  inRoutine: boolean;
}

const SUBDIVISION = { 1: "quarters", 2: "eighths", 4: "sixteenths" } as Record<number, string>;

/** Each run of an exercise, oldest first */
export const exerciseRuns = (records: readonly ProgressRecord[], exerciseId: string): RunPoint[] =>
  runs(records).filter(r => r.exerciseId === exerciseId).map(r => ({
    at: r.at, mistakes: r.mistakes, onTime: r.timing?.onTime ?? null, evenness: r.evenness,
    tempo: r.tempo ? `${r.tempo.bpm} BPM, ${SUBDIVISION[r.tempo.subdivision]}` : null, inRoutine: !!r.routineSession,
  })).sort((a, b) => a.at - b.at);

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The median of a value per day (for the trend line through noisy per-run points), placed at midday */
export function dailyMedian<T extends { at: number }>(points: readonly T[], value: (p: T) => number | null): { day: string; at: number; value: number; n: number }[] {
  const byDay = new Map<string, number[]>();
  for (const p of points) {
    const v = value(p);
    if (v == null) continue;
    const d = dayOf(p.at);
    byDay.set(d, [...(byDay.get(d) ?? []), v]);
  }
  return [...byDay].sort((a, b) => a[0] < b[0] ? -1 : 1)
    .map(([day, vs]) => ({ day, at: dayStart(day) + 12 * 3600_000, value: median(vs), n: vs.length }));
}

/** In series order: a drill keeps its colour, so new ones go at the end */
export const DRILLS: readonly DrillKind[] = ["notes", "chords", "progressions", "ear", "melody", "reading"];

/** Per day and drill: the share of prompts right first time (skips count against), and how many there were */
export function drillsPerDay(records: readonly ProgressRecord[]): Record<DrillKind, { day: string; at: number; firstTry: number; n: number }[]> {
  const out = {} as Record<DrillKind, { day: string; at: number; firstTry: number; n: number }[]>;
  for (const kind of DRILLS) {
    const byDay = new Map<string, Drill[]>();
    for (const d of drills(records)) if (d.drill === kind) byDay.set(dayOf(d.at), [...(byDay.get(dayOf(d.at)) ?? []), d]);
    out[kind] = [...byDay].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([day, ds]) => ({
      day, at: dayStart(day) + 12 * 3600_000, n: ds.length,
      firstTry: ds.filter(d => d.outcome === "firstTry").length / ds.length,
    }));
  }
  return out;
}

export interface WeakPrompt { prompt: string; drill: DrillKind; asked: number; firstTry: number; medianMs: number }

/** Prompts asked at least `minAsked` times, least often right first time first (then slowest) */
export function weakestPrompts(records: readonly ProgressRecord[], limit = 8, minAsked = 2): WeakPrompt[] {
  const m = new Map<string, Drill[]>();
  for (const d of drills(records)) {
    if (d.drill === "progressions") continue;
    const k = `${d.drill}|${d.prompt}`;
    m.set(k, [...(m.get(k) ?? []), d]);
  }
  return [...m.values()].filter(ds => ds.length >= minAsked).map(ds => {
    const answered = ds.filter(d => d.outcome !== "skipped").map(d => d.ms);
    return { prompt: ds[0].prompt, drill: ds[0].drill, asked: ds.length,
             firstTry: ds.filter(d => d.outcome === "firstTry").length / ds.length,
             medianMs: answered.length ? median(answered) : 0 };
  }).filter(w => w.firstTry < 1).sort((a, b) => a.firstTry - b.firstTry || b.medianMs - a.medianMs).slice(0, limit);
}
