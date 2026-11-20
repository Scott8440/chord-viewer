// Theory quiz, the circle of fifths: a round starts with the circle empty but for one key, placed at a random spot
// (clockwise is a fifth up, as always, but C needn't be at the top, so it's worked out from that key). Each prompt
// asks for one more of the twelve: where a key goes (the player picks the spot) or which key goes at a marked spot
// (picked from a board of keys, or its tonic played). A right answer, or a skip, fills that spot in; when all
// twelve are in, the next prompt starts a new round. Pure.
import { CIRCLE_OF_FIFTHS_MAJOR, CIRCLE_OF_FIFTHS_MINOR, chromaOf } from "../theory";
import { answeredRight, answeredWrong, type Judged } from "./judging";
import { pick, randomInt, shuffled, type Rng } from "./random";

export type CircleRing = "major" | "minor";
export const CIRCLE_RINGS: readonly CircleRing[] = ["major", "minor"];
/** Which questions: both kinds at random, or only one */
export type CircleAsks = "mixed" | "where" | "which";
export const CIRCLE_ASKS: readonly CircleAsks[] = ["mixed", "where", "which"];

export interface CircleQuizOptions {
  ring: CircleRing;
  asks: CircleAsks;
}
export const DEFAULT_CIRCLE_QUIZ: CircleQuizOptions = { ring: "major", asks: "mixed" };

export function sanitizeCircleQuizOptions(raw: unknown): CircleQuizOptions {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    ring: CIRCLE_RINGS.includes(o.ring as CircleRing) ? (o.ring as CircleRing) : DEFAULT_CIRCLE_QUIZ.ring,
    asks: CIRCLE_ASKS.includes(o.asks as CircleAsks) ? (o.asks as CircleAsks) : DEFAULT_CIRCLE_QUIZ.asks,
  };
}

/** The twelve keys of a ring in circle order (C or A first), spelled as the app's circle spells them */
export const ringKeys = (ring: CircleRing): readonly string[] =>
  ring === "minor" ? CIRCLE_OF_FIFTHS_MINOR : CIRCLE_OF_FIFTHS_MAJOR;

/** A round: which key (its place in circle order) sits at which spot (0 = top, clockwise) */
export interface CircleRound {
  ring: CircleRing;
  anchorSpot: number;
  anchorKey: number;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;
/** The key (its place in circle order) that belongs at a spot */
export const keyAt = (r: CircleRound, spot: number) => mod12(r.anchorKey + spot - r.anchorSpot);
/** The spot a key (its place in circle order) belongs at */
export const spotOf = (r: CircleRound, key: number) => mod12(r.anchorSpot + key - r.anchorKey);
/** How many fifths a spot is from the round's given key: + clockwise (sharps), − anticlockwise, −5 to 6 */
export const fifthsFromAnchor = (r: CircleRound, spot: number) => {
  const d = mod12(spot - r.anchorSpot);
  return d > 6 ? d - 12 : d;
};

export interface CirclePrompt {
  round: CircleRound;
  /** where: the key is named, the player finds its spot; which: the spot is marked, the player names its key */
  ask: "where" | "which";
  /** The spot asked about (for where, the answer) */
  spot: number;
  /** For which: the keys to answer from (places in circle order), shuffled for this prompt */
  choices: readonly number[];
}

export const newCircleRound = (rng: Rng, ring: CircleRing): CircleRound => ({
  ring,
  anchorSpot: randomInt(rng, 12),
  anchorKey: randomInt(rng, 12),
});

/** The next prompt: a spot not yet filled in this round (or, with all filled, a new round) */
export function makeCirclePrompt(
  rng: Rng,
  o: CircleQuizOptions,
  round: CircleRound,
  filled: readonly number[],
): CirclePrompt {
  const fresh = filled.length >= 12 || round.ring !== o.ring;
  const r = fresh ? newCircleRound(rng, o.ring) : round;
  const open = Array.from({ length: 12 }, (_, s) => s).filter(
    s => s !== r.anchorSpot && (fresh || !filled.includes(s)),
  );
  const ask = o.asks === "mixed" ? pick(rng, ["where", "which"] as const) : o.asks;
  return {
    round: r,
    ask,
    spot: pick(rng, open),
    choices: shuffled(
      rng,
      Array.from({ length: 12 }, (_, k) => k),
    ),
  };
}

export interface CircleQuizState extends Judged<CirclePrompt> {
  /** Spots filled in this round: the given key's, then each answered (or skipped) one, in order */
  filled: number[];
  /** Spots filled by a skip: shown, but not found */
  revealed: number[];
  /** Wrong answers to this prompt, in order: spots (where) or keys (which, as places in circle order) */
  tried: number[];
}

export type CircleQuizAction =
  | { type: "spot"; spot: number }
  | { type: "key"; key: number }
  /** A note played: the key whose tonic it is */
  | { type: "play"; note: number }
  | { type: "next"; prompt: CirclePrompt }
  | { type: "skip"; prompt: CirclePrompt };

export const initialCircleQuiz = (prompt: CirclePrompt): CircleQuizState => ({
  prompt,
  status: "waiting",
  missed: false,
  answered: 0,
  firstTry: 0,
  filled: [prompt.round.anchorSpot],
  revealed: [],
  tried: [],
});

/** The key whose tonic is this note, as a place in circle order */
const keyOfNote = (ring: CircleRing, note: number) => ringKeys(ring).findIndex(k => chromaOf(k) === mod12(note));

export function reduceCircleQuiz(s: CircleQuizState, a: CircleQuizAction): CircleQuizState {
  if (a.type === "next" || a.type === "skip") {
    // A skip fills the spot in as shown, not found (unless it was already answered)
    const skipped = a.type === "skip" && s.status !== "correct";
    const filled = skipped ? [...s.filled, s.prompt.spot] : s.filled;
    const revealed = skipped ? [...s.revealed, s.prompt.spot] : s.revealed;
    const fresh = a.prompt.round !== s.prompt.round;
    return {
      ...s,
      prompt: a.prompt,
      status: "waiting",
      missed: false,
      answered: skipped ? s.answered + 1 : s.answered,
      filled: fresh ? [a.prompt.round.anchorSpot] : filled,
      revealed: fresh ? [] : revealed,
      tried: [],
    };
  }
  if (s.status === "correct") return s;
  const p = s.prompt;
  const right = keyAt(p.round, p.spot);
  let answer: number;
  if (p.ask === "where") {
    if (a.type !== "spot") return s;
    if (s.filled.includes(a.spot)) return s; // a spot already filled in isn't an answer
    answer = a.spot;
    if (answer === p.spot) return answeredRight(s, { filled: [...s.filled, p.spot] });
  } else {
    if (a.type === "spot") return s;
    answer = a.type === "key" ? a.key : keyOfNote(p.round.ring, a.note);
    if (answer === right) return answeredRight(s, { filled: [...s.filled, p.spot] });
  }
  if (s.tried.includes(answer)) return s;
  return answeredWrong(s, { tried: [...s.tried, answer] });
}

/** Whether the round is complete: every spot filled */
export const roundDone = (s: CircleQuizState) => s.filled.length >= 12;
