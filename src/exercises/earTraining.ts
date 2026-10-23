// Ear training, scale degrees: a drone sounds the tonic, the app plays one note over it, and the player finds that
// note on the keyboard (any octave). The player chooses which degrees can come up, starting with just 1 and 5.
// Pure data and functions; the mode in src/modes/earTraining.ts drives it and makes the sound. Answers are judged
// like note practice (reduceNotePractice).
import { buildKey, chromaOf, KEY_MAJORS } from "../theory";
import type { NotePracticeAction, NotePracticeState, NotePrompt, Rng } from "./notePractice";

/** The degrees of the major scale that can be asked for, in the filter's order. Ids are what's saved. */
export const EAR_DEGREES: readonly { id: string; label: string; semitones: number }[] = [
  { id: "1", label: "1", semitones: 0 }, { id: "2", label: "2", semitones: 2 }, { id: "3", label: "3", semitones: 4 },
  { id: "4", label: "4", semitones: 5 }, { id: "5", label: "5", semitones: 7 }, { id: "6", label: "6", semitones: 9 },
  { id: "7", label: "7", semitones: 11 },
];
export const DEFAULT_EAR_DEGREES: readonly string[] = ["1", "5"];

/** Every semitone above the tonic as a degree, for naming any note played against the drone */
const DEGREE_NAMES = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];
export const degreeName = (semitones: number) => DEGREE_NAMES[((semitones % 12) + 12) % 12];

/** Drone tonic: one of the major key tonics, or a random one that changes every few prompts */
export const EAR_TONICS: readonly string[] = ["random", ...KEY_MAJORS];
/** With a random tonic, a new key every this many prompts */
export const PROMPTS_PER_KEY = 10;

export interface EarOptions {
  tonic: string;
  degrees: readonly string[];
}

/** Keeps known degrees, in scale order; falls back to the defaults if nothing is left. */
export function sanitizeEarDegrees(ids: readonly unknown[]): string[] {
  const kept = EAR_DEGREES.map(d => d.id).filter(id => ids.includes(id));
  return kept.length ? kept : [...DEFAULT_EAR_DEGREES];
}

export function sanitizeEarOptions(raw: unknown): EarOptions {
  const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    tonic: EAR_TONICS.includes(o.tonic as string) ? o.tonic as string : "random",
    degrees: sanitizeEarDegrees(Array.isArray(o.degrees) ? o.degrees : DEFAULT_EAR_DEGREES),
  };
}

/** Picks the drone's tonic: the chosen one, or a random one (not the previous one) */
export function pickTonic(rng: Rng, choice: string, previous?: string): string {
  if (choice !== "random") return choice;
  let tonic: string;
  do tonic = KEY_MAJORS[Math.floor(rng() * KEY_MAJORS.length)]; while (tonic === previous);
  return tonic;
}

/** MIDI note of the tonic the prompt notes are played from: F♯3 up to F4, around the middle of the keyboard */
const LOWEST_TONIC = 54;
export const tonicMidi = (tonic: string) => LOWEST_TONIC + ((chromaOf(tonic) - LOWEST_TONIC) % 12 + 12) % 12;

/** A note-practice prompt (pitch class and its name in the key), judged the same way: any octave */
export interface EarPrompt extends NotePrompt {
  /** Key value of the drone, e.g. "Eb:major" */
  keyValue: string;
  /** Degree id, e.g. "5" */
  degree: string;
  /** The note played (MIDI) */
  note: number;
}

export type EarState = NotePracticeState<EarPrompt>;
export type EarAction = NotePracticeAction<EarPrompt>;

/**
 * Picks a degree to play over the drone, from the allowed ones, never the same twice in a row (unless only one is
 * allowed). The note is that degree above the tonic, in the octave from `tonicMidi`.
 */
export function makeEarPrompt(rng: Rng, tonic: string, degrees: readonly string[], previous?: EarPrompt): EarPrompt {
  const pool = EAR_DEGREES.filter(d => degrees.includes(d.id));
  let d: typeof pool[number];
  do d = pool[Math.floor(rng() * pool.length)];
  while (pool.length > 1 && previous && previous.keyValue === tonic + ":major" && d.id === previous.degree);
  const note = tonicMidi(tonic) + d.semitones;
  return { keyValue: tonic + ":major", degree: d.id, note, pc: note % 12, name: buildKey(tonic + ":major")!.spell[note % 12] };
}
