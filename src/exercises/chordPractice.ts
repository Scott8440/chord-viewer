// Chord practice: the app names a chord, the player plays it in any voicing, inversion or octave.
// Pure data and functions; the mode in src/modes/chordPractice.ts drives it. Prompts can also be Roman numerals
// (romanPrompts.ts) and need an inversion (inversions.ts); answers are judged by chordMatch.ts.
import { ROOT_MAJOR, ROOT_MINOR, templateById, type KeyContext } from "../theory";
import { freshAttempt, trackAttempt, type ChordAttempt } from "./chordAttempt";
import { DEFAULT_CHORD_MATCH, isChord, type ChordMatchOptions } from "./chordMatch";
import type { ChordPrompt } from "./chordPrompt";
import type { Rng } from "./notePractice";

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
    rootPc = Math.floor(rng() * 12);
    type = types[Math.floor(rng() * types.length)];
  } while (previous && rootPc === previous.rootPc && type === previous.type);
  const t = templateById(type);
  if (!t) throw new Error(`Unknown chord type: ${type}`);
  const root = key ? key.spell[rootPc] : (t.minor ? ROOT_MINOR : ROOT_MAJOR)[rootPc];
  return { rootPc, root, type };
}

export interface ChordPracticeState {
  prompt: ChordPrompt;
  /** waiting: no judged attempt yet; wrong: the last attempt was wrong; correct: answered, about to move on */
  status: "waiting" | "wrong" | "correct";
  /** The attempt in progress (see chordAttempt.ts) */
  tracker: ChordAttempt;
  /** Notes of the last judged attempt, for feedback */
  attempt: number[] | null;
  /** A wrong attempt was made on this prompt */
  missed: boolean;
  /** Prompts finished (answered or skipped) */
  answered: number;
  /** Prompts answered with no wrong attempt first */
  firstTry: number;
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
  switch (a.type) {
    case "held": {
      if (s.status === "correct") return s;   // answered; ignore input until the next prompt
      const { attempt: tracker, outcome } = trackAttempt(s.tracker, a.notes, notes => isChord(notes, s.prompt, opts));
      if (outcome.kind === "match") {
        return { ...s, tracker, status: "correct", attempt: a.notes, answered: s.answered + 1, firstTry: s.firstTry + (s.missed ? 0 : 1) };
      }
      if (outcome.kind === "miss") return { ...s, tracker, status: "wrong", attempt: outcome.notes, missed: true };
      return { ...s, tracker };
    }
    case "next":
    case "skip":
      return {
        ...initialChordPractice(a.prompt, a.held),
        // A skipped prompt counts as answered, but not right first time
        answered: a.type === "skip" && s.status !== "correct" ? s.answered + 1 : s.answered,
        firstTry: s.firstTry,
      };
  }
}
