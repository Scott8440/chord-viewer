// Chord practice: the app names a chord, the player plays it in any voicing, inversion or octave.
// Pure data and functions; the mode in src/modes/chordPractice.ts drives it. Prompts can also be Roman numerals
// (romanPrompts.ts) and need an inversion (inversions.ts); answers are judged by chordMatch.ts.
import { ROOT_MAJOR, ROOT_MINOR, templateById, type KeyContext } from "../theory";
import { freshAttempt, trackAttempt, type ChordAttempt } from "./chordAttempt";
import { DEFAULT_CHORD_MATCH, isChord, type ChordMatchOptions } from "./chordMatch";
import type { ChordPrompt } from "./chordPrompt";
import { answeredRight, answeredWrong, movedOn, type Judged } from "./judging";
import { pickKey } from "./keyRotation";
import { pick, randomInt, type Rng } from "./random";
import { ALL_KEYS } from "./romanPrompts";

/** Chord types offered in the filter, grouped as shown. Ids are chord template ids. */
export const CHORD_PRACTICE_GROUPS: readonly { label: string; types: readonly { id: string; label: string }[] }[] = [
  { label: "Triads", types: [
    { id: "M", label: "Major" }, { id: "m", label: "Minor" }, { id: "dim", label: "Dim" }, { id: "aug", label: "Aug" },
    { id: "sus2", label: "Sus2" }, { id: "sus4", label: "Sus4" },
  ] },
  { label: "Sixths and sevenths", types: [
    { id: "6", label: "6" }, { id: "m6", label: "m6" }, { id: "maj7", label: "maj7" }, { id: "7", label: "7" },
    { id: "m7", label: "m7" }, { id: "m7b5", label: "m7b5" }, { id: "dim7", label: "dim7" },
    { id: "mMaj7", label: "m(maj7)" }, { id: "7sus4", label: "7sus4" },
  ] },
  { label: "Ninths", types: [
    { id: "add9", label: "add9" }, { id: "9", label: "9" }, { id: "maj9", label: "maj9" }, { id: "m9", label: "m9" },
  ] },
];

export const CHORD_PRACTICE_TYPES: readonly string[] = CHORD_PRACTICE_GROUPS.flatMap(g => g.types.map(t => t.id));
export const DEFAULT_CHORD_TYPES: readonly string[] = ["M", "m"];

/**
 * The key chord practice draws from: "none" (chord names: any chord; Roman numerals: a new key each prompt),
 * "random" (a new key every PROMPTS_PER_KEY prompts), or a key value: then only that key's diatonic chords come up.
 */
export const CHORD_KEYS: readonly string[] = ["none", "random", ...ALL_KEYS];
export const sanitizeChordKey = (v: unknown): string => CHORD_KEYS.includes(v as string) ? v as string : "none";

/** The key for the next prompts: the chosen one, or a random one other than the previous (null for "none") */
export const pickChordKey = (rng: Rng, choice: string, previous?: string | null): string | null =>
  choice === "none" ? null : pickKey(rng, choice, ALL_KEYS, previous);

/** Keeps only known practice types, in display order; falls back to the defaults if nothing is left. */
export function sanitizeChordTypes(ids: readonly string[]): string[] {
  const kept = CHORD_PRACTICE_TYPES.filter(id => ids.includes(id));
  return kept.length ? kept : [...DEFAULT_CHORD_TYPES];
}

/**
 * Picks a chord to ask for: a random root and one of the allowed types, never the same chord twice in a row.
 * The root is spelled from the key if one is set, otherwise the conventional way (Db major, C# minor).
 */
export function makeChordPrompt(rng: Rng, types: readonly string[], key: KeyContext | null, previous?: ChordPrompt): ChordPrompt {
  let rootPc: number, type: string;
  do {
    rootPc = randomInt(rng, 12);
    type = pick(rng, types);
  } while (previous && rootPc === previous.rootPc && type === previous.type);
  const t = templateById(type);
  if (!t) throw new Error(`Unknown chord type: ${type}`);
  const root = key ? key.spell[rootPc] : (t.minor ? ROOT_MINOR : ROOT_MAJOR)[rootPc];
  return { rootPc, root, type };
}

export interface ChordPracticeState extends Judged<ChordPrompt> {
  /** The attempt in progress (see chordAttempt.ts) */
  tracker: ChordAttempt;
  /** Notes of the last judged attempt, for feedback */
  attempt: number[] | null;
}

export type ChordPracticeAction =
  /** The keys currently held changed (MIDI numbers, low to high) */
  | { type: "held"; notes: number[] }
  | { type: "next"; prompt: ChordPrompt; held: number[] }
  | { type: "skip"; prompt: ChordPrompt; held: number[] };

export function initialChordPractice(prompt: ChordPrompt, held: number[] = []): ChordPracticeState {
  return { prompt, status: "waiting", tracker: freshAttempt(held), attempt: null, missed: false, answered: 0, firstTry: 0 };
}

export function reduceChordPractice(s: ChordPracticeState, a: ChordPracticeAction,
                                    opts: ChordMatchOptions = DEFAULT_CHORD_MATCH): ChordPracticeState {
  // The keys held as the new prompt comes up are its starting point
  if (a.type !== "held") return movedOn(s, a, { tracker: freshAttempt(a.held), attempt: null });
  if (s.status === "correct") return s;   // answered; ignore input until the next prompt
  const { attempt: tracker, outcome } = trackAttempt(s.tracker, a.notes, notes => isChord(notes, s.prompt, opts));
  if (outcome.kind === "match") return answeredRight(s, { tracker, attempt: a.notes });
  if (outcome.kind === "miss") return answeredWrong(s, { tracker, attempt: outcome.notes });
  return { ...s, tracker };
}
