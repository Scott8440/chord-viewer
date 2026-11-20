// Theory quiz, key relationships on the circle of fifths: each question stands alone, on a circle of both rings (major
// keys outside, their relative minors inside) turned to a random angle, so it's worked out from the key shown rather
// than from C at the top. Clockwise is a fifth up, as always. Four kinds of question:
// - degree: one key shown; play the tonic of its dominant, subdominant, relative, or another diatonic key
// - related: one key shown; play the tonics of its five closely related keys (its relative shares all seven of its
//   notes, the other four six)
// Those two are answered by playing only: on the circle they sit right next to the key shown, so picking them
// there would only test where they're drawn, not knowing their names.
// - signature: a key signature on a staff, C major shown on the circle; pick the key (major or minor, as asked)
// - chain: a chain of dominants resolving by fifths (E7 A7 D7 G7 C): name each chord between the first and the tonic
// Signatures are answered on the circle and chains from a board of chords, or either by playing the tonic or root.
// Pure.
import { CIRCLE_OF_FIFTHS_MAJOR, CIRCLE_OF_FIFTHS_MINOR, chromaOf } from "../theory";
import { answeredRight, answeredWrong, type Judged } from "./judging";
import { pick, randomInt, shuffled, type Rng } from "./random";

export type CircleKind = "degree" | "related" | "signature" | "chain";
export const CIRCLE_KINDS: readonly CircleKind[] = ["degree", "related", "signature", "chain"];
/** Which questions: all kinds at random, or one */
export type CircleAsks = "mixed" | CircleKind;
export const CIRCLE_ASKS: readonly CircleAsks[] = ["mixed", ...CIRCLE_KINDS];

export interface CircleQuizOptions {
  asks: CircleAsks;
}
export const DEFAULT_CIRCLE_QUIZ: CircleQuizOptions = { asks: "mixed" };

export function sanitizeCircleQuizOptions(raw: unknown): CircleQuizOptions {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { asks: CIRCLE_ASKS.includes(o.asks as CircleAsks) ? (o.asks as CircleAsks) : DEFAULT_CIRCLE_QUIZ.asks };
}

export type CircleRing = "major" | "minor";
/** The twelve keys of a ring in circle order (C or A first), spelled as the app's circle spells them */
export const ringKeys = (ring: CircleRing): readonly string[] =>
  ring === "minor" ? CIRCLE_OF_FIFTHS_MINOR : CIRCLE_OF_FIFTHS_MAJOR;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** A key on the circle: its ring, and its place in circle order (the minor at k is the relative of the major at k) */
export interface Place {
  ring: CircleRing;
  key: number;
}
export const placeId = (p: Place) => `${p.ring}:${p.key}`;
export const samePlace = (a: Place, b: Place) => a.ring === b.ring && a.key === b.key;
/** Where a key is drawn: its slot (0 = top, clockwise) once the circle is turned by `rotation` */
export const slotOf = (key: number, rotation: number) => mod12(key + rotation);
/** The key drawn at a slot */
export const keyAtSlot = (slot: number, rotation: number) => mod12(slot - rotation);

/** A key's diatonic neighbours on the circle, by Roman numeral: for a major key its V, IV, vi, ii and iii; for a minor
 *  key its v, iv, III, VI and VII (natural minor) */
export type DegreeId = "V" | "IV" | "vi" | "ii" | "iii" | "v" | "iv" | "III" | "VI" | "VII";
export const DEGREES: Readonly<
  Record<CircleRing, readonly { id: DegreeId; name: string; at: (k: number) => Place }[]>
> = {
  major: [
    { id: "V", name: "dominant (V)", at: k => ({ ring: "major", key: mod12(k + 1) }) },
    { id: "IV", name: "subdominant (IV)", at: k => ({ ring: "major", key: mod12(k - 1) }) },
    { id: "vi", name: "relative minor (vi)", at: k => ({ ring: "minor", key: k }) },
    { id: "ii", name: "ii", at: k => ({ ring: "minor", key: mod12(k - 1) }) },
    { id: "iii", name: "iii", at: k => ({ ring: "minor", key: mod12(k + 1) }) },
  ],
  minor: [
    { id: "v", name: "dominant (v)", at: k => ({ ring: "minor", key: mod12(k + 1) }) },
    { id: "iv", name: "subdominant (iv)", at: k => ({ ring: "minor", key: mod12(k - 1) }) },
    { id: "III", name: "relative major (III)", at: k => ({ ring: "major", key: k }) },
    { id: "VI", name: "VI", at: k => ({ ring: "major", key: mod12(k - 1) }) },
    { id: "VII", name: "VII", at: k => ({ ring: "major", key: mod12(k + 1) }) },
  ],
};
/** The degree's place for a key */
export const degreePlace = (ref: Place, id: DegreeId): Place => DEGREES[ref.ring].find(d => d.id === id)!.at(ref.key);

export type CirclePrompt =
  | { kind: "degree"; rotation: number; ref: Place; degree: DegreeId }
  | { kind: "related"; rotation: number; ref: Place }
  | { kind: "signature"; rotation: number; answer: Place }
  /** `chords`: the chain's roots in order (places in circle order, each a fifth below the one before), the last the
   *  tonic; `choices`: the twelve dominant sevenths to answer from, shuffled */
  | { kind: "chain"; rotation: number; chords: readonly number[]; choices: readonly number[] };

/** Whether a kind is answered only by playing: its answers are next to the key shown, so picking them proves nothing */
export const playOnly = (kind: CircleKind) => kind === "degree" || kind === "related";

/** What the player has to find: the places, in order (one for degree and signature, five for related, the chords
 *  between the first and the tonic for chain) */
export function answersOf(p: CirclePrompt): Place[] {
  switch (p.kind) {
    case "degree":
      return [degreePlace(p.ref, p.degree)];
    case "related":
      return DEGREES[p.ref.ring].map(d => d.at(p.ref.key));
    case "signature":
      return [p.answer];
    case "chain":
      return p.chords.slice(1, -1).map(key => ({ ring: "major" as const, key }));
  }
}

/** The next question: the kind chosen (any, for mixed); not the same key or chain as the one before */
export function makeCirclePrompt(rng: Rng, o: CircleQuizOptions, previous?: CirclePrompt): CirclePrompt {
  const kind = o.asks === "mixed" ? pick(rng, CIRCLE_KINDS) : o.asks;
  const rotation = randomInt(rng, 12);
  const place = (): Place => ({ ring: pick(rng, ["major", "minor"] as const), key: randomInt(rng, 12) });
  const before = previous ? answersOf(previous).concat("ref" in previous ? [previous.ref] : []) : [];
  const fresh = (p: Place) => !before.some(b => samePlace(b, p));
  let ref = place();
  for (let i = 0; i < 20 && !fresh(ref); i++) ref = place();
  switch (kind) {
    case "degree":
      return { kind, rotation, ref, degree: pick(rng, DEGREES[ref.ring]).id };
    case "related":
      return { kind, rotation, ref };
    case "signature":
      return { kind, rotation, answer: ref };
    case "chain": {
      // Three to five chords before the tonic, ending on a major tonic
      const length = 4 + randomInt(rng, 3);
      const tonic = ref.key;
      const chords = Array.from({ length }, (_, i) => mod12(tonic + length - 1 - i));
      return {
        kind,
        rotation,
        chords,
        choices: shuffled(
          rng,
          Array.from({ length: 12 }, (_, k) => k),
        ),
      };
    }
  }
}

export interface CircleQuizState extends Judged<CirclePrompt> {
  /** Answers found so far for this question (place ids) */
  found: string[];
  /** Wrong answers to this question, in order (place ids) */
  tried: string[];
}

export type CircleQuizAction =
  | { type: "place"; place: Place }
  /** A chord on the board (chain): its root, as a place in circle order */
  | { type: "chord"; key: number }
  /** A note played: the tonic (or chord root) it is */
  | { type: "play"; note: number }
  | { type: "next"; prompt: CirclePrompt }
  | { type: "skip"; prompt: CirclePrompt };

export const initialCircleQuiz = (prompt: CirclePrompt): CircleQuizState => ({
  prompt,
  status: "waiting",
  missed: false,
  answered: 0,
  firstTry: 0,
  found: [],
  tried: [],
});

/** The place a played note names: among the answers still to find, the one whose tonic it is */
function placeOfNote(s: CircleQuizState, note: number): Place {
  const pc = mod12(note);
  const open = answersOf(s.prompt).filter(p => !s.found.includes(placeId(p)));
  const hit = open.find(p => chromaOf(ringKeys(p.ring)[p.key]) === pc);
  if (hit) return hit;
  // Not an answer: the major key with that tonic, so it counts as a wrong answer once
  const key = ringKeys("major").findIndex(k => chromaOf(k) === pc);
  return { ring: "major", key };
}

export function reduceCircleQuiz(s: CircleQuizState, a: CircleQuizAction): CircleQuizState {
  if (a.type === "next" || a.type === "skip") {
    const skipped = a.type === "skip" && s.status !== "correct";
    return {
      ...s,
      prompt: a.prompt,
      status: "waiting",
      missed: false,
      answered: skipped ? s.answered + 1 : s.answered,
      found: [],
      tried: [],
    };
  }
  if (s.status === "correct") return s;
  const p = s.prompt;
  const answers = answersOf(p);
  let place: Place;
  if (p.kind === "chain") {
    if (a.type === "place") return s; // a chain is named from the board
    place = a.type === "chord" ? { ring: "major", key: a.key } : placeOfNote(s, a.note);
    // In order: the chord after the last one named
    const next = answers[s.found.length];
    if (samePlace(place, next)) {
      // Wrong guesses are for this chord: one tried too early may be the next one
      const found = [...s.found, placeId(next)];
      return found.length === answers.length
        ? answeredRight(s, { found, tried: [] })
        : { ...s, found, tried: [], status: "waiting" };
    }
  } else {
    if (a.type === "chord") return s;
    if (a.type === "place" && playOnly(p.kind)) return s;
    place = a.type === "place" ? a.place : placeOfNote(s, a.note);
    if (p.kind !== "signature" && samePlace(place, p.ref)) return s; // the key shown isn't an answer
    const id = placeId(place);
    if (s.found.includes(id)) return s;
    if (answers.some(x => samePlace(x, place))) {
      const found = [...s.found, id];
      return found.length === answers.length ? answeredRight(s, { found }) : { ...s, found, status: "waiting" };
    }
  }
  const id = placeId(place);
  if (s.tried.includes(id)) return s;
  return answeredWrong(s, { tried: [...s.tried, id] });
}
