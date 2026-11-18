// Note names, accidentals and spelling MIDI notes for display.
import { Note } from "tonal";
import type { Analysis } from "./chords";
import type { KeyContext } from "./key";

export const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const LETTERS = "CDEFGAB";
export const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// Conventional root spellings, by chord quality
export const ROOT_MAJOR = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const ROOT_MINOR = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
export const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function alterOf(accStr: string): number {
  return [...accStr].reduce((a, ch) => a + (ch === "#" ? 1 : ch === "b" ? -1 : 0), 0);
}

export function chromaOf(name: string): number {
  return Note.chroma(name);
}

/** Name for a pitch class with no chord context: the key's spelling, else flats/sharps. */
export function pcName(pc: number, key: KeyContext | null, flats?: boolean): string {
  if (key) return key.spell[pc];
  return (flats ? ROOT_MAJOR : flats === false ? SHARP : ROOT_MAJOR)[pc];
}

export interface SpelledNote {
  letter: string;
  acc: string;
  alter: number;
  octave: number;
  step: number;
  midi: number;
}

/** Spells a MIDI note using the chord's spelling if it has one, else the key's, else sharps/flats. */
export function spellNote(midi: number, result: Analysis | null, key: KeyContext | null): SpelledNote {
  const pc = midi % 12;
  let name = result && result.spell && result.spell[pc];
  if (!name) {
    if (key) name = key.spell[pc];
    else name = (result && result.flats ? ROOT_MAJOR : SHARP)[pc];
  }
  return spelledAs(midi, name);
}

/** A MIDI note spelled with a given name ("F#", "Bb", "B#"): the octave follows the letter, so B#3 is MIDI 60 */
export function spelledAs(midi: number, name: string): SpelledNote {
  const letter = name[0];
  const accStr = name.slice(1);
  const alter = alterOf(accStr);
  const octave = Math.round((midi - alter - LETTER_PC[letter]) / 12 - 1);
  return { letter, acc: accStr, alter, octave, step: LETTERS.indexOf(letter) + 7 * octave, midi };
}

export function prettyAcc(s: string): string {
  return s.replace(/##/g, "𝄪").replace(/bb/g, "𝄫").replace(/#/g, "♯").replace(/b/g, "♭");
}

/**
 * Accidentals made pretty in free text, word by word, without touching ordinary words ("both" stays "both"): a note
 * or chord's accidental after its letter ("Bbm7" is "B♭m7"), one before a number ("7b5", "b3" are "7♭5", "♭3") or a
 * Roman numeral ("bVII" is "♭VII").
 */
export function prettyText(s: string): string {
  return s.replace(/[^\s,·–()/:]+/g, word => {
    // A note or chord: its letter, its accidental, then anything (the accidental is only one if what follows isn't a
    // lower-case word: "Bb", "Bbm7", "Bbdim", "F#", but not "Both", "Bass")
    const note = /^([A-G])(##|bb|#|b)(?=$|[mMad0-9+(ø°/s-]|aug|dim|maj|sus|add)(.*)$/.exec(word);
    const head = note ? note[1] + prettyAcc(note[2]) : "";
    const rest = note ? note[3] : word;
    // Accidentals before a number or a Roman numeral
    return (
      head + rest.replace(/(^|[0-9(/])(##|bb|#|b)(?=[0-9]|[IV]+\b|[iv]+\b)/g, (_, pre, acc) => pre + prettyAcc(acc))
    );
  });
}
