// Ear training. Scale degrees: a drone sounds the tonic, the app plays one note over it, and the player finds that
// note on the keyboard (any octave). Melodies: the root, then a few notes in the key, played back in order at the
// same pitch. Both
// share the options: which degrees can come up (starting with just 1 and 5) and the tonic.
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

/** The note a degree ("5") names above a tonic note, or null if it isn't one of EAR_DEGREES */
export function degreeNote(tonic: number, degree: string): number | null {
  const d = EAR_DEGREES.find(x => x.id === degree);
  return d ? tonic + d.semitones : null;
}

/** Drone tonic: one of the major key tonics, or a random one that changes every few prompts */
export const EAR_TONICS: readonly string[] = ["random", ...KEY_MAJORS];
/** With a random tonic, a new key every this many prompts */
export const PROMPTS_PER_KEY = 10;

/** Melodies: how many notes after the root */
export const MELODY_LENGTHS: readonly number[] = [2, 3, 4, 5, 6, 8];
export const DEFAULT_MELODY_LENGTH = 3;

/** Shared by both ear-training modes; `melodyLength` is for melodies only */
export interface EarOptions {
  tonic: string;
  degrees: readonly string[];
  melodyLength: number;
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
    melodyLength: MELODY_LENGTHS.includes(o.melodyLength as number) ? o.melodyLength as number : DEFAULT_MELODY_LENGTH,
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

/** The prompt notes come from this many octaves up from `tonicMidi`, so the register gives nothing away */
export const EAR_OCTAVES = 2;

/**
 * Picks a degree to play over the drone, from the allowed ones, in one of EAR_OCTAVES octaves. Never the same note
 * twice in a row, but the same degree may come again in another octave (so 1 and 5 don't simply alternate).
 */
export function makeEarPrompt(rng: Rng, tonic: string, degrees: readonly string[], previous?: EarPrompt): EarPrompt {
  const pool = EAR_DEGREES.filter(d => degrees.includes(d.id));
  let d: typeof pool[number], note: number;
  do {
    d = pool[Math.floor(rng() * pool.length)];
    note = tonicMidi(tonic) + d.semitones + 12 * Math.floor(rng() * EAR_OCTAVES);
  } while (previous && note === previous.note);
  return { keyValue: tonic + ":major", degree: d.id, note, pc: note % 12, name: buildKey(tonic + ":major")!.spell[note % 12] };
}

/* ---------------------------------------------------------------
   Melodies: the root, then a few notes in the key within an octave; the player plays it all back in order, root
   first, at the same pitch
   --------------------------------------------------------------- */

export interface MelodyNote {
  degree: string;
  /** MIDI */
  note: number;
  pc: number;
  name: string;
}

export interface MelodyPrompt {
  keyValue: string;
  /** What to play back: the root (the tonic at `tonicMidi`, degree 1) first, then the melody */
  notes: readonly MelodyNote[];
}

/**
 * The root, then a melody of `length` notes from the allowed degrees, within the octave from the root up to the next
 * root (when degree 1 is allowed), and no note straight after itself (unless it's the only one). Never the same
 * melody twice running.
 */
export function makeMelodyPrompt(rng: Rng, tonic: string, degrees: readonly string[], length: number,
                                 previous?: MelodyPrompt): MelodyPrompt {
  const key = buildKey(tonic + ":major")!;
  const root = tonicMidi(tonic);
  const pool = EAR_DEGREES.filter(d => degrees.includes(d.id)).map(d => ({ degree: d.id, note: root + d.semitones }));
  if (degrees.includes("1")) pool.push({ degree: "1", note: root + 12 });
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const note = (degree: string, midi: number): MelodyNote => ({ degree, note: midi, pc: midi % 12, name: key.spell[midi % 12] });
  for (let tries = 0; ; tries++) {
    const notes: MelodyNote[] = [note("1", root)];
    for (let i = 0; i < length; i++) {
      const last = notes[notes.length - 1].note;
      const fresh = pool.filter(c => c.note !== last);
      const c = pick(fresh.length ? fresh : pool);
      notes.push(note(c.degree, c.note));
    }
    const same = previous && previous.keyValue === tonic + ":major" &&
      previous.notes.length === notes.length && previous.notes.every((n, i) => n.note === notes[i].note);
    // With very few notes on offer a repeat may be unavoidable
    if (!same || tries > 20) return { keyValue: tonic + ":major", notes };
  }
}

/** Anything played back note by note, in order, at the exact pitch: a melody here, a line of sight reading */
export interface PlaybackPrompt {
  notes: readonly { note: number }[];
}

export interface MelodyState<P extends PlaybackPrompt = MelodyPrompt> {
  prompt: P;
  /** How many notes have been played back so far */
  index: number;
  /** waiting: playing it back; wrong: the last note was wrong (the step waits for the right one); correct: all played */
  status: "waiting" | "wrong" | "correct";
  /** The last note played (MIDI) */
  played: number | null;
  /** A wrong note was played on this melody */
  missed: boolean;
  answered: number;
  firstTry: number;
}

export type MelodyAction<P extends PlaybackPrompt = MelodyPrompt> =
  | { type: "play"; note: number }
  | { type: "next"; prompt: P }
  | { type: "skip"; prompt: P };

export function initialMelody<P extends PlaybackPrompt>(prompt: P): MelodyState<P> {
  return { prompt, index: 0, status: "waiting", played: null, missed: false, answered: 0, firstTry: 0 };
}

export function reduceMelody<P extends PlaybackPrompt>(s: MelodyState<P>, a: MelodyAction<P>): MelodyState<P> {
  switch (a.type) {
    case "play": {
      if (s.status === "correct") return s;   // done; ignore notes until the next melody
      // The exact note, octave included: the melody's shape is part of it
      if (a.note !== s.prompt.notes[s.index].note) return { ...s, status: "wrong", played: a.note, missed: true };
      const index = s.index + 1;
      if (index < s.prompt.notes.length) return { ...s, index, status: "waiting", played: a.note };
      return { ...s, index, status: "correct", played: a.note, answered: s.answered + 1, firstTry: s.firstTry + (s.missed ? 0 : 1) };
    }
    case "next":
      return { ...s, prompt: a.prompt, index: 0, status: "waiting", played: null, missed: false };
    case "skip":
      // A skipped melody counts as answered, but not right first time
      return { ...s, prompt: a.prompt, index: 0, status: "waiting", played: null, missed: false,
               answered: s.status === "correct" ? s.answered : s.answered + 1 };
  }
}
