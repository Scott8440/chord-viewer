// Ear training, chord qualities: the app plays a chord and the player says which kind it is (major, minor, dominant
// seventh …) from the types they've chosen. Pure data and functions; the mode (src/modes/earChords.ts) plays it.
import { Note } from "tonal";
import { chordSemitones, ROOT_MAJOR, ROOT_MINOR, templateById } from "../theory";
import { CHORD_PRACTICE_GROUPS, CHORD_PRACTICE_TYPES } from "./chordPractice";
import type { Rng } from "./notePractice";

export interface ChordEarOptions {
  /** Chord template ids it may play (from the chord practice groups); at least two, so there is a choice */
  types: readonly string[];
  /** Root position only, or any inversion (the bass is then any chord tone) */
  inversions: boolean;
  /** Play the notes one by one, low to high, before the chord together */
  broken: boolean;
}

export const DEFAULT_CHORD_EAR: ChordEarOptions = { types: ["M", "m"], inversions: false, broken: false };

export function sanitizeChordEarOptions(raw: unknown): ChordEarOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const types = Array.isArray(o.types) ? CHORD_PRACTICE_TYPES.filter(id => (o.types as unknown[]).includes(id)) : [];
  return {
    types: types.length >= 2 ? types : [...DEFAULT_CHORD_EAR.types],
    inversions: o.inversions === true,
    broken: o.broken === true,
  };
}

/** Roots are picked from C3 up to B3, so chords sit in the piano's warm middle */
const LOWEST_ROOT = 48;

export interface ChordEarPrompt {
  rootPc: number;
  /** Spelled root, for showing the answer ("D♭ minor") */
  root: string;
  type: string;
  /** 0 root position, 1 first inversion … */
  inversion: number;
  /** The notes played, MIDI, low to high */
  notes: number[];
  /** Their names, spelled from the root (E♭ G B♭, not D♯ G A♯), for drawing the chord once it's named */
  names: string[];
}

/** A chord's note names from its spelled root, in the same order as `voiceChord` gives the notes */
export function chordNames(root: string, type: string, inversion: number): string[] {
  const intervals = (templateById(type)?.tones ?? "").replace(/[()]/g, "").split(/\s+/).filter(Boolean);
  const names = intervals.map(i => Note.pitchClass(Note.transpose(root, i)));
  return [...names.slice(inversion), ...names.slice(0, inversion)];
}

/** The chord's notes: close position above the root, with the lowest `inversion` tones moved up an octave */
export function voiceChord(rootMidi: number, type: string, inversion: number): number[] {
  const tones = chordSemitones(type).map(s => rootMidi + s);
  for (let i = 0; i < inversion; i++) tones.push(tones.shift()! + 12);
  return tones;
}

/** A chord to play: one of the allowed types on a random root, never the same chord (root and type) twice running. */
export function makeChordEarPrompt(rng: Rng, o: ChordEarOptions, previous?: ChordEarPrompt): ChordEarPrompt {
  for (;;) {
    const type = o.types[Math.floor(rng() * o.types.length)];
    const rootPc = Math.floor(rng() * 12);
    if (previous && previous.type === type && previous.rootPc === rootPc) continue;
    const inversion = o.inversions ? Math.floor(rng() * chordSemitones(type).length) : 0;
    const notes = voiceChord(LOWEST_ROOT + rootPc, type, inversion);
    // Spelled as chord names usually are: minor-family chords on C♯ and G♯, others on D♭ and A♭
    const root = (templateById(type)?.minor ? ROOT_MINOR : ROOT_MAJOR)[rootPc];
    return { rootPc, root, type, inversion, notes, names: chordNames(root, type, inversion) };
  }
}

/** What the answer buttons say: "Major", "Dominant seventh" (with the symbol for sevenths and beyond) */
export function qualityLabel(type: string): string {
  const t = templateById(type);
  if (!t) return type;
  const name = t.name.charAt(0).toUpperCase() + t.name.slice(1);
  return t.symbol && !["m", "dim", "aug", "sus2", "sus4"].includes(t.symbol) ? `${name} (${t.symbol})` : name;
}

/** The allowed types in the filter's order: the order the answer buttons come in (and their number keys) */
export const answerOrder = (types: readonly string[]): string[] =>
  CHORD_PRACTICE_GROUPS.flatMap(g => g.types.map(t => t.id)).filter(id => types.includes(id));

export interface ChordEarState {
  prompt: ChordEarPrompt;
  /** waiting: not answered; wrong: the last answer was wrong; correct: answered, about to move on */
  status: "waiting" | "wrong" | "correct";
  /** Wrong answers given for this chord, so their buttons can show it */
  wrong: string[];
  /** A wrong answer was given for this chord */
  missed: boolean;
  /** Chords finished (answered or skipped) */
  answered: number;
  /** Chords answered right with no wrong answer first */
  firstTry: number;
}

export type ChordEarAction =
  | { type: "answer"; quality: string }
  | { type: "next"; prompt: ChordEarPrompt }
  | { type: "skip"; prompt: ChordEarPrompt };

export const initialChordEar = (prompt: ChordEarPrompt): ChordEarState =>
  ({ prompt, status: "waiting", wrong: [], missed: false, answered: 0, firstTry: 0 });

export function reduceChordEar(s: ChordEarState, a: ChordEarAction): ChordEarState {
  switch (a.type) {
    case "answer":
      if (s.status === "correct" || s.wrong.includes(a.quality)) return s;
      if (a.quality === s.prompt.type) {
        return { ...s, status: "correct", answered: s.answered + 1, firstTry: s.firstTry + (s.missed ? 0 : 1) };
      }
      return { ...s, status: "wrong", wrong: [...s.wrong, a.quality], missed: true };
    case "next":
      return { ...s, prompt: a.prompt, status: "waiting", wrong: [], missed: false };
    case "skip":
      // A skipped chord counts as answered, but not right first time
      return { ...s, prompt: a.prompt, status: "waiting", wrong: [], missed: false,
               answered: s.status === "correct" ? s.answered : s.answered + 1 };
  }
}
