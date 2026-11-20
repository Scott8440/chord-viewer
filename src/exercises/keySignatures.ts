// Theory quiz, key signatures: a key signature is shown on the staff with no notes, and the player names the key,
// major or minor as asked (a signature is shared by a major key and its relative minor). Answered from a board of keys
// or by playing the key's tonic in any octave. Pure.
import { chromaOf } from "../theory";
import { answeredRight, answeredWrong, movedOn, type Judged, type MoveOn } from "./judging";
import { pick, type Rng } from "./random";

/** The 15 major keys by signature: no accidentals, 1 to 7 sharps, then 1 to 7 flats */
export const SIG_MAJORS = ["C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"] as const;
/** Their relative minors, in the same order (the same signatures) */
export const SIG_MINORS = ["A", "E", "B", "F#", "C#", "G#", "D#", "A#", "D", "G", "C", "F", "Bb", "Eb", "Ab"] as const;
/** The order sharps and flats are written in a signature */
export const SHARP_ORDER = ["F#", "C#", "G#", "D#", "A#", "E#", "B#"] as const;
export const FLAT_ORDER = ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"] as const;

export type KeySigModes = "major" | "minor" | "both";
export const KEY_SIG_MODES: readonly KeySigModes[] = ["major", "minor", "both"];
/** The most sharps or flats a signature may have */
export const KEY_SIG_MOSTS = [3, 5, 7] as const;
export type KeySigMost = (typeof KEY_SIG_MOSTS)[number];

export interface KeySigOptions {
  keys: KeySigModes;
  most: KeySigMost;
}
export const DEFAULT_KEY_SIG: KeySigOptions = { keys: "major", most: 7 };

export function sanitizeKeySigOptions(raw: unknown): KeySigOptions {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    keys: KEY_SIG_MODES.includes(o.keys as KeySigModes) ? (o.keys as KeySigModes) : DEFAULT_KEY_SIG.keys,
    most: KEY_SIG_MOSTS.includes(o.most as KeySigMost) ? (o.most as KeySigMost) : DEFAULT_KEY_SIG.most,
  };
}

/** A signature: how many sharps or flats */
export interface Signature {
  count: number;
  accidental: "#" | "b" | "";
}

/** The signature at a place in SIG_MAJORS / SIG_MINORS */
const signatureAt = (i: number): Signature =>
  i === 0 ? { count: 0, accidental: "" } : i <= 7 ? { count: i, accidental: "#" } : { count: i - 7, accidental: "b" };

/** The signature of one of the quiz's keys, e.g. "E:minor": 1 sharp */
export function signatureOf(keyValue: string): Signature {
  const [tonic, mode] = keyValue.split(":");
  const list: readonly string[] = mode === "minor" ? SIG_MINORS : SIG_MAJORS;
  return signatureAt(list.indexOf(tonic));
}

/** The keys on offer for a mode, in signature order (sharps, then flats), up to `most` sharps or flats */
export function keySigChoices(mode: "major" | "minor", most: number): string[] {
  const list = mode === "minor" ? SIG_MINORS : SIG_MAJORS;
  return list.filter((_, i) => signatureAt(i).count <= most).map(tonic => `${tonic}:${mode}`);
}

export interface KeySigPrompt {
  /** The key whose signature is shown, e.g. "Eb:major" */
  keyValue: string;
  mode: "major" | "minor";
}

/** A key to show: its mode as chosen (either, for both), and not the signature just shown */
export function makeKeySigPrompt(rng: Rng, o: KeySigOptions, previous?: KeySigPrompt): KeySigPrompt {
  const mode = o.keys === "both" ? pick(rng, ["major", "minor"] as const) : o.keys;
  const before = previous ? signatureOf(previous.keyValue) : null;
  const choices = keySigChoices(mode, o.most).filter(k => {
    const sig = signatureOf(k);
    return !before || sig.count !== before.count || sig.accidental !== before.accidental;
  });
  return { keyValue: pick(rng, choices), mode };
}

export interface KeySigState extends Judged<KeySigPrompt> {
  /** Keys answered wrong for this prompt, in order (key values); a wrong note played is "note:<pc>" */
  tried: string[];
}

export type KeySigAction = { type: "answer"; keyValue: string } | { type: "play"; note: number } | MoveOn<KeySigPrompt>;

export const initialKeySig = (prompt: KeySigPrompt): KeySigState => ({
  prompt,
  status: "waiting",
  missed: false,
  answered: 0,
  firstTry: 0,
  tried: [],
});

export function reduceKeySig(s: KeySigState, a: KeySigAction): KeySigState {
  if (a.type === "next" || a.type === "skip") return movedOn(s, a, { tried: [] });
  if (s.status === "correct") return s; // answered; wait for the next one
  const tonic = s.prompt.keyValue.split(":")[0];
  if (a.type === "play") {
    if (((a.note % 12) + 12) % 12 === chromaOf(tonic)) return answeredRight(s);
    return answeredWrong(s, { tried: [...s.tried, `note:${((a.note % 12) + 12) % 12}`] });
  }
  if (a.keyValue === s.prompt.keyValue) return answeredRight(s);
  if (s.tried.includes(a.keyValue)) return s;
  return answeredWrong(s, { tried: [...s.tried, a.keyValue] });
}

/** A signature in words, its accidentals in order: "no sharps or flats", "2 sharps (F♯ C♯)" — spelled with # and b */
export function signatureText(sig: Signature): string {
  if (!sig.count) return "no sharps or flats";
  const order = sig.accidental === "#" ? SHARP_ORDER : FLAT_ORDER;
  const word = sig.accidental === "#" ? "sharp" : "flat";
  return `${sig.count} ${word}${sig.count > 1 ? "s" : ""} (${order.slice(0, sig.count).join(" ")})`;
}
