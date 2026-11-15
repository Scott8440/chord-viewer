// Moving an exercise on to another key once a run is done: round the circle of fifths, chromatically, at random, or
// staying put. Minor keys move through the minor keys. Pure; keys are spelled as in the key lists.
import { chromaOf, CIRCLE_OF_FIFTHS_MAJOR, CIRCLE_OF_FIFTHS_MINOR, KEY_MAJORS, KEY_MINORS } from "../theory";
import type { Rng } from "./notePractice";

export const KEY_PROGRESSIONS = ["repeat", "circle-sharps", "circle-flats", "chromatic-up", "chromatic-down", "random"] as const;
export type KeyProgression = typeof KEY_PROGRESSIONS[number];

/** The options of the "Then" picker */
export const KEY_PROGRESSION_LABELS: Record<KeyProgression, string> = {
  "repeat": "Same key again",
  "circle-sharps": "Next key round the circle, sharps first (C G D …)",
  "circle-flats": "Next key round the circle, flats first (C F B♭ …)",
  "chromatic-up": "Next key up a semitone (C D♭ D …)",
  "chromatic-down": "Next key down a semitone (C B B♭ …)",
  "random": "A random key",
};

/** The key after `keyValue` (e.g. "G:major") in a progression; a random key is never the same one again. */
export function nextKey(keyValue: string, progression: KeyProgression, rng: Rng = Math.random): string {
  const [tonic, mode] = keyValue.split(":");
  const minor = mode === "minor";
  const pc = chromaOf(tonic);
  const at = (list: readonly string[]) => Math.max(0, list.findIndex(t => chromaOf(t) === pc));
  const step = (list: readonly string[], by: number) => list[(at(list) + by + list.length) % list.length];
  const circle = minor ? CIRCLE_OF_FIFTHS_MINOR : CIRCLE_OF_FIFTHS_MAJOR;
  const chromatic = minor ? KEY_MINORS : KEY_MAJORS;
  let next: string;
  switch (progression) {
    case "repeat": return keyValue;
    case "circle-sharps": next = step(circle, 1); break;
    case "circle-flats": next = step(circle, -1); break;
    case "chromatic-up": next = step(chromatic, 1); break;
    case "chromatic-down": next = step(chromatic, -1); break;
    case "random": {
      const others = chromatic.filter(t => chromaOf(t) !== pc);
      next = others[Math.floor(rng() * others.length)];
    }
  }
  return `${next}:${mode}`;
}
