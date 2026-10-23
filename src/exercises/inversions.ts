// Required inversions: which chord tones can be in the bass, and adding one to a prompt.
import { Note } from "tonal";
import { chromaOf, matchTemplate, type TemplateTone } from "../theory";
import type { ChordPrompt } from "./chordPrompt";
import type { Rng } from "./notePractice";

/** Chord tones that can be in the bass, in inversion order: root, 3rd (or sus tone), 5th, 7th or 6th. Not 9ths. */
export function inversionTones(type: string): TemplateTone[] {
  const m = matchTemplate([], 0, type);
  return [...m.missing, ...m.omitted].filter(t => t.degree <= 7).sort((a, b) => a.degree - b.degree);
}

/** Requires a specific inversion: 0 = root position, 1 = 3rd (or sus tone) in the bass, and so on. */
export function atInversion(prompt: ChordPrompt, number: number): ChordPrompt {
  const bass = Note.transpose(prompt.root, inversionTones(prompt.type)[number].interval);
  return { ...prompt, inversion: { number, bass, bassPc: chromaOf(bass) } };
}

/** Adds a random inversion (root position included) to a prompt. */
export function withInversion(rng: Rng, prompt: ChordPrompt): ChordPrompt {
  return atInversion(prompt, Math.floor(rng() * inversionTones(prompt.type).length));
}
