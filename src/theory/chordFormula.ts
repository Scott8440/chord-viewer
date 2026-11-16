// A chord type's tones as the reference pages explain them: each tone's interval above the root, its degree as
// written in a chord formula ("♭3", "𝄫7"), its distance in half steps, and its note above a given root. From the chord
// templates, so the reference shows exactly the chords the recognizer knows. Pure.
import { Interval, Note } from "tonal";
import { templateById } from "./chords";
import { prettyAcc } from "./spelling";

export interface FormulaTone {
  /** Tonal interval name: "3m", "5P", "7d" */
  interval: string;
  /** As written in a chord formula: "1", "♭3", "♯5", "𝄫7", "9" */
  degree: string;
  /** Half steps above the root */
  semitones: number;
  /** Above the root given: MIDI note and its spelled name ("E♭") */
  midi: number;
  note: string;
  /** May be left out when the chord is played (the 5th of a seventh chord) */
  optional: boolean;
}

/** Steps whose plain form is perfect (1, 4, 5 and their octaves); the others are major or minor */
const PERFECT_STEPS = new Set([1, 4, 5, 8, 11, 12]);

/** A chord formula's name for an interval: "3M" is "3", "3m" is "♭3", "5d" is "♭5", "7d" is "𝄫7", "5A" is "♯5" */
export function degreeOf(interval: string): string {
  const { num, q } = Interval.get(interval);
  if (num == null || !q) throw new Error(`Not an interval: ${interval}`);
  const perfect = PERFECT_STEPS.has(num);
  const acc =
    q === "M" || q === "P"
      ? ""
      : q === "m"
        ? "♭"
        : q === "A"
          ? "♯"
          : q === "AA"
            ? "𝄪"
            : q === "d"
              ? perfect
                ? "♭"
                : "𝄫"
              : perfect
                ? "𝄫"
                : "♭𝄫";
  return `${acc}${num}`;
}

/** The tones of chord type `id` above `root` (a note with octave, "C4"), low to high */
export function chordFormula(id: string, root = "C4"): FormulaTone[] {
  const template = templateById(id);
  if (!template) throw new Error(`Unknown chord type: ${id}`);
  return template.tones.split(" ").map(t => {
    const optional = t.startsWith("(");
    const interval = t.replace(/[()]/g, "");
    const name = Note.transpose(root, interval);
    const midi = Note.midi(name);
    if (midi == null) throw new Error(`Can't place ${interval} above ${root}`);
    return {
      interval,
      degree: degreeOf(interval),
      semitones: Interval.semitones(interval) ?? midi - (Note.midi(root) ?? 0),
      midi,
      note: prettyAcc(Note.pitchClass(name)),
      optional,
    };
  });
}

/** "C–E♭–G" */
export const chordNotes = (tones: readonly FormulaTone[]) => tones.map(t => t.note).join("–");
/** "1 ♭3 5" */
export const chordDegrees = (tones: readonly FormulaTone[]) => tones.map(t => t.degree).join(" ");
