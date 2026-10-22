// Note practice: the app names a note, the player plays it in any octave.
// Pure data and functions; the mode in src/modes/notePractice.ts drives it.
import { FLAT, SHARP, type KeyContext } from "../theory";

export type Rng = () => number;

export interface NotePrompt {
  /** Pitch class to play (0 = C) */
  pc: number;
  /** How the prompt is written, e.g. "F#" or "Gb" */
  name: string;
}

/**
 * Picks a note to ask for: any of the 12 pitch classes, never the same as the previous prompt.
 * Spelled from the key if one is set; otherwise black keys are a sharp or a flat at random.
 */
export function makeNotePrompt(rng: Rng, key: KeyContext | null, previous?: NotePrompt): NotePrompt {
  let pc: number;
  do pc = Math.floor(rng() * 12); while (previous && pc === previous.pc);
  const name = key ? key.spell[pc] : (rng() < 0.5 ? SHARP : FLAT)[pc];
  return { pc, name };
}

export interface NotePracticeState {
  prompt: NotePrompt;
  /** waiting: nothing played yet; wrong: last note was wrong; correct: answered, about to move on */
  status: "waiting" | "wrong" | "correct";
  /** Last note played for this prompt (MIDI number) */
  played: number | null;
  /** A wrong note was played for this prompt */
  missed: boolean;
  /** Prompts finished (answered or skipped) */
  answered: number;
  /** Prompts answered with no wrong note first */
  firstTry: number;
}

export type NotePracticeAction =
  | { type: "play"; note: number }
  | { type: "next"; prompt: NotePrompt }
  | { type: "skip"; prompt: NotePrompt };

export function initialNotePractice(prompt: NotePrompt): NotePracticeState {
  return { prompt, status: "waiting", played: null, missed: false, answered: 0, firstTry: 0 };
}

export function reduceNotePractice(s: NotePracticeState, a: NotePracticeAction): NotePracticeState {
  switch (a.type) {
    case "play":
      if (s.status === "correct") return s;   // already answered; ignore notes until the next prompt
      // Any octave counts
      if (a.note % 12 === s.prompt.pc) {
        return { ...s, status: "correct", played: a.note, answered: s.answered + 1, firstTry: s.firstTry + (s.missed ? 0 : 1) };
      }
      return { ...s, status: "wrong", played: a.note, missed: true };
    case "next":
      return { ...s, prompt: a.prompt, status: "waiting", played: null, missed: false };
    case "skip":
      // A skipped prompt counts as answered, but not right first time
      return { ...s, prompt: a.prompt, status: "waiting", played: null, missed: false,
               answered: s.status === "correct" ? s.answered : s.answered + 1 };
  }
}
