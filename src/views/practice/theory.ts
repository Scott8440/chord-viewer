// Presenters for the theory quiz: key signatures (the panel's text, and the board of keys to answer from).
import { signatureOf, signatureText, type KeySigState } from "../../exercises/keySignatures";
import {
  fifthsFromAnchor,
  keyAt,
  ringKeys,
  spotOf,
  type CircleQuizState,
  type CircleRing,
} from "../../exercises/circleQuiz";
import type { CircleQuizModel } from "../circleQuiz";
import { prettyAcc, prettyText } from "../../theory";
import type { AnswerBox } from "../answerBoard";
import type { PracticeDisplay } from "./view";

const scoreText = (s: { answered: number; firstTry: number }) =>
  s.answered ? `${s.firstTry} / ${s.answered} right first time` : "";

/** "E♭ major", "C♯ minor" */
export const keyName = (keyValue: string) => {
  const [tonic, mode] = keyValue.split(":");
  return `${prettyAcc(tonic)} ${mode}`;
};
/** On a box: "E♭" for a major key, "Cm" for a minor one */
const boxLabel = (keyValue: string) => {
  const [tonic, mode] = keyValue.split(":");
  return prettyAcc(tonic) + (mode === "minor" ? "m" : "");
};
/** The signature in words, with ♯ and ♭ */
const sigText = (keyValue: string) => prettyText(signatureText(signatureOf(keyValue)));

/** The keys to answer from, in the prompt's (random) order */
export function keySigAnswers(s: KeySigState): AnswerBox[] {
  return s.prompt.choices.map(k => ({
    id: k,
    label: boxLabel(k),
    state: s.status === "correct" && k === s.prompt.keyValue ? "right" : s.tried.includes(k) ? "wrong" : "",
    detail: s.status === "correct" && k === s.prompt.keyValue ? sigText(k).replace(/ \(.*/, "") : undefined,
    disabled: s.status === "correct" || s.tried.includes(k),
  }));
}

export function keySigDisplay(s: KeySigState): PracticeDisplay {
  let feedback = "";
  if (s.status === "correct") feedback = `✓ ${keyName(s.prompt.keyValue)}: ${sigText(s.prompt.keyValue)}`;
  else if (s.status === "wrong") {
    const last = s.tried[s.tried.length - 1];
    feedback = last.startsWith("note:") ? "✗ That's not its tonic" : `✗ ${keyName(last)} has ${sigText(last)}`;
  }
  return {
    label: `Which ${s.prompt.mode} key has this key signature?`,
    promptHtml: "",
    size: "chord",
    sub: "Choose a key, or play its tonic",
    status: s.status,
    feedback,
    score: scoreText(s),
  };
}

/* ---------------------------------------------------------------
   The circle of fifths quiz
   --------------------------------------------------------------- */

/** The key opposite C major / A minor, six fifths either way: named both ways, as most circles print it */
const OPPOSITE = { major: "F#/Gb", minor: "D#/Eb" } as const;
const tonicOf = (ring: CircleRing, key: number) => prettyAcc(key === 6 ? OPPOSITE[ring] : ringKeys(ring)[key]);
/** A key on the ring by its place in circle order: "D", "F♯/G♭", or "Dm", "D♯/E♭m" on the minor ring */
const ringKeyLabel = (ring: CircleRing, key: number) => tonicOf(ring, key) + (ring === "minor" ? "m" : "");
/** The same, in full: "D major", "F♯/G♭ major" */
export const ringKeyName = (ring: CircleRing, key: number) => `${tonicOf(ring, key)} ${ring}`;
/** How far round a spot is from the round's given key, in words */
function fromGiven(s: CircleQuizState, spot: number): string {
  const r = s.prompt.round,
    n = fifthsFromAnchor(r, spot);
  const given = ringKeyLabel(r.ring, r.anchorKey);
  if (n === 0) return `the given key, ${given}`;
  if (Math.abs(n) === 6) return `opposite ${given}`;
  return `${Math.abs(n)} fifth${Math.abs(n) > 1 ? "s" : ""} ${n > 0 ? "clockwise" : "anticlockwise"} from ${given}`;
}

/** The circle: each place filled in, open, asked about, or tried wrongly */
export function circleQuizModel(s: CircleQuizState): CircleQuizModel {
  const { round, ask, spot } = s.prompt;
  return {
    spots: Array.from({ length: 12 }, (_, i) => {
      const label = ringKeyLabel(round.ring, keyAt(round, i));
      if (i === round.anchorSpot) return { label, state: "given" as const };
      if (s.revealed.includes(i)) return { label, state: "revealed" as const };
      if (s.filled.includes(i)) return { label, state: "found" as const };
      if (ask === "which" && i === spot) return { label: "", state: "asked" as const };
      if (ask === "where" && s.tried.includes(i)) return { label: "", state: "wrong" as const };
      return { label: "", state: "open" as const };
    }),
    center: `${s.filled.length} / 12`,
    pickable: ask === "where" && s.status !== "correct",
  };
}

/** For a which question, the keys to answer from (shuffled per prompt); a where question is answered on the circle */
export function circleQuizAnswers(s: CircleQuizState): AnswerBox[] {
  const { round, ask, spot, choices } = s.prompt;
  if (ask !== "which") return [];
  const right = keyAt(round, spot);
  return choices.map(k => ({
    id: String(k),
    label: ringKeyLabel(round.ring, k),
    state: s.status === "correct" && k === right ? "right" : s.tried.includes(k) ? "wrong" : "",
    disabled: s.status === "correct" || s.tried.includes(k),
  }));
}

export function circleQuizDisplay(s: CircleQuizState): PracticeDisplay {
  const { round, ask, spot } = s.prompt;
  const name = ringKeyName(round.ring, keyAt(round, spot));
  let feedback = "";
  if (s.status === "correct") {
    feedback = `✓ ${name}: ${fromGiven(s, spot)}` + (s.filled.length >= 12 ? " · Circle complete" : "");
  } else if (s.status === "wrong") {
    const last = s.tried[s.tried.length - 1];
    feedback =
      ask === "where"
        ? `✗ That's where ${ringKeyName(round.ring, keyAt(round, last))} goes`
        : `✗ ${ringKeyName(round.ring, last)} is ${fromGiven(s, spotOf(round, last))}`;
  }
  return {
    label: ask === "where" ? `Where does ${name} go?` : "Which key goes in the marked place?",
    promptHtml: "",
    size: "chord",
    sub:
      ask === "where"
        ? "Pick its place on the circle · clockwise is a fifth up"
        : "Choose a key, or play its tonic · clockwise is a fifth up",
    status: s.status,
    feedback,
    score: scoreText(s),
  };
}
