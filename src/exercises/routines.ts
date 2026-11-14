// Routines: a set of prescriptive exercises played one after another, e.g. every major scale round the circle of
// fifths. A routine is data pointing at exercises in PRESCRIPTIVE; the runner wraps the sequence reducer and moves on
// to the next item each time an item's run finishes (mistakes allowed; they are recorded).
import { buildKey, CIRCLE_OF_FIFTHS_MAJOR } from "../theory";
import { sanitizeExerciseOptions, PRESCRIPTIVE, type ExerciseOptions, type PrescriptiveId } from "./prescriptive";
import type { TimingGrid } from "../timing/grid";
import { initialSequence, reduceSequence, type RunResult, type SequenceAction, type SequenceExercise, type SequenceState } from "./sequence";

export const CIRCLE_DIRECTIONS = ["sharps", "flats"] as const;
/**
 * Which way a routine goes through the keys. Round the circle of fifths, sharps: C G D … (up by fifths), flats:
 * C F B♭ … (down by fifths). Chromatically, sharps is up (C D♭ D …) and flats down (C B B♭ …). Saved, so the values
 * keep their names whatever the routine's order.
 */
export type CircleDirection = typeof CIRCLE_DIRECTIONS[number];

/** The order a routine takes the keys in */
export type KeyOrder = "circle" | "chromatic";

/** How each order names the two directions: the direction picker's options, and short forms for history */
export const DIRECTION_NAMES: Record<KeyOrder, Record<CircleDirection, { long: string; short: string; arrow: string }>> = {
  circle: { sharps: { long: "Sharps first (C G D …)", short: "sharps", arrow: "↻" },
            flats: { long: "Flats first (C F B♭ …)", short: "flats", arrow: "↺" } },
  chromatic: { sharps: { long: "Up (C D♭ D …)", short: "up", arrow: "↑" },
               flats: { long: "Down (C B B♭ …)", short: "down", arrow: "↓" } },
};

/** Major key values in circle-of-fifths order, starting on C. */
export function circleOfFifths(direction: CircleDirection): string[] {
  const keys = direction === "sharps" ? CIRCLE_OF_FIFTHS_MAJOR : [CIRCLE_OF_FIFTHS_MAJOR[0], ...CIRCLE_OF_FIFTHS_MAJOR.slice(1).reverse()];
  return keys.map(t => `${t}:major`);
}

/** The 12 major tonics a semitone apart from C, spelled as on the circle: position i is i fifths, 7i semitones, up */
export const CHROMATIC_TONICS = CIRCLE_OF_FIFTHS_MAJOR.map((t, i) => ({ t, pc: (i * 7) % 12 })).sort((a, b) => a.pc - b.pc).map(k => k.t);

/**
 * Major key values a semitone apart, starting on `from` (C by default): up (C D♭ D E♭ …) or down (C B B♭ A …),
 * spelled as on the circle (F♯ for the key six semitones up, as in the key lists). With `octave`, the start again
 * at the end: 13 keys, up or down an octave.
 */
export function chromaticKeys(direction: CircleDirection, from = "C:major", octave = false): string[] {
  const start = Math.max(0, CHROMATIC_TONICS.indexOf(from.split(":")[0]));
  const up = [...CHROMATIC_TONICS.slice(start), ...CHROMATIC_TONICS.slice(0, start)];
  const keys = direction === "sharps" ? up : [up[0], ...up.slice(1).reverse()];
  return [...keys, ...(octave ? [keys[0]] : [])].map(t => `${t}:major`);
}

/** The key a routine starts on, when it lets the player choose (`Routine.startsOn`) */
export const DEFAULT_START = "C:major";

/** One exercise in a routine. Options it doesn't set (octaves, sevenths …) come from the player's exercise settings. */
export interface RoutineItem {
  exercise: PrescriptiveId;
  options: Partial<ExerciseOptions>;
}

export interface Routine {
  id: string;
  name: string;
  /** The order it takes the keys in, which names its directions (`DIRECTION_NAMES`) */
  order: KeyOrder;
  /** The player chooses the key it starts on (`RoutineOptions.start`) */
  startsOn?: boolean;
  /** The items, in order, which depend on the direction (and the start, for routines that let you choose it) */
  items(direction: CircleDirection, start?: string): RoutineItem[];
}

/** For each key, the given exercises in order (e.g. its scale, then its triads). */
export const eachKey = (keys: readonly string[], exercises: readonly PrescriptiveId[]): RoutineItem[] =>
  keys.flatMap(key => exercises.map(exercise => ({ exercise, options: { key } })));

/** The curated routines (deliberately a list, not a builder). */
export const ROUTINES: readonly Routine[] = [
  { id: "scales-circle", name: "Major scales, circle of fifths", order: "circle",
    items: d => eachKey(circleOfFifths(d), ["scales"]) },
  { id: "scales-chromatic", name: "Major scales, chromatic", order: "chromatic",
    items: d => eachKey(chromaticKeys(d), ["scales"]) },
  { id: "major-triads-octave", name: "Major triads, up an octave", order: "chromatic", startsOn: true,
    items: (d, start = DEFAULT_START) => eachKey(chromaticKeys(d, start, true), ["triad"]) },
  { id: "triads-circle", name: "Diatonic chords, circle of fifths", order: "circle",
    items: d => eachKey(circleOfFifths(d), ["diatonic"]) },
  { id: "scale-triads-circle", name: "Scale, then diatonic chords, circle of fifths", order: "circle",
    items: d => eachKey(circleOfFifths(d), ["scales", "diatonic"]) },
  { id: "technique-circle", name: "Five-finger pattern, scale, arpeggio, broken chords, circle of fifths", order: "circle",
    items: d => eachKey(circleOfFifths(d), ["fiveFinger", "scales", "arpeggios", "brokenChords"]) },
];

export const routineById = (id: string): Routine | undefined => ROUTINES.find(r => r.id === id);

/** The playable exercise for an item: the item's own options over the player's settings. */
export function itemExercise(item: RoutineItem, base: ExerciseOptions): SequenceExercise {
  return PRESCRIPTIVE[item.exercise].build(sanitizeExerciseOptions({ ...base, ...item.options }));
}

/** An item's outcome: its run's result, or "skipped" */
export type ItemOutcome = RunResult | "skipped";

export interface RoutineState {
  routine: Routine;
  items: RoutineItem[];
  /** The player's exercise settings the items are built over */
  base: ExerciseOptions;
  /** Index of the item in progress */
  index: number;
  /** The item in progress */
  current: SequenceState;
  /** One per finished or skipped item, in order */
  outcomes: ItemOutcome[];
  /** The item before this one finished: shown until the next one starts */
  previous: { index: number; result: RunResult } | null;
  /** Time of the first note of the routine and of the last note of its last finished item */
  startTime: number | null;
  endTime: number | null;
  status: "playing" | "done";
}

export type RoutineAction =
  | Extract<SequenceAction, { type: "noteOn" | "held" | "setGrid" }>
  /** Move on without finishing the item */
  | { type: "skip"; held: number[] }
  /** The player's exercise settings changed: rebuild the item in progress (later items are built when reached) */
  | { type: "setBase"; base: ExerciseOptions };

/** Which way, and where to start (for routines that let you choose): a direction alone starts on the default */
export type RoutineSetup = CircleDirection | Pick<RoutineOptions, "direction" | "start">;

export function initialRoutine(routine: Routine, setup: RoutineSetup, base: ExerciseOptions, held: number[] = [],
                               grid: TimingGrid | null = null): RoutineState {
  const { direction, start } = typeof setup === "string" ? { direction: setup, start: DEFAULT_START } : setup;
  const items = routine.items(direction, start);
  return { routine, items, base, index: 0, current: initialSequence(itemExercise(items[0], base), held, grid),
           outcomes: [], previous: null, startTime: null, endTime: null, status: "playing" };
}

export function reduceRoutine(s: RoutineState, a: RoutineAction): RoutineState {
  if (s.status === "done") return s;
  switch (a.type) {
    case "noteOn":
    case "held": {
      const current = reduceSequence(s.current, a);
      if (current === s.current) return s;
      const started = current.status === "playing" && s.current.status !== "playing";
      const next = { ...s, current,
                     startTime: s.startTime ?? (started ? current.times[0] : null),
                     previous: started ? null : s.previous };
      if (current.status !== "done") return next;
      // The item's run finished: record it and move on
      return advance({ ...next, endTime: current.times[current.times.length - 1],
                       previous: { index: s.index, result: current.result! } }, current.result!, current.tracker.prevHeld);
    }
    case "setGrid": {
      // The metronome plays on across items: the next item is built with the same grid
      const current = reduceSequence(s.current, a);
      return current === s.current ? s : { ...s, current };
    }
    case "skip":
      return advance({ ...s, previous: null }, "skipped", a.held);
    case "setBase": {
      const exercise = itemExercise(s.items[s.index], a.base);
      return { ...s, base: a.base, current: reduceSequence(s.current, { type: "setExercise", exercise }) };
    }
  }
}

function advance(s: RoutineState, outcome: ItemOutcome, held: number[]): RoutineState {
  const outcomes = [...s.outcomes, outcome];
  const index = s.index + 1;
  if (index === s.items.length) return { ...s, outcomes, status: "done" };
  return { ...s, outcomes, index, current: initialSequence(itemExercise(s.items[index], s.base), held, s.current.grid) };
}

export interface RoutineSummary {
  finished: number;
  clean: number;
  skipped: number;
  totalMistakes: number;
  durationMs: number;
  /** Items that went least well (most mistakes, then least on time or even), worst first; at most three, never clean ones */
  weakest: { index: number; result: RunResult }[];
}

export function routineSummary(s: RoutineState): RoutineSummary {
  const played = s.outcomes.flatMap((o, index) => o === "skipped" ? [] : [{ index, result: o }]);
  // Steadiness: on time against the metronome when there was one, else evenness
  const steady = (r: RunResult) => r.timing ? r.timing.onTime : r.evenness;
  const weakest = played.filter(p => p.result.mistakes > 0 || steady(p.result) < 0.8)
    .sort((a, b) => b.result.mistakes - a.result.mistakes || steady(a.result) - steady(b.result))
    .slice(0, 3);
  return {
    finished: played.length,
    clean: played.filter(p => !p.result.mistakes).length,
    skipped: s.outcomes.length - played.length,
    totalMistakes: played.reduce((n, p) => n + p.result.mistakes, 0),
    durationMs: s.startTime != null && s.endTime != null ? s.endTime - s.startTime : 0,
    weakest,
  };
}

/** Short labels for an item: its key ("G", "Em") and its exercise ("scale"), for routines that mix exercises. */
export function itemLabel(s: RoutineState, index: number): { key: string; exercise: string } {
  const item = s.items[index];
  const key = buildKey(item.options.key ?? s.base.key)!;
  return { key: key.tonic + (key.mode === "minor" ? "m" : ""), exercise: PRESCRIPTIVE[item.exercise].short };
}

export type KeyProgressState = "done" | "flawed" | "skipped" | "current" | "upcoming";

export interface KeyProgress {
  /** Key value, e.g. "G:major" */
  keyValue: string;
  /** Short label, e.g. "G" */
  label: string;
  /** done: every item clean; flawed: any had mistakes; skipped: all skipped; current: an item is in progress */
  state: KeyProgressState;
  /** The routine's items in this key */
  items: number[];
}

/** Progress by key: a routine's consecutive items in the same key form one entry. */
export function keyProgress(r: RoutineState): KeyProgress[] {
  const groups: KeyProgress[] = [];
  r.items.forEach((item, i) => {
    const keyValue = item.options.key ?? r.base.key;
    const last = groups[groups.length - 1];
    if (last && last.keyValue === keyValue) last.items.push(i);
    else groups.push({ keyValue, label: itemLabel(r, i).key, state: "upcoming", items: [i] });
  });
  for (const g of groups) {
    const outcomes = g.items.map(i => r.outcomes[i]);
    g.state = r.status !== "done" && g.items.includes(r.index) ? "current"
      : outcomes.some(o => o === undefined) ? "upcoming"
      : outcomes.every(o => o === "skipped") ? "skipped"
      : outcomes.some(o => o !== "skipped" && o!.mistakes) ? "flawed" : "done";
  }
  return groups;
}

/** Whether the routine mixes different exercises (then each item's exercise is worth labelling). */
export const mixesExercises = (s: RoutineState) => new Set(s.items.map(i => i.exercise)).size > 1;

/** Routine settings: which routine, and which way round the circle. */
export interface RoutineOptions {
  id: string;
  direction: CircleDirection;
  /** Major key value the routine starts on, for routines that let you choose (`Routine.startsOn`) */
  start: string;
}

export function sanitizeRoutineOptions(raw: unknown): RoutineOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: typeof o.id === "string" && routineById(o.id) ? o.id : ROUTINES[0].id,
    direction: (CIRCLE_DIRECTIONS as readonly unknown[]).includes(o.direction) ? o.direction as CircleDirection : "sharps",
    start: typeof o.start === "string" && CHROMATIC_TONICS.includes(o.start.split(":")[0]) && o.start.endsWith(":major")
      ? o.start : DEFAULT_START,
  };
}
