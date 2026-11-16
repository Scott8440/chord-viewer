// A scale's notes as the reference pages explain them: each note's degree ("♭3"), its distance from the root in half
// steps, its MIDI note and spelled name above a given root, and the steps between neighbouring notes. From tonal's scale
// data, so every scale on the reference pages is worked out, not typed in. Pure.
import { Interval, Key, Note, Scale } from "tonal";
import { degreeOf, type FormulaTone } from "./chordFormula";
import { prettyAcc } from "./spelling";

/** The notes of a scale ("major", "harmonic minor", "dorian" …) from `root` (with octave, "C4"), low to high; with
 *  `octave`, the root an octave up to finish it */
export function scaleFormula(type: string, root = "C4", { octave = true } = {}): FormulaTone[] {
  const pc = Note.pitchClass(root);
  const scale = Scale.get(`${pc} ${type}`);
  if (scale.empty) throw new Error(`Unknown scale: ${type}`);
  const intervals = octave ? [...scale.intervals, "8P"] : scale.intervals;
  return intervals.map(interval => {
    const name = Note.transpose(root, interval);
    const midi = Note.midi(name);
    if (midi == null) throw new Error(`Can't place ${interval} above ${root}`);
    return {
      interval,
      degree: interval === "8P" ? "8" : degreeOf(interval),
      semitones: Interval.semitones(interval) ?? 0,
      midi,
      note: prettyAcc(Note.pitchClass(name)),
      optional: false,
    };
  });
}

/** The step from each note to the next, in half steps: [2, 2, 1, 2, 2, 2, 1] for a major scale with its octave */
export const scaleSteps = (tones: readonly FormulaTone[]) =>
  tones.slice(1).map((t, i) => t.semitones - tones[i].semitones);

/** A step as usually written: H (half), W (whole), W+H (three half steps, as in harmonic minor) */
export const stepName = (halfSteps: number) =>
  halfSteps === 1 ? "H" : halfSteps === 2 ? "W" : halfSteps === 3 ? "W+H" : `${halfSteps}`;

/** "C D E F G A B" (no octave note) */
export const scaleNotes = (tones: readonly FormulaTone[]) =>
  tones
    .filter(t => t.interval !== "8P")
    .map(t => t.note)
    .join(" ");

/** A major key's signature: how many sharps (positive) or flats (negative), and the notes it alters, in the order a
 *  signature writes them (F C G D A E B for sharps, B E A D G C F for flats) */
export function keySignature(tonic: string): { count: number; notes: string[] } {
  const key = Key.majorKey(tonic);
  const altered = new Set(key.scale.filter(n => n.length > 1).map(n => n[0]));
  const order = key.alteration >= 0 ? ["F", "C", "G", "D", "A", "E", "B"] : ["B", "E", "A", "D", "G", "C", "F"];
  const sign = key.alteration >= 0 ? "♯" : "♭";
  return { count: key.alteration, notes: order.filter(l => altered.has(l)).map(l => l + sign) };
}

/** The triads on each degree of a major or natural minor key, built from the key's own notes: ["C", "Dm", …, "Bdim"] */
export const diatonicTriads = (tonic: string, minor = false): string[] =>
  (minor ? Key.minorKey(tonic).natural.triads : Key.majorKey(tonic).triads).map(prettyAcc);
