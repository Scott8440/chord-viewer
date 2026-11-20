// Presenters for the theory quiz: key signatures (the panel's text, and the board of keys to answer from).
import { signatureOf, signatureText, type KeySigState } from "../../exercises/keySignatures";
import {
  answersOf,
  DEGREES,
  placeId,
  playOnly,
  ringKeys,
  slotOf,
  type CircleQuizState,
  type CircleRing,
  type Place,
} from "../../exercises/circleQuiz";
import { keySignature, requireKey } from "../../theory";
import type { CircleQuizModel, CircleQuizSpot } from "../circleQuiz";
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
   Key relationships on the circle of fifths
   --------------------------------------------------------------- */

/** A key's tonic as the circle spells it, with ♯ and ♭ */
const tonicOf = (p: Place) => prettyAcc(ringKeys(p.ring)[p.key]);
/** On the circle: "D", "Bm" */
const placeLabel = (p: Place) => tonicOf(p) + (p.ring === "minor" ? "m" : "");

/** The keys either side of the bottom of the circle, spelled from the sharp side and from the flat side: a key's
 *  neighbours are spelled from its side (D♭ major's IV is G♭, not F♯; F♯ major's V is C♯, not D♭) */
const SIDE_SPELLING = {
  sharp: { major: { 7: "C#" }, minor: { 6: "D#", 7: "A#" } },
  flat: { major: { 5: "Cb", 6: "Gb" }, minor: { 5: "Ab" } },
} as const satisfies Record<string, Record<CircleRing, Partial<Record<number, string>>>>;
/** Which side of the circle a key is on (C major and A minor on neither) */
const sideOf = (p: Place): "sharp" | "flat" | null =>
  p.ring === "major"
    ? p.key >= 1 && p.key <= 6
      ? "sharp"
      : p.key >= 7
        ? "flat"
        : null
    : p.key >= 1 && p.key <= 5
      ? "sharp"
      : p.key >= 6
        ? "flat"
        : null;
/** A key's tonic spelled from the side of a key shown (its neighbours), with ♯ and ♭ */
const tonicNear = (ref: Place, p: Place) => {
  const side = sideOf(ref);
  const spelled = side ? (SIDE_SPELLING[side][p.ring] as Partial<Record<number, string>>)[p.key] : undefined;
  return spelled ? prettyAcc(spelled) : tonicOf(p);
};
const labelNear = (ref: Place, p: Place) => tonicNear(ref, p) + (p.ring === "minor" ? "m" : "");
const nameNear = (ref: Place, p: Place) => `${tonicNear(ref, p)} ${p.ring}`;
/** In full: "D major", "B minor"; the key opposite C named both ways */
export const placeName = (p: Place) =>
  (p.key === 6 ? prettyAcc(p.ring === "major" ? "F#/Gb" : "D#/Eb") : tonicOf(p)) + ` ${p.ring}`;
/** A dominant seventh on the board or the circle: "A7" */
const seventh = (key: number) => `${prettyAcc(ringKeys("major")[key])}7`;
const fromId = (id: string): Place => {
  const [ring, key] = id.split(":");
  return { ring: ring as CircleRing, key: Number(key) };
};
/** A key's signature in words: "3 flats", "no sharps or flats" */
const sigWords = (p: Place) => {
  const sig = keySignature(requireKey(`${ringKeys(p.ring)[p.key]}:${p.ring}`));
  if (!sig.count) return "no sharps or flats";
  const word = sig.accidental === "#" ? "sharp" : "flat";
  return `${sig.count} ${word}${sig.count > 1 ? "s" : ""}`;
};

/** The circle: the keys given, found and tried; the rest blank */
export function circleQuizModel(s: CircleQuizState, o: { sigRow: boolean; board: boolean }): CircleQuizModel {
  const p = s.prompt;
  const shown = new Map<string, { label: string; state: CircleQuizSpot["state"] }>();
  const give = (pl: Place, label = placeLabel(pl)) => shown.set(placeId(pl), { label, state: "given" });
  if (p.kind === "degree" || p.kind === "related") give(p.ref);
  if (p.kind === "signature") give({ ring: "major", key: 0 });
  if (p.kind === "chain") {
    give({ ring: "major", key: p.chords[0] }, seventh(p.chords[0]));
    give({ ring: "major", key: p.chords[p.chords.length - 1] });
    const next = answersOf(p)[s.found.length];
    if (next && s.status !== "correct") shown.set(placeId(next), { label: "", state: "asked" });
  }
  for (const id of s.found) {
    const pl = fromId(id);
    const label = p.kind === "chain" ? seventh(pl.key) : "ref" in p ? labelNear(p.ref, pl) : placeLabel(pl);
    shown.set(id, { label, state: "found" });
  }
  if (p.kind !== "chain") for (const id of s.tried) if (!shown.has(id)) shown.set(id, { label: "", state: "wrong" });
  const spots: CircleQuizSpot[] = [];
  for (const ring of ["major", "minor"] as const)
    for (let key = 0; key < 12; key++) {
      const id = placeId({ ring, key });
      const it = shown.get(id) ?? { label: "", state: "open" as const };
      spots.push({ id, ring, slot: slotOf(key, p.rotation), ...it });
    }
  const total = answersOf(p).length;
  return {
    spots,
    center: p.kind === "degree" ? p.degree : total > 1 ? `${s.found.length} / ${total}` : "",
    pickable: p.kind !== "chain" && !playOnly(p.kind) && s.status !== "correct",
    signature:
      p.kind === "signature" ? requireKey(`${ringKeys(p.answer.ring)[p.answer.key]}:${p.answer.ring}`).vfKey : null,
    sigRow: o.sigRow,
    board: o.board,
  };
}

/** For a chain, the dominant sevenths to name it from (shuffled per question); the others are answered on the circle */
export function circleQuizAnswers(s: CircleQuizState): AnswerBox[] {
  const p = s.prompt;
  if (p.kind !== "chain") return [];
  return p.choices.map(k => {
    const id = placeId({ ring: "major", key: k });
    return {
      id: String(k),
      label: seventh(k),
      state: s.found.includes(id) ? "right" : s.tried.includes(id) ? "wrong" : "",
      disabled: s.status === "correct" || s.found.includes(id) || s.tried.includes(id),
    };
  });
}

export function circleQuizDisplay(s: CircleQuizState): PracticeDisplay {
  const p = s.prompt;
  const last = s.tried[s.tried.length - 1];
  let label: string,
    sub: string,
    feedback = "";
  switch (p.kind) {
    case "degree": {
      const d = DEGREES[p.ref.ring].find(x => x.id === p.degree)!;
      label = `What's the ${d.name} of ${placeName(p.ref)}?`;
      sub = "Play its tonic on the keyboard";
      if (s.status === "correct")
        feedback = `✓ ${nameNear(p.ref, d.at(p.ref.key))} is the ${d.name} of ${placeName(p.ref)}`;
      // A note played can't say major or minor: the note is named
      else if (s.status === "wrong") feedback = `✗ Not ${tonicNear(p.ref, fromId(last))}`;
      break;
    }
    case "related":
      label = `Which keys are closely related to ${placeName(p.ref)}?`;
      sub = "Play the tonic of each of the five, in any order · each shares six or all seven of its notes";
      if (s.status === "correct")
        feedback = `✓ ${answersOf(p)
          .map(a => labelNear(p.ref, a))
          .join(", ")}: the keys around ${placeLabel(p.ref)}`;
      else if (s.status === "wrong") feedback = `✗ ${tonicNear(p.ref, fromId(last))} isn't the tonic of any of them`;
      break;
    case "signature":
      label = `Which ${p.answer.ring} key has this key signature?`;
      sub = "Pick it on the circle, or play its tonic · C major is shown";
      if (s.status === "correct") feedback = `✓ ${placeName(p.answer)}: ${sigWords(p.answer)}`;
      else if (s.status === "wrong") feedback = `✗ ${placeName(fromId(last))} has ${sigWords(fromId(last))}`;
      break;
    case "chain": {
      const first = seventh(p.chords[0]),
        tonic = placeLabel({ ring: "major", key: p.chords[p.chords.length - 1] });
      label = `Name the dominants from ${first} to ${tonic}`;
      sub = "Each chord resolves a fifth down to the next: pick them in order, or play their roots";
      if (s.status === "correct")
        feedback = "✓ " + p.chords.map((k, i) => (i === p.chords.length - 1 ? tonic : seventh(k))).join(" → ");
      else if (s.status === "wrong") {
        // The chord asked for resolves to the one after it
        const i = s.found.length + 1,
          to = i + 1 === p.chords.length - 1 ? tonic : seventh(p.chords[i + 1]);
        feedback = `✗ Not ${seventh(fromId(last).key)}: which dominant seventh resolves to ${to}?`;
      }
      break;
    }
  }
  return { label, promptHtml: "", size: "chord", sub, status: s.status, feedback, score: scoreText(s) };
}
