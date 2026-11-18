// Scale exercise: a scale played up and back down, as a prescriptive note sequence.
import { Key } from "tonal";
import { chromaOf, type KeyContext } from "../theory";
import type { NoteStep, NotesStep, SequenceExercise } from "./sequence";

/** Minor scale forms; major keys always use the major scale */
export const MINOR_FORMS = ["natural", "harmonic", "melodic"] as const;
export type MinorForm = (typeof MINOR_FORMS)[number];
export const SCALE_OCTAVES = [1, 2] as const;
export type ScaleOctaves = (typeof SCALE_OCTAVES)[number];

/**
 * The scale of a key, up and back down over 1 or 2 octaves, starting and ending on the tonic.
 * Melodic minor goes up with the raised 6th and 7th and comes down as natural minor.
 */
export function scaleExercise(
  key: KeyContext,
  minorForm: MinorForm,
  octaves: ScaleOctaves,
): SequenceExercise<NoteStep> {
  const tonic = key.tonic;
  let up: readonly string[], down: readonly string[];
  if (key.mode === "major") {
    up = down = Key.majorKey(tonic).scale;
  } else {
    const k = Key.minorKey(tonic);
    up = k[minorForm].scale;
    down = minorForm === "melodic" ? k.natural.scale : up;
  }
  const t = chromaOf(tonic);
  const offset = (name: string) => (chromaOf(name) - t + 12) % 12;
  const step = (octave: number, name: string): NoteStep => ({ kind: "note", offset: 12 * octave + offset(name), name });
  const steps: NoteStep[] = [];
  for (let o = 0; o < octaves; o++) for (const n of up) steps.push(step(o, n));
  steps.push(step(octaves, tonic));
  for (let o = octaves - 1; o >= 0; o--) for (const n of [...down].reverse()) steps.push(step(o, n));

  const form = key.mode === "major" ? "major" : `${minorForm} minor`;
  return {
    id: `scale:${tonic}:${key.mode}:${key.mode === "minor" ? minorForm : ""}:${octaves}`,
    title: `${tonic} ${form}`,
    instruction: `Play ${tonic} ${form} up and back down, ${octaves === 1 ? "one octave" : "two octaves"}, starting on any ${tonic}`,
    basePc: t,
    keyValue: `${tonic}:${key.mode}`,
    steps,
  };
}

/** Scales with one hand, or both: the hands an octave apart moving the same way, or from one shared note moving
 *  apart and back */
export const SCALE_HANDS = ["one", "parallel", "contrary"] as const;
export type ScaleHands = (typeof SCALE_HANDS)[number];
export type HandMotion = Exclude<ScaleHands, "one">;

/**
 * A scale with both hands together, as a run of notes played together (one per hand). Parallel: the left hand an
 * octave below the right, up and back down. Contrary: both thumbs on the tonic, the right hand going up while the left
 * goes down, then back to the tonic; each hand uses the form for its direction (melodic minor raised going up).
 */
export function handsTogetherExercise(
  key: KeyContext,
  minorForm: MinorForm,
  octaves: ScaleOctaves,
  motion: HandMotion,
): SequenceExercise<NotesStep> {
  const tonic = key.tonic;
  let up: readonly string[], down: readonly string[];
  if (key.mode === "major") {
    up = down = Key.majorKey(tonic).scale;
  } else {
    const k = Key.minorKey(tonic);
    up = k[minorForm].scale;
    down = minorForm === "melodic" ? k.natural.scale : up;
  }
  const t = chromaOf(tonic);
  /** A form's notes, ascending, from `fromOctave` octaves above the tonic for `octaves` octaves, ending on the tonic */
  const ascending = (form: readonly string[], fromOctave: number) => {
    const out: { offset: number; name: string }[] = [];
    for (let o = 0; o < octaves; o++)
      for (const n of form) out.push({ offset: 12 * (fromOctave + o) + ((chromaOf(n) - t + 12) % 12), name: n });
    out.push({ offset: 12 * (fromOctave + octaves), name: tonic });
    return out;
  };
  const together = (...notes: { offset: number; name: string }[]): NotesStep => {
    const sorted = notes
      .sort((a, b) => a.offset - b.offset)
      .filter((n, i, all) => i === 0 || n.offset !== all[i - 1].offset);
    return { kind: "notes", offsets: sorted.map(n => n.offset), names: sorted.map(n => n.name) };
  };
  const steps: NotesStep[] = [];
  if (motion === "parallel") {
    const rhUp = ascending(up, 0),
      rhDown = ascending(down, 0).reverse();
    for (const n of rhUp) steps.push(together(n, { ...n, offset: n.offset - 12 }));
    for (const n of rhDown.slice(1)) steps.push(together(n, { ...n, offset: n.offset - 12 }));
  } else {
    // Out: the right hand up its rising form, the left down its falling form; back: the other way round
    const rhOut = ascending(up, 0),
      lhOut = ascending(down, -octaves).reverse();
    const rhBack = ascending(down, 0).reverse(),
      lhBack = ascending(up, -octaves);
    rhOut.forEach((n, i) => steps.push(together(n, lhOut[i])));
    rhBack.forEach((n, i) => i > 0 && steps.push(together(n, lhBack[i])));
  }
  const form = key.mode === "major" ? "major" : `${minorForm} minor`;
  const span = octaves === 1 ? "one octave" : "two octaves";
  return {
    id: `hands:${tonic}:${key.mode}:${key.mode === "minor" ? minorForm : ""}:${octaves}:${motion}`,
    title: `${tonic} ${form}, ${motion === "parallel" ? "hands together" : "contrary motion"}`,
    instruction:
      motion === "parallel"
        ? `Play ${tonic} ${form} with both hands an octave apart, up and back down, ${span}`
        : `Play ${tonic} ${form} in contrary motion: both thumbs on the same ${tonic}, hands moving apart ${span} and back`,
    basePc: t,
    keyValue: `${tonic}:${key.mode}`,
    steps,
  };
}
