// Presenters for the theory quiz: key signatures (the panel's text, and the board of keys to answer from).
import { signatureOf, signatureText, type KeySigState } from "../../exercises/keySignatures";
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
