// Sight-reading excerpts from real music: a few bars of a melody exactly as written, rhythm included. Made at build
// time by scripts/corpus (from the OpenScore Lieder corpus, CC0) and read by the app as JSON; this file is the shape
// both sides share, plus the pure helpers for durations.

/** A note value as written (VexFlow's names): whole, half, quarter, 8th … */
export type NoteValue = "w" | "h" | "q" | "8" | "16" | "32" | "64";

/** One note or rest, as written */
export interface ExcerptEvent {
  /** Note value */
  v: NoteValue;
  /** Dots */
  d?: number;
  /** Tuplet as [actual, normal]: [3, 2] is a triplet (three in the time of two) */
  t?: [number, number];
  /** Written pitch (MIDI); absent for a rest */
  p?: number;
  /** Spelling as a tonal pitch class (MuseScore's tpc: 14 is C, +1 per fifth up, so 15 G, 13 F, 20 F♯, 12 B♭…) */
  s?: number;
  /** Tied to the next note (so the next one isn't played again) */
  tie?: 1;
  /** A whole-bar rest (drawn centred, whatever the time signature) */
  bar?: 1;
}

/** What makes an excerpt easier or harder to read, measured from its notes */
export interface ExcerptFeatures {
  /** Notes to play (a tied note counts once) */
  notes: number;
  bars: number;
  /** Sharps or flats in the key signature */
  keyAccidentals: number;
  /** Notes with an accidental outside the key */
  chromatic: number;
  /** Lowest to highest, in semitones */
  range: number;
  /** Notes off the staff, on ledger lines */
  ledger: number;
  /** Widest interval between neighbouring notes, in semitones */
  maxLeap: number;
  /** Share of intervals that are steps (a tone or semitone); 1 for a single note */
  stepShare: number;
  /** Different note values used (dotted and tuplet values count as their own) */
  values: number;
  /** Shortest note or rest, as a fraction of a whole note */
  shortest: number;
  dotted: number;
  ties: number;
  tuplets: number;
  /** Rests between the notes (not before the first or after the last) */
  rests: number;
  /** Notes starting off the beat and held over the next one */
  syncopations: number;
  /** 6/8, 9/8, 12/8 … */
  compound: boolean;
}

export interface Excerpt {
  /** "<score id>:<bar>.<note>-<bar>.<note>": where the phrase starts and ends (bars from 1, events from 0) */
  id: string;
  /** Index into the file's `sources` */
  source: number;
  /** Key signature, in fifths: 2 is D major or B minor, −3 E♭ major or C minor */
  key: number;
  time: [number, number];
  clef: "treble" | "bass";
  /** The bars as written; the first may be a pickup (shorter than the time signature) */
  bars: ExcerptEvent[][];
  features: ExcerptFeatures;
}

export interface ExcerptSource {
  composer: string;
  title: string;
  /** MuseScore score id: the score is at https://musescore.com/score/<id> */
  scoreId: string;
}

export interface ExcerptFile {
  version: 1;
  /** Shown with the excerpts */
  credit: string;
  sources: ExcerptSource[];
  excerpts: Excerpt[];
}

const BASE: Record<NoteValue, number> = { w: 1, h: 1 / 2, q: 1 / 4, "8": 1 / 8, "16": 1 / 16, "32": 1 / 32, "64": 1 / 64 };

/** How long an event lasts, as a fraction of a whole note (a whole-bar rest is given its bar's length by the caller) */
export function eventLength(e: ExcerptEvent): number {
  let len = BASE[e.v] * (2 - 1 / 2 ** (e.d ?? 0));
  if (e.t) len *= e.t[1] / e.t[0];
  return len;
}

/** A tonal pitch class (tpc) as a note name: 14 → "C", 20 → "F#", 12 → "Bb" */
export function tpcName(tpc: number): string {
  const letter = "FCGDAEB"[((tpc + 1) % 7 + 7) % 7];
  const alter = Math.floor((tpc + 1) / 7) - 2;
  return letter + (alter > 0 ? "#".repeat(alter) : "b".repeat(-alter));
}

/** The alteration a tpc carries: −1 flat, 0 natural, 1 sharp … */
export const tpcAlter = (tpc: number) => Math.floor((tpc + 1) / 7) - 2;

/**
 * The most each level allows; an excerpt's level is the first one it fits. Pitch and rhythm both get harder. The key
 * signature isn't part of it: an excerpt can be transposed to any key, so the key is a setting of its own.
 * (Ledger lines are measured in the original key, so a transposed excerpt can have a few more or fewer.)
 */
export interface LevelLimits {
  bars: number;
  chromatic: number;
  range: number;
  maxLeap: number;
  ledger: number;
  values: number;
  /** Shortest value allowed, as a fraction of a whole note */
  shortest: number;
  dotted: number;
  ties: number;
  tuplets: number;
  syncopations: number;
  compound: boolean;
}

export const READING_LEVELS: readonly { name: string; limits: LevelLimits }[] = [
  { name: "Steps, simple rhythm",
    limits: { bars: 2, chromatic: 0, range: 7, maxLeap: 4, ledger: 0, values: 2, shortest: 1 / 8,
              dotted: 0, ties: 0, tuplets: 0, syncopations: 0, compound: false } },
  { name: "Small leaps, dotted notes",
    limits: { bars: 4, chromatic: 1, range: 9, maxLeap: 7, ledger: 1, values: 3, shortest: 1 / 8,
              dotted: 2, ties: 1, tuplets: 0, syncopations: 0, compound: false } },
  { name: "Wider range, compound time",
    limits: { bars: 4, chromatic: 1, range: 12, maxLeap: 9, ledger: 2, values: 4, shortest: 1 / 16,
              dotted: 4, ties: 2, tuplets: 0, syncopations: 1, compound: true } },
  { name: "Accidentals, triplets",
    limits: { bars: 4, chromatic: 3, range: 16, maxLeap: 12, ledger: 4, values: 5, shortest: 1 / 16,
              dotted: 8, ties: 4, tuplets: 6, syncopations: 2, compound: true } },
  { name: "Anything",
    limits: { bars: Infinity, chromatic: Infinity, range: Infinity, maxLeap: Infinity, ledger: Infinity,
              values: Infinity, shortest: 0, dotted: Infinity, ties: Infinity, tuplets: Infinity, syncopations: Infinity, compound: true } },
];

export function fitsLevel(f: ExcerptFeatures, l: LevelLimits): boolean {
  return f.bars <= l.bars && f.chromatic <= l.chromatic && f.range <= l.range &&
    f.maxLeap <= l.maxLeap && f.ledger <= l.ledger && f.values <= l.values && f.shortest >= l.shortest - 1e-9 &&
    f.dotted <= l.dotted && f.ties <= l.ties && f.tuplets <= l.tuplets && f.syncopations <= l.syncopations &&
    (l.compound || !f.compound);
}

/** An excerpt's level: 1 for the easiest */
export const readingLevel = (f: ExcerptFeatures) => READING_LEVELS.findIndex(l => fitsLevel(f, l.limits)) + 1;
