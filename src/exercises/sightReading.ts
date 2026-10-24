// Sight reading: a line of notes on the staff, played back left to right at the exact pitch. The notes are the key's
// (natural minor in minor keys, so nothing goes against the key signature), within the chosen staff's range, moving
// mostly by small steps and leaps the way written lines do. Judged by `reduceMelody`, as ear-training melodies are.
import { buildKey, spellNote, type KeyContext } from "../theory";
import type { Rng } from "./notePractice";
import { ALL_KEYS } from "./romanPrompts";

export const READING_LENGTHS: readonly number[] = [1, 2, 3, 4, 5, 6, 8];
export const DEFAULT_READING_LENGTH = 4;

/** Which staff the notes are on, as MIDI ranges: each staff plus a ledger line or two either side */
export const READING_RANGES = {
  treble: { label: "Treble", low: 60, high: 81 },   // C4–A5
  bass: { label: "Bass", low: 40, high: 60 },       // E2–C4
  grand: { label: "Both staves", low: 40, high: 81 },
} as const;
export type ReadingRange = keyof typeof READING_RANGES;

/** One key, or "random": a new key every PROMPTS_PER_KEY lines */
export const READING_KEYS: readonly string[] = ["random", ...ALL_KEYS];

export interface ReadingOptions {
  length: number;
  range: ReadingRange;
  key: string;
}
export const DEFAULT_READING_OPTIONS: ReadingOptions = { length: DEFAULT_READING_LENGTH, range: "treble", key: "C:major" };

export function sanitizeReadingOptions(raw: unknown): ReadingOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof ReadingOptions, unknown>>;
  return {
    length: READING_LENGTHS.includes(o.length as number) ? o.length as number : DEFAULT_READING_OPTIONS.length,
    range: typeof o.range === "string" && o.range in READING_RANGES ? o.range as ReadingRange : DEFAULT_READING_OPTIONS.range,
    key: READING_KEYS.includes(o.key as string) ? o.key as string : DEFAULT_READING_OPTIONS.key,
  };
}

/** The key to read in: the chosen one, or a random one other than the last */
export function pickReadingKey(rng: Rng, choice: string, previous?: string): string {
  if (choice !== "random") return choice;
  const others = ALL_KEYS.filter(k => k !== previous);
  return others[Math.floor(rng() * others.length)];
}

export interface ReadingNote {
  /** MIDI */
  note: number;
  /** Spelled in the key, with its octave: "F♯4" is "F#4" */
  name: string;
}

export interface ReadingPrompt {
  keyValue: string;
  range: ReadingRange;
  notes: readonly ReadingNote[];
}

/** No leap wider than this (a major 6th) from one note to the next */
const MAX_LEAP = 9;

/** The key's notes in a range: its signature's notes only (natural minor in minor keys) */
export function readingPool(key: KeyContext, range: ReadingRange): number[] {
  const { low, high } = READING_RANGES[range];
  const out: number[] = [];
  for (let n = low; n <= high; n++) {
    const s = spellNote(n, null, key);
    if (s.alter === (key.sigAlter[s.letter] || 0)) out.push(n);
  }
  return out;
}

export const noteName = (midi: number, key: KeyContext) => {
  const s = spellNote(midi, null, key);
  return `${s.letter}${s.acc}${s.octave}`;
};

/**
 * A line of `length` notes in the key and range: the first anywhere, then each a different note no more than a 6th
 * from the one before (small steps more likely than leaps). Never the same line twice running.
 */
export function makeReadingPrompt(rng: Rng, keyValue: string, range: ReadingRange, length: number,
                                  previous?: ReadingPrompt): ReadingPrompt {
  const key = buildKey(keyValue)!;
  const pool = readingPool(key, range);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  for (let tries = 0; ; tries++) {
    const notes: number[] = [pick(pool)];
    while (notes.length < length) {
      const last = notes[notes.length - 1];
      const near = pool.filter(n => n !== last && Math.abs(n - last) <= MAX_LEAP);
      // Steps (up to a 3rd) twice as likely as leaps
      const weighted = near.flatMap(n => Math.abs(n - last) <= 4 ? [n, n] : [n]);
      notes.push(pick(weighted.length ? weighted : pool));
    }
    const same = previous && previous.keyValue === keyValue && previous.notes.length === notes.length &&
      previous.notes.every((n, i) => n.note === notes[i]);
    if (!same || tries > 20) return { keyValue, range, notes: notes.map(note => ({ note, name: noteName(note, key) })) };
  }
}
