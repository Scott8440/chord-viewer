// Sight reading: music on the staff, played back left to right at the exact pitch, one step at a time: a note, or a
// chord (its notes in any order, rolled or together). Either a passage from a song (an excerpt, rhythm as written,
// transposed into the chosen key; see excerpts.ts): its melody, or its piano part's right hand, left hand or both,
// at a level; or a generated line: the key's notes (natural minor in minor keys, so nothing goes against the key
// signature), within the chosen staff's range, moving mostly by small steps and leaps the way written lines do.
import { buildKey, keySignature, spellNote, type KeyContext } from "../theory";
import {
  excerptSteps, partStaves, READING_LEVELS, readingLevel, transposeStaves, writtenName, type Excerpt, type ExcerptSource,
  type ExcerptStaff, type ReadingPart,
} from "./excerpts";
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

/** 1 to 5: passages from songs at that level (`levelsFor` the part); 0: generated lines */
export const READING_LEVEL_CHOICES: readonly number[] = [...READING_LEVELS.map((_, i) => i + 1), 0];

/** What to read from the songs */
export const READING_PARTS: Record<ReadingPart, string> = {
  voice: "Melody", rh: "Piano, right hand", lh: "Piano, left hand", both: "Piano, both hands",
};

export interface ReadingOptions {
  /** Songs at a level, or 0 for generated lines (which use length and range) */
  level: number;
  /** For songs: the melody, or the piano part */
  part: ReadingPart;
  length: number;
  range: ReadingRange;
  key: string;
}
export const DEFAULT_READING_OPTIONS: ReadingOptions = {
  level: 1, part: "voice", length: DEFAULT_READING_LENGTH, range: "treble", key: "C:major",
};

export function sanitizeReadingOptions(raw: unknown): ReadingOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof ReadingOptions, unknown>>;
  return {
    level: READING_LEVEL_CHOICES.includes(o.level as number) ? o.level as number : DEFAULT_READING_OPTIONS.level,
    part: typeof o.part === "string" && o.part in READING_PARTS ? o.part as ReadingPart : DEFAULT_READING_OPTIONS.part,
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
  /** Spelled as written, with its octave: "F♯4" is "F#4" */
  name: string;
}

/** What's struck at once: one note, or a chord's notes (low to high) */
export type ReadingStep = readonly ReadingNote[];

export interface ReadingPrompt {
  keyValue: string;
  /** The staff: the chosen one for a generated line; for a song, its melody's clef (piano: "grand" for both hands) */
  range: ReadingRange;
  steps: readonly ReadingStep[];
  /** A passage from a song; absent for a generated line */
  music?: ReadingMusic;
}

export interface ReadingMusic {
  /** The excerpt's id */
  id: string;
  source: ExcerptSource;
  part: ReadingPart;
  level: number;
  time: [number, number];
  /** The part's staves as drawn: transposed into the prompt's key */
  staves: ExcerptStaff[];
  /** The step that strikes each event (`[staff][voice][bar][event]`; −1 for rests) */
  stepOf: number[][][][];
}

/** A key's signature in fifths: 2 for D major or B minor, −3 for E♭ major or C minor */
export function keyFifths(key: KeyContext): number {
  const { count, accidental } = keySignature(key);
  return accidental === "b" ? -count : count;
}

/** A song's passage in a key (its signature: a minor tune moved to G major's signature reads as E minor), or null
 *  if it can't be written there */
export function makeExcerptPrompt(e: Excerpt, source: ExcerptSource, part: ReadingPart, level: number,
                                  keyValue: string): ReadingPrompt | null {
  const staves = transposeStaves(partStaves(e, part), e.key, keyFifths(buildKey(keyValue)!));
  if (!staves) return null;
  const { steps, stepOf } = excerptSteps(staves, e.time);
  return {
    keyValue, range: staves.length > 1 ? "grand" : staves[0].clef,
    steps: steps.map(s => s.notes.map(n => ({ note: n.p, name: writtenName(n.p, n.s) }))),
    music: { id: e.id, source, part, level, time: e.time, staves, stepOf },
  };
}

/** The level an excerpt has in a part, or 0 when it can't be read as that part */
export function excerptLevel(e: Excerpt, part: ReadingPart): number {
  const f = e.parts[part];
  return f ? readingLevel(f, part) : 0;
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
    const same = previous && !previous.music && previous.keyValue === keyValue && previous.steps.length === notes.length &&
      previous.steps.every((s, i) => s[0].note === notes[i]);
    if (!same || tries > 20) return { keyValue, range, steps: notes.map(note => [{ note, name: noteName(note, key) }]) };
  }
}

/* ------------------------------------------------------------------ playing it back */

export interface ReadingState {
  prompt: ReadingPrompt;
  /** The step being played */
  index: number;
  /** The current step's notes struck so far (a chord's can come in any order) */
  struck: readonly number[];
  status: "waiting" | "wrong" | "correct";
  /** The last note played, or null */
  played: number | null;
  /** Any wrong note in this prompt */
  missed: boolean;
  answered: number;
  firstTry: number;
}

export type ReadingAction =
  | { type: "play"; note: number }
  | { type: "next"; prompt: ReadingPrompt }
  | { type: "skip"; prompt: ReadingPrompt };

export function initialReading(prompt: ReadingPrompt): ReadingState {
  return { prompt, index: 0, struck: [], status: "waiting", played: null, missed: false, answered: 0, firstTry: 0 };
}

/**
 * Each note-on is judged against the current step: one of its notes (at the exact pitch) counts towards it, and the
 * step is done once all are struck; any other note is a mistake and the step waits (what was struck still counts).
 */
export function reduceReading(s: ReadingState, a: ReadingAction): ReadingState {
  switch (a.type) {
    case "play": {
      if (s.status === "correct") return s;   // done; ignore notes until the next line
      const step = s.prompt.steps[s.index];
      if (!step.some(n => n.note === a.note)) return { ...s, status: "wrong", played: a.note, missed: true };
      const struck = s.struck.includes(a.note) ? s.struck : [...s.struck, a.note];
      if (struck.length < step.length) return { ...s, struck, played: a.note };
      const index = s.index + 1;
      if (index < s.prompt.steps.length) return { ...s, index, struck: [], status: "waiting", played: a.note };
      return { ...s, index, struck: [], status: "correct", played: a.note, answered: s.answered + 1,
               firstTry: s.firstTry + (s.missed ? 0 : 1) };
    }
    case "next":
      return { ...s, prompt: a.prompt, index: 0, struck: [], status: "waiting", played: null, missed: false };
    case "skip":
      // A skipped line counts as answered, but not right first time
      return { ...s, prompt: a.prompt, index: 0, struck: [], status: "waiting", played: null, missed: false,
               answered: s.status === "correct" ? s.answered : s.answered + 1 };
  }
}
