// Whether held notes are a prompted chord, and if not, what to change ("replace E with Eb"). Used wherever a chord is
// judged: chord practice, progressions and chord steps in sequence exercises (via chordAttempt.ts).
import { matchTemplate, type TemplateTone } from "../theory";
import type { ChordPrompt } from "./chordPrompt";

export interface ChordMatchOptions {
  /** Accept chords with optional tones (usually the 5th) left out */
  allowOmissions: boolean;
}

export const DEFAULT_CHORD_MATCH: ChordMatchOptions = { allowOmissions: false };

/** Whether the held notes are the prompted chord: every tone present (any octave or inversion), nothing extra. */
export function isChord(notes: readonly number[], prompt: ChordPrompt, opts: ChordMatchOptions = DEFAULT_CHORD_MATCH): boolean {
  return hasChordTones(notes, prompt, opts) && hasBass(notes, prompt);
}

/** The right notes, ignoring which one is in the bass. */
export function hasChordTones(notes: readonly number[], prompt: ChordPrompt, opts: ChordMatchOptions = DEFAULT_CHORD_MATCH): boolean {
  if (!notes.length) return false;
  const m = matchTemplate(notes.map(n => n % 12), prompt.rootPc, prompt.type);
  return !m.missing.length && !m.extra.length && (opts.allowOmissions || !m.omitted.length);
}

/** The lowest note is the required bass, or no particular inversion was asked for. `notes` are low to high. */
export function hasBass(notes: readonly number[], prompt: ChordPrompt): boolean {
  return !prompt.inversion || (notes.length > 0 && notes[0] % 12 === prompt.inversion.bassPc);
}

/** Largest move, in semitones, that counts as "replace X with Y" rather than "remove X, add Y" */
const REPLACE_MAX_SEMITONES = 2;

export interface ChordCorrections {
  /** A played wrong note close to a missing chord tone: move it there */
  replace: { from: number; to: TemplateTone }[];
  /** Chord tones still missing */
  add: TemplateTone[];
  /** Played pitch classes to take away */
  remove: number[];
}

/**
 * What to change so the played notes become the prompted chord. Each missing tone is paired with the
 * nearest wrong note within a whole step (closest pairs first), so C E G for Cm reads "replace E with Eb".
 */
export function chordCorrections(notes: readonly number[], prompt: ChordPrompt): ChordCorrections {
  const m = matchTemplate(notes.map(n => n % 12), prompt.rootPc, prompt.type);
  const missing = [...m.missing, ...m.omitted].sort((a, b) => a.degree - b.degree);
  const pcOf = (t: TemplateTone) => (prompt.rootPc + t.pc) % 12;
  const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 12; return Math.min(d, 12 - d); };
  const pairs = missing.flatMap((to, ti) => m.extra.map(from => ({ from, to, ti, d: dist(from, pcOf(to)) })))
    .filter(p => p.d <= REPLACE_MAX_SEMITONES)
    .sort((a, b) => a.d - b.d || a.ti - b.ti);
  const usedFrom = new Set<number>(), usedTo = new Set<TemplateTone>();
  const replace: ChordCorrections["replace"] = [];
  for (const p of pairs) {
    if (usedFrom.has(p.from) || usedTo.has(p.to)) continue;
    usedFrom.add(p.from); usedTo.add(p.to);
    replace.push({ from: p.from, to: p.to });
  }
  replace.sort((a, b) => a.to.degree - b.to.degree);
  return {
    replace,
    add: missing.filter(t => !usedTo.has(t)),
    remove: m.extra.filter(pc => !usedFrom.has(pc)),
  };
}
