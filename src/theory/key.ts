// Key context: scale, spelling, in-key pitch classes and key signature.
import { Key } from "tonal";
import { alterOf, chromaOf, FLAT, ROOT_MAJOR, SHARP } from "./spelling";

export const KEY_MAJORS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const KEY_MINORS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/**
 * The circle of fifths, clockwise from C (one more sharp, or one fewer flat, each step), spelled as in the key lists
 * (F# stands in for Gb). The minor ring holds each major key's relative minor.
 */
export const CIRCLE_OF_FIFTHS_MAJOR = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
export const CIRCLE_OF_FIFTHS_MINOR = ["A", "E", "B", "F#", "C#", "G#", "Eb", "Bb", "F", "C", "G", "D"];

/** Position of a key on the circle of fifths (0 = C major / A minor), or -1 if it isn't one of the 24 keys. */
export function circlePosition(keyValue: string): number {
  const [tonic, mode] = keyValue.split(":");
  return (mode === "minor" ? CIRCLE_OF_FIFTHS_MINOR : CIRCLE_OF_FIFTHS_MAJOR).indexOf(tonic);
}

/**
 * A key's signature, counted from its own scale (natural minor for minor keys), so enharmonic keys come out as
 * spelled: F# major has 6 sharps, its relative Eb minor 6 flats.
 */
export function keySignature(key: KeyContext): { count: number; accidental: "#" | "b" | "" } {
  const sharps = key.scale.filter(n => n.includes("#")).length;
  const flats = key.scale.filter(n => n.includes("b")).length;
  return sharps ? { count: sharps, accidental: "#" } : flats ? { count: flats, accidental: "b" } : { count: 0, accidental: "" };
}

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
