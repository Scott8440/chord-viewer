// Practice history: what happened, as plain JSON records that are only ever added, never changed. Charts are worked
// out from them later (src/progress/stats.ts, to come), so a new chart never needs a new kind of record.
// Kept free of browser specifics so the same records can move to a server database later: random UUID ids (no
// clashes between devices), UTC epoch-ms times, a schema version per record, and the device that made it.
// Pure: the builders take everything they need, including the record's id, time and device (see recorder.ts).
import type { ChordPrompt } from "../exercises/chordPrompt";
import type { EarPrompt, MelodyPrompt } from "../exercises/earTraining";
import type { NotePrompt } from "../exercises/notePractice";
import type { ExerciseOptions, PrescriptiveId } from "../exercises/prescriptive";
import type { ProgressionPrompt } from "../exercises/progressions";
import { READING_PARTS, READING_RANGES, type ReadingPrompt } from "../exercises/sightReading";
import type { CircleDirection, ItemOutcome, RoutineState } from "../exercises/routines";
import type { RunResult, SequenceExercise } from "../exercises/sequence";
import { templateById } from "../theory";
import type { Strictness, Subdivision, TimingSummary } from "../timing/grid";

/** Bump when a record's shape changes; readers upgrade older records (see `upgradeRecord`) */
export const RECORD_VERSION = 1;

export interface RecordMeta {
  /** Random UUID */
  id: string;
  /** Schema version */
  v: number;
  /** When it was recorded: UTC milliseconds since 1970 */
  at: number;
  /** Which browser/device recorded it (a random UUID kept in that browser) */
  device: string;
}

/** The metronome a run was played to */
export interface TempoSettings {
  bpm: number;
  subdivision: Subdivision;
  strictness: Strictness;
  latencyMs: number;
}

/** One finished run of a prescriptive exercise (scale, diatonic chords …), alone or in a routine. */
export interface RunBody {
  kind: "run";
  /** Which exercise ("scales", "diatonic") */
  exercise: PrescriptiveId;
  /** The exercise with the settings that change what's played, e.g. "scale:C:major::1": runs to compare */
  exerciseId: string;
  /** e.g. "C major" */
  title: string;
  /** Key value, e.g. "C:major" */
  key: string;
  /** Null when played without the metronome */
  tempo: TempoSettings | null;
  mistakes: number;
  durationMs: number;
  /** Average tempo, one step per beat */
  bpm: number;
  evenness: number;
  timing: TimingSummary | null;
  /** The routine session it was played in, if any */
  routineSession: string | null;
}

export type RoutineItemOutcome =
  | { exercise: PrescriptiveId; exerciseId: string; key: string; skipped: true }
  | { exercise: PrescriptiveId; exerciseId: string; key: string; skipped: false; mistakes: number; evenness: number; onTime: number | null };

/** A routine session: finished, or abandoned part-way (`finished: false`). */
export interface RoutineBody {
  kind: "routine";
  /** Random UUID shared with the session's run records */
  session: string;
  routine: string;
  name: string;
  direction: CircleDirection;
  /** UTC ms of the first note */
  startedAt: number;
  /** First note to last note of the last finished item */
  durationMs: number;
  finished: boolean;
  /** How many items the routine has */
  totalItems: number;
  /** The items reached, in order */
  items: RoutineItemOutcome[];
  totalMistakes: number;
  tempo: TempoSettings | null;
}

/** "notes" is the old note practice (one note name, any octave), kept for its history; sight reading replaced it */
export type DrillKind = "reading" | "notes" | "chords" | "progressions" | "ear" | "melody";

/** One prompt of a drill (note, chord, progression practice or ear training), answered or skipped. */
export interface DrillBody {
  kind: "drill";
  drill: DrillKind;
  /** What was asked, as shown, e.g. "F♯", "Cmaj7/E", "V7 in G major", "ii–V–I in B♭ major" */
  prompt: string;
  /** Details for grouping later: chord type, inversion, prompt style, progression id … */
  detail: Record<string, string | number | boolean>;
  /** firstTry: right with no wrong attempt; corrected: right after a wrong one; skipped */
  outcome: "firstTry" | "corrected" | "skipped";
  /** From the prompt appearing to the answer (or skip) */
  ms: number;
}

export type RecordBody = RunBody | RoutineBody | DrillBody;
export type ProgressRecord = RecordBody & RecordMeta;

const tempoOf = (o: ExerciseOptions, latencyMs: number): TempoSettings | null =>
  o.metronome ? { bpm: o.bpm, subdivision: o.subdivision, strictness: o.strictness, latencyMs } : null;

export function runBody(exercise: PrescriptiveId, ex: SequenceExercise, options: ExerciseOptions, latencyMs: number,
                        result: RunResult, routineSession: string | null = null): RunBody {
  return {
    kind: "run", exercise, exerciseId: ex.id, title: ex.title, key: ex.keyValue,
    tempo: result.timing ? tempoOf(options, latencyMs) : null,
    mistakes: result.mistakes, durationMs: Math.round(result.durationMs), bpm: result.bpm, evenness: result.evenness,
    timing: result.timing, routineSession,
  };
}

const itemOutcome = (exercise: PrescriptiveId, ex: SequenceExercise, o: ItemOutcome): RoutineItemOutcome =>
  o === "skipped" ? { exercise, exerciseId: ex.id, key: ex.keyValue, skipped: true }
    : { exercise, exerciseId: ex.id, key: ex.keyValue, skipped: false, mistakes: o.mistakes, evenness: o.evenness,
        onTime: o.timing ? o.timing.onTime : null };

/**
 * A routine session from its state. `exerciseOf(i)` builds item i's exercise (as played); `toWall` turns a
 * performance.now() time into UTC ms.
 */
export function routineBody(r: RoutineState, session: string, direction: CircleDirection, latencyMs: number,
                            exerciseOf: (index: number) => SequenceExercise, toWall: (perfMs: number) => number): RoutineBody {
  const items = r.outcomes.map((o, i) => itemOutcome(r.items[i].exercise, exerciseOf(i), o));
  return {
    kind: "routine", session, routine: r.routine.id, name: r.routine.name, direction,
    startedAt: Math.round(toWall(r.startTime ?? 0)),
    durationMs: r.startTime != null && r.endTime != null ? Math.round(r.endTime - r.startTime) : 0,
    finished: r.status === "done", totalItems: r.items.length, items,
    totalMistakes: items.reduce((n, it) => n + (it.skipped ? 0 : it.mistakes), 0),
    tempo: r.current.grid ? tempoOf(r.base, latencyMs) : null,
  };
}

/** A chord as a prompt asks for it: "Cmaj7/E", or "V7 (inversion 1) in G major" */
function chordLabel(c: ChordPrompt): string {
  const inv = c.inversion && c.inversion.number > 0 ? c.inversion : null;
  if (c.roman) {
    const [tonic, mode] = c.roman.keyValue.split(":");
    return `${c.roman.numeral}${inv ? ` (inversion ${inv.number})` : ""} in ${tonic} ${mode}`;
  }
  return c.root + (templateById(c.type)?.symbol ?? c.type) + (inv ? "/" + inv.bass : "");
}

const outcomeOf = (answered: boolean, missed: boolean): DrillBody["outcome"] =>
  !answered ? "skipped" : missed ? "corrected" : "firstTry";

export function noteDrillBody(p: NotePrompt, answered: boolean, missed: boolean, ms: number): DrillBody {
  return { kind: "drill", drill: "notes", prompt: p.name, detail: { pc: p.pc }, outcome: outcomeOf(answered, missed), ms: Math.round(ms) };
}

/** A line of sight reading, judged as a whole; grouped by level for songs ("Songs, level 2"), by length and staff
 *  for generated lines ("4 notes, treble"), since lines rarely repeat */
export function readingDrillBody(p: ReadingPrompt, answered: boolean, missed: boolean, ms: number): DrillBody {
  const length = p.steps.length;
  const notes = p.steps.map(step => step.map(n => n.name).join("+")).join(" ");
  if (p.music) {
    const { part, level } = p.music;
    return {
      kind: "drill", drill: "reading", prompt: `${part === "voice" ? "Songs" : READING_PARTS[part]}, level ${level}`,
      detail: { key: p.keyValue, part, level, excerpt: p.music.id, length, notes },
      outcome: outcomeOf(answered, missed), ms: Math.round(ms),
    };
  }
  return {
    kind: "drill", drill: "reading", prompt: `${length} note${length === 1 ? "" : "s"}, ${READING_RANGES[p.range].label.toLowerCase()}`,
    detail: { key: p.keyValue, range: p.range, length, notes },
    outcome: outcomeOf(answered, missed), ms: Math.round(ms),
  };
}

export function chordDrillBody(p: ChordPrompt, answered: boolean, missed: boolean, ms: number): DrillBody {
  const detail: DrillBody["detail"] = { type: p.type, rootPc: p.rootPc, style: p.roman ? "roman" : "names" };
  if (p.inversion) detail.inversion = p.inversion.number;
  if (p.roman) { detail.numeral = p.roman.numeral; detail.key = p.roman.keyValue; }
  if (p.inKey) detail.key = p.inKey.keyValue;
  return { kind: "drill", drill: "chords", prompt: chordLabel(p), detail, outcome: outcomeOf(answered, missed), ms: Math.round(ms) };
}

/** An ear-training prompt, by degree ("Degree 5") so the trickiest degrees show across keys */
export function earDrillBody(p: EarPrompt, degrees: readonly string[], answered: boolean, missed: boolean, ms: number): DrillBody {
  return {
    kind: "drill", drill: "ear", prompt: `Degree ${p.degree}`,
    detail: { degree: p.degree, key: p.keyValue, note: p.note, degrees: degrees.join(",") },
    outcome: outcomeOf(answered, missed), ms: Math.round(ms),
  };
}

/** An ear-training melody, judged as a whole; grouped by length ("Root + 3 notes"), since melodies rarely repeat */
export function melodyDrillBody(p: MelodyPrompt, degrees: readonly string[], answered: boolean, missed: boolean, ms: number): DrillBody {
  const length = p.notes.length - 1;
  return {
    kind: "drill", drill: "melody", prompt: `Root + ${length} notes`,
    detail: { key: p.keyValue, melody: p.notes.map(n => n.degree).join(" "), length, degrees: degrees.join(",") },
    outcome: outcomeOf(answered, missed), ms: Math.round(ms),
  };
}

/** A progression, judged as a whole: first try only if every chord was */
export function progressionDrillBody(p: ProgressionPrompt, answered: boolean, chordsFirstTry: number, ms: number): DrillBody {
  const [tonic, mode] = p.keyValue.split(":");
  return {
    kind: "drill", drill: "progressions", prompt: `${p.name} in ${tonic} ${mode}`,
    detail: { progression: p.id, key: p.keyValue, chords: p.chords.length, chordsFirstTry },
    outcome: !answered ? "skipped" : chordsFirstTry === p.chords.length ? "firstTry" : "corrected", ms: Math.round(ms),
  };
}

/* ---------------------------------------------------------------
   Reading records back (from storage or an imported file)
   --------------------------------------------------------------- */

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** A record from outside (an import, or storage written by another version), checked and upgraded; null if unusable. */
export function upgradeRecord(raw: unknown): ProgressRecord | null {
  if (!isObj(raw)) return null;
  const { id, v, at, device, kind } = raw;
  if (typeof id !== "string" || !id || typeof v !== "number" || typeof at !== "number" || !Number.isFinite(at) ||
      typeof device !== "string" || (kind !== "run" && kind !== "routine" && kind !== "drill")) return null;
  // Newer than this app understands: keep out rather than misread
  if (v > RECORD_VERSION) return null;
  // Version 1 is current; upgrades from older versions go here as the schema changes
  return raw as unknown as ProgressRecord;
}

/** The export file: a wrapper that says what it is, then the records. */
export const EXPORT_FORMAT = "chord-display-history";

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: number;
  records: ProgressRecord[];
}

export const exportFile = (records: readonly ProgressRecord[], now: number): ExportFile =>
  ({ format: EXPORT_FORMAT, version: RECORD_VERSION, exportedAt: now, records: [...records] });

/** Reads an export file's text: its usable records and how many were skipped, or an error message. */
export function parseExport(text: string): { records: ProgressRecord[]; skipped: number } | { error: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { error: "That file isn't valid JSON." }; }
  if (!isObj(data) || data.format !== EXPORT_FORMAT || !Array.isArray(data.records)) {
    return { error: "That isn't a practice history file." };
  }
  const records = data.records.map(upgradeRecord);
  const usable = records.filter((r): r is ProgressRecord => !!r);
  return { records: usable, skipped: records.length - usable.length };
}
