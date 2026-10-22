// Scale exercise: a scale played up and back down, as a prescriptive note sequence.
import { Key } from "tonal";
import { chromaOf, type KeyContext } from "../theory";
import type { SequenceExercise, SequenceStep } from "./sequence";

/** Minor scale forms; major keys always use the major scale */
export const MINOR_FORMS = ["natural", "harmonic", "melodic"] as const;
export type MinorForm = typeof MINOR_FORMS[number];
export const SCALE_OCTAVES = [1, 2] as const;
export type ScaleOctaves = typeof SCALE_OCTAVES[number];

/**
 * The scale of a key, up and back down over 1 or 2 octaves, starting and ending on the tonic.
 * Melodic minor goes up with the raised 6th and 7th and comes down as natural minor.
 */
export function scaleExercise(key: KeyContext, minorForm: MinorForm, octaves: ScaleOctaves): SequenceExercise {
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
  const steps: SequenceStep[] = [];
  for (let o = 0; o < octaves; o++) for (const n of up) steps.push({ offset: 12 * o + offset(n), name: n });
  steps.push({ offset: 12 * octaves, name: tonic });
  for (let o = octaves - 1; o >= 0; o--) for (const n of [...down].reverse()) steps.push({ offset: 12 * o + offset(n), name: n });

  const form = key.mode === "major" ? "major" : `${minorForm} minor`;
  return {
    id: `scale:${tonic}:${key.mode}:${key.mode === "minor" ? minorForm : ""}:${octaves}`,
    title: `${tonic} ${form}`,
    instruction: `Play the scale up and back down, ${octaves === 1 ? "one octave" : "two octaves"}, starting on any ${tonic}`,
    startPc: t,
    steps,
  };
}
