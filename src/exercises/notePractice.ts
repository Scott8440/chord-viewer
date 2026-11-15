// Judging a "play this pitch class" prompt, in any octave: ear training by scale degree uses it. It began as note
// practice (the app named a note), which sight reading replaced; only the judging is left. Pure.
import { answeredRight, answeredWrong, movedOn, type Judged, type MoveOn } from "./judging";

export interface NotePrompt {
  /** Pitch class to play (0 = C) */
  pc: number;
  /** How the prompt is written, e.g. "F#" or "Gb" */
  name: string;
}

/** Generic in the prompt, so a drill can ask with its own prompt type (ear training adds the degree and octave) */
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
