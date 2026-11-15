// Note practice: the app names a note, the player plays it in any octave.
// Pure data and functions; the mode in src/modes/notePractice.ts drives it.
import { FLAT, SHARP, type KeyContext } from "../theory";
import { answeredRight, answeredWrong, movedOn, type Judged, type MoveOn } from "./judging";

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

/** Generic in the prompt, so other "play this pitch class" drills (ear training) judge the same way */
export interface NotePracticeState<P extends NotePrompt = NotePrompt> extends Judged<P> {
  /** Last note played for this prompt (MIDI number) */
  played: number | null;
}

export type NotePracticeAction<P extends NotePrompt = NotePrompt> = { type: "play"; note: number } | MoveOn<P>;

export function initialNotePractice<P extends NotePrompt>(prompt: P): NotePracticeState<P> {
  return { prompt, status: "waiting", played: null, missed: false, answered: 0, firstTry: 0 };
}

export function reduceNotePractice<P extends NotePrompt>(s: NotePracticeState<P>, a: NotePracticeAction<P>): NotePracticeState<P> {
  if (a.type !== "play") return movedOn(s, a, { played: null });
  if (s.status === "correct") return s;   // already answered; ignore notes until the next prompt
  // Any octave counts
  return a.note % 12 === s.prompt.pc ? answeredRight(s, { played: a.note }) : answeredWrong(s, { played: a.note });
}
