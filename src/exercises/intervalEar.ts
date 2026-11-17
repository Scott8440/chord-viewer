// Ear training, intervals: the app plays two notes and the player says how far apart they are (minor 2nd up to the
// octave) from the intervals on offer. The notes go up, down, together, or a mix; on a ladder, levels add intervals
// from the easiest to tell apart (major 3rd, perfect 5th, octave) to the tritone. Pure data and functions; the mode
// (src/modes/earIntervals.ts) plays it.
import { Note } from "tonal";
import { ROOT_MAJOR } from "../theory";
import { prettyAcc } from "../theory/spelling";
import { answeredRight, answeredWrong, movedOn, type Judged, type MoveOn } from "./judging";
import type { Ladder } from "./ladders";
import { pick, randomInt, type Rng } from "./random";

export interface IntervalInfo {
  /** Kept in options and records: "m3", "TT", "P8" */
  id: string;
  /** As the answer buttons say: "Minor 3rd" */
  label: string;
  /** Half steps from the lower note to the upper */
  semitones: number;
  /** tonal's name, to spell the upper note from the lower: "3m" (C to E♭, not D♯) */
  tonal: string;
}

const interval = (id: string, label: string, semitones: number, tonal: string): IntervalInfo => ({
  id,
  label,
  semitones,
  tonal,
});

/** Every interval within an octave, smallest first: the order of the answer buttons */
export const INTERVALS: readonly IntervalInfo[] = [
  interval("m2", "Minor 2nd", 1, "2m"),
  interval("M2", "Major 2nd", 2, "2M"),
  interval("m3", "Minor 3rd", 3, "3m"),
  interval("M3", "Major 3rd", 4, "3M"),
  interval("P4", "Perfect 4th", 5, "4P"),
  interval("TT", "Tritone", 6, "4A"),
  interval("P5", "Perfect 5th", 7, "5P"),
  interval("m6", "Minor 6th", 8, "6m"),
  interval("M6", "Major 6th", 9, "6M"),
  interval("m7", "Minor 7th", 10, "7m"),
  interval("M7", "Major 7th", 11, "7M"),
  interval("P8", "Octave", 12, "8P"),
];
const BY_ID: ReadonlyMap<string, IntervalInfo> = new Map(INTERVALS.map(i => [i.id, i]));
export const INTERVAL_IDS: readonly string[] = INTERVALS.map(i => i.id);
export const intervalLabel = (id: string) => BY_ID.get(id)?.label ?? id;

/** The intervals on offer in the given set, smallest first (the answer buttons' order, and their number keys) */
export const intervalOrder = (ids: readonly string[]): string[] => INTERVAL_IDS.filter(id => ids.includes(id));

/** For the free-choice filter: seconds and thirds, fourths and fifths, sixths, sevenths and the octave */
export const INTERVAL_GROUPS: readonly { label: string; types: readonly { id: string; label: string }[] }[] = [
  { label: "2nds and 3rds", types: ["m2", "M2", "m3", "M3"].map(id => ({ id, label: intervalLabel(id) })) },
  { label: "4ths and 5ths", types: ["P4", "TT", "P5"].map(id => ({ id, label: intervalLabel(id) })) },
  {
    label: "6ths, 7ths and the octave",
    types: ["m6", "M6", "m7", "M7", "P8"].map(id => ({ id, label: intervalLabel(id) })),
  },
];

/** From the three easiest to tell apart to every interval in the octave */
export const INTERVAL_EAR_LADDER: Ladder<{ intervals: readonly string[] }> = {
  id: "intervalEar.1",
  levels: [
    { name: "Major 3rd, perfect 5th and octave", options: { intervals: ["M3", "P5", "P8"] } },
    { name: "Add minor 3rd", options: { intervals: ["m3", "M3", "P5", "P8"] } },
    { name: "Add perfect 4th", options: { intervals: ["m3", "M3", "P4", "P5", "P8"] } },
    { name: "Add 2nds", options: { intervals: ["m2", "M2", "m3", "M3", "P4", "P5", "P8"] } },
    { name: "Add 6ths", options: { intervals: ["m2", "M2", "m3", "M3", "P4", "P5", "m6", "M6", "P8"] } },
    {
      name: "Add 7ths",
      options: { intervals: ["m2", "M2", "m3", "M3", "P4", "P5", "m6", "M6", "m7", "M7", "P8"] },
    },
    { name: "Every interval, with the tritone", options: { intervals: INTERVAL_IDS } },
  ],
};

/** How the two notes are played: the lower first, the upper first, both at once, or any of those */
export type IntervalDirection = "up" | "down" | "together";
export type IntervalPlay = IntervalDirection | "mixed";
export const INTERVAL_PLAYS: readonly IntervalPlay[] = ["up", "down", "together", "mixed"];

export interface IntervalEarOptions {
  /** The intervals on offer with free choice (at least two, so there's a choice) */
  intervals: readonly string[];
  play: IntervalPlay;
  /** "simple", the app's own tone; "piano", the sampled piano */
  sound: "simple" | "piano";
  /** Climb the ladder (its level sets the intervals; `intervals` waits, kept, for free choice) */
  ladder: boolean;
  /** The ladder level (0-based); the mode keeps it to the levels unlocked */
  level: number;
}

export const DEFAULT_INTERVAL_EAR: IntervalEarOptions = {
  intervals: ["M3", "P5", "P8"],
  play: "up",
  sound: "simple",
  ladder: true,
  level: 0,
};

export function sanitizeIntervalEarOptions(raw: unknown): IntervalEarOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const intervals = Array.isArray(o.intervals) ? intervalOrder(o.intervals as string[]) : [];
  const level = typeof o.level === "number" && Number.isInteger(o.level) ? o.level : 0;
  return {
    intervals: intervals.length >= 2 ? intervals : [...DEFAULT_INTERVAL_EAR.intervals],
    play: INTERVAL_PLAYS.includes(o.play as IntervalPlay) ? (o.play as IntervalPlay) : DEFAULT_INTERVAL_EAR.play,
    sound: o.sound === "piano" ? "piano" : "simple",
    ladder: o.ladder !== false,
    level: Math.min(Math.max(level, 0), INTERVAL_EAR_LADDER.levels.length - 1),
  };
}

/** The intervals asked: on the ladder, its level's; otherwise the player's own choice */
export const offeredIntervals = (o: IntervalEarOptions): readonly string[] =>
  o.ladder ? (INTERVAL_EAR_LADDER.levels[o.level] ?? INTERVAL_EAR_LADDER.levels[0]).options.intervals : o.intervals;

/** The lower note is between C3 and G4, so the octave above stays below G5 */
const LOWEST = 48,
  LOWER_RANGE = 20;

export interface IntervalEarPrompt {
  interval: string;
  /** MIDI, the lower and the upper note */
  low: number;
  high: number;
  /** Spelled: "C", "E♭" (the upper spelled from the lower by the interval) */
  lowName: string;
  highName: string;
  direction: IntervalDirection;
}

/** Two notes to name the distance between: one of the intervals on offer from a random note, never the same pair
 *  twice running */
export function makeIntervalEarPrompt(
  rng: Rng,
  o: IntervalEarOptions,
  previous?: IntervalEarPrompt,
): IntervalEarPrompt {
  const offered = offeredIntervals(o);
  for (;;) {
    const id = pick(rng, offered);
    const low = LOWEST + randomInt(rng, LOWER_RANGE);
    if (previous && previous.interval === id && previous.low === low) continue;
    const info = BY_ID.get(id)!;
    const direction: IntervalDirection = o.play === "mixed" ? pick(rng, ["up", "down", "together"] as const) : o.play;
    const lowName = ROOT_MAJOR[low % 12];
    const highName = Note.pitchClass(Note.transpose(lowName, info.tonal));
    return {
      interval: id,
      low,
      high: low + info.semitones,
      lowName: prettyAcc(lowName),
      highName: prettyAcc(highName),
      direction,
    };
  }
}

/** The notes in the order they're played (both together: low then high, at once) */
export const playOrder = (p: IntervalEarPrompt): number[] =>
  p.direction === "down" ? [p.high, p.low] : [p.low, p.high];

/** "C up to E♭", "E♭ down to C", "C and E♭ together" */
export function intervalNotes(p: IntervalEarPrompt): string {
  if (p.direction === "together") return `${p.lowName} and ${p.highName} together`;
  return p.direction === "up" ? `${p.lowName} up to ${p.highName}` : `${p.highName} down to ${p.lowName}`;
}

export interface IntervalEarState extends Judged<IntervalEarPrompt> {
  /** Wrong answers given for these two notes, so their buttons can show it */
  wrong: string[];
}

export type IntervalEarAction = { type: "answer"; interval: string } | MoveOn<IntervalEarPrompt>;

export const initialIntervalEar = (prompt: IntervalEarPrompt): IntervalEarState => ({
  prompt,
  status: "waiting",
  wrong: [],
  missed: false,
  answered: 0,
  firstTry: 0,
});

export function reduceIntervalEar(s: IntervalEarState, a: IntervalEarAction): IntervalEarState {
  if (a.type !== "answer") return movedOn(s, a, { wrong: [] });
  if (s.status === "correct" || s.wrong.includes(a.interval)) return s;
  return a.interval === s.prompt.interval ? answeredRight(s) : answeredWrong(s, { wrong: [...s.wrong, a.interval] });
}
