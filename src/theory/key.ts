// Key context: scale, spelling, in-key pitch classes and key signature.
import { Key } from "tonal";
import { alterOf, chromaOf, FLAT, ROOT_MAJOR, SHARP } from "./spelling";

export const KEY_MAJORS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const KEY_MINORS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/** Whether a value is one of the 24 keys offered, e.g. "C:major", "F#:minor" */
export function isKeyValue(value: string): boolean {
  const [tonic, mode] = value.split(":");
  return (mode === "major" && KEY_MAJORS.includes(tonic)) || (mode === "minor" && KEY_MINORS.includes(tonic));
}

export interface KeyContext {
  tonic: string;
  mode: "major" | "minor";
  tonicPc: number;
  scale: readonly string[];
  /** Spelling for each pitch class in this key */
  spell: string[];
  inKey: Set<number>;
  /** Harmonic minor's raised 7th, or null in major */
  leadingTone: string | null;
  /** Alteration the key signature applies to each letter */
  sigAlter: Record<string, number>;
  vfKey: string;
  label: string;
}

/** Builds a key from a selector value like "C:major" or "F#:minor"; "" means no key. */
export function buildKey(value: string): KeyContext | null {
  if (!value) return null;
  const [tonic, modeStr] = value.split(":");
  const mode = modeStr === "major" ? "major" : "minor";
  let scale: readonly string[];
  let sig: string;
  let leadingTone: string | null = null;
  if (mode === "major") {
    const k = Key.majorKey(tonic);
    scale = k.scale;
    sig = k.keySignature;
  } else {
    const k = Key.minorKey(tonic);
    scale = k.natural.scale;
    sig = k.keySignature;
    leadingTone = k.harmonic.scale[6];
  }
  const spell: (string | null)[] = new Array(12).fill(null);
  scale.forEach(n => (spell[chromaOf(n)] = n));
  const inKey = new Set(scale.map(chromaOf));
  if (leadingTone) {                 // harmonic minor's raised 7th counts as in-key
    spell[chromaOf(leadingTone)] = leadingTone;
    inKey.add(chromaOf(leadingTone));
  }
  const chromatic = sig.includes("b") ? FLAT : sig.includes("#") ? SHARP : ROOT_MAJOR;
  for (let pc = 0; pc < 12; pc++) if (!spell[pc]) spell[pc] = chromatic[pc];
  const sigAlter: Record<string, number> = {};
  scale.forEach(n => (sigAlter[n[0]] = alterOf(n.slice(1))));
  return {
    tonic, mode, tonicPc: chromaOf(tonic), scale, spell: spell as string[], inKey, leadingTone, sigAlter,
    vfKey: mode === "major" ? tonic : tonic + "m",
    label: tonic + (mode === "major" ? " major" : " minor"),
  };
}
