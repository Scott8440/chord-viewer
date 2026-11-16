// Ear training, chord qualities: the app plays a chord and the player says which kind it is (major, minor, dominant
// seventh …) from the types they've chosen. Pure data and functions; the mode (src/modes/earChords.ts) plays it.
import { chordSemitones, ROOT_MAJOR, ROOT_MINOR, templateById } from "../theory";
import { CHORD_PRACTICE_GROUPS, CHORD_PRACTICE_TYPES } from "./chordPractice";
import { answeredRight, answeredWrong, movedOn, type Judged, type MoveOn } from "./judging";
import { CHORD_EAR_LADDER } from "./ladders";
import { pick, randomInt, type Rng } from "./random";

export interface ChordEarOptions {
  /** Chord template ids it may play (from the chord practice groups); at least two, so there is a choice */
  types: readonly string[];
  /** Root position only, or any inversion (the bass is then any chord tone) */
  inversions: boolean;
  /** Play the notes one by one, low to high, before the chord together */
  broken: boolean;
  /** How it sounds: "simple", the app's own tone in close position; "piano", a sampled piano with a bass note below
   *  and the upper notes spread and in a different order each time, nearer to a chord in a song */
  sound: ChordEarSound;
  /** Climb the ladder (CHORD_EAR_LADDER): its level sets the types and inversions, and `types`/`inversions` above
   *  wait, kept, for free choice */
  ladder: boolean;
  /** The ladder level being played (0-based); the mode keeps it to the levels unlocked */
  level: number;
}

export type ChordEarSound = "simple" | "piano";

export const DEFAULT_CHORD_EAR: ChordEarOptions = {
  types: ["M", "m"],
  inversions: false,
  broken: false,
  sound: "simple",
  ladder: true,
  level: 0,
};

/** What's played: on the ladder, its level's types and inversions; otherwise the player's own choice */
export function playedChordEar(o: ChordEarOptions): ChordEarOptions {
  if (!o.ladder) return o;
  const level = CHORD_EAR_LADDER.levels[o.level] ?? CHORD_EAR_LADDER.levels[0];
  return { ...o, types: level.options.types, inversions: level.options.inversions };
}

/** The ladder and level a round counts for: none for free choice, nor when the notes are played one by one first
 *  (a help, so it doesn't count towards unlocking) */
export const chordEarLadderTag = (o: ChordEarOptions): { id: string; level: number } | null =>
  o.ladder && !o.broken ? { id: CHORD_EAR_LADDER.id, level: o.level } : null;

export function sanitizeChordEarOptions(raw: unknown): ChordEarOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const types = Array.isArray(o.types) ? CHORD_PRACTICE_TYPES.filter(id => (o.types as unknown[]).includes(id)) : [];
  const level = typeof o.level === "number" && Number.isInteger(o.level) ? o.level : 0;
  return {
    types: types.length >= 2 ? types : [...DEFAULT_CHORD_EAR.types],
    inversions: o.inversions === true,
    broken: o.broken === true,
    sound: o.sound === "piano" ? "piano" : "simple",
    // Options saved before the ladder existed start on it (the old types are kept for free choice)
    ladder: o.ladder !== false,
    level: Math.min(Math.max(level, 0), CHORD_EAR_LADDER.levels.length - 1),
  };
}

/** Roots are picked from C3 up to B3, so chords sit in the piano's warm middle */
const LOWEST_ROOT = 48;

export interface ChordEarPrompt {
  rootPc: number;
  /** Spelled root, for showing the answer ("D♭ minor") */
  root: string;
  type: string;
  /** 0 root position, 1 first inversion … */
  inversion: number;
  /** The notes played, MIDI, low to high */
  notes: number[];
}

/** The chord's notes: close position above the root, with the lowest `inversion` tones moved up an octave */
export function voiceChord(rootMidi: number, type: string, inversion: number): number[] {
  const tones = chordSemitones(type).map(s => rootMidi + s);
  return [...tones.slice(inversion), ...tones.slice(0, inversion).map(t => t + 12)];
}

/**
 * Chords whose inversions are other chords, so they're always played in root position: Csus4 over F is F–C–G, which
 * is Fsus2, and C6 over A is Am7. Asked as an inversion, the honest answer would be marked wrong.
 */
const ROOT_POSITION_ONLY = new Set(["sus2", "sus4", "6", "m6"]);

/** Inversions that are another chord type: Cm7 over E♭ (its first inversion) has the notes of E♭6, and Cm7♭5 over
 *  E♭ those of E♭m6. Only a problem when that other type is also an answer. */
const SAME_AS_INVERTED: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  m7: { 1: "6" },
  m7b5: { 1: "m6" },
};

/** The bass note's range for a spread voicing: E2 to D♯3 */
const SPREAD_BASS_LOW = 40;
/** The upper notes start between G3 and F♯4 */
const SPREAD_UPPER_LOW = 55;

/**
 * A chord voiced the way a pianist might play it in a song: the bass note (the root, or the inversion's chord tone)
 * alone in the left hand, low down, and every chord tone above it in the right hand, starting from a random one, in
 * close position or, half the time, opened up by dropping the second-highest note an octave.
 */
export function spreadVoicing(rng: Rng, rootPc: number, type: string, inversion: number): number[] {
  const pcs = chordSemitones(type).map(s => (rootPc + s) % 12);
  const bass = SPREAD_BASS_LOW + ((pcs[inversion] - SPREAD_BASS_LOW + 120) % 12);
  const start = randomInt(rng, pcs.length);
  const order = [...pcs.slice(start), ...pcs.slice(0, start)];
  const upper: number[] = [];
  for (const pc of order) {
    // The next note up with this pitch class (the first from the bottom of the range)
    const from = upper.length ? upper[upper.length - 1] + 1 : SPREAD_UPPER_LOW;
    upper.push(from + ((pc - from + 120) % 12));
  }
  if (upper.length >= 3 && rng() < 0.5) {
    const i = upper.length - 2;
    if (upper[i] - 12 > bass + 2) upper[i] -= 12;
  }
  return [bass, ...upper].sort((a, b) => a - b);
}

/** A chord to play: one of the allowed types on a random root, never the same chord (root and type) twice running. */
export function makeChordEarPrompt(rng: Rng, o: ChordEarOptions, previous?: ChordEarPrompt): ChordEarPrompt {
  for (;;) {
    const type = pick(rng, o.types);
    const rootPc = randomInt(rng, 12);
    if (previous && previous.type === type && previous.rootPc === rootPc) continue;
    const inversion = o.inversions && !ROOT_POSITION_ONLY.has(type) ? randomInt(rng, chordSemitones(type).length) : 0;
    // An inversion that's another chord on offer (Cm7 over E♭ is E♭6) would make the honest answer wrong
    const twin = SAME_AS_INVERTED[type]?.[inversion];
    if (twin && o.types.includes(twin)) continue;
    // With the piano, voiced as in a song; otherwise in close position (the rng is only used for that when it is)
    const notes =
      o.sound === "piano"
        ? spreadVoicing(rng, rootPc, type, inversion)
        : voiceChord(LOWEST_ROOT + rootPc, type, inversion);
    // Spelled as chord names usually are: minor-family chords on C♯ and G♯, others on D♭ and A♭
    const root = (templateById(type)?.minor ? ROOT_MINOR : ROOT_MAJOR)[rootPc];
    return { rootPc, root, type, inversion, notes };
  }
}

/** What the answer buttons say: "Major", "Dominant seventh" (with the symbol for sevenths and beyond) */
export function qualityLabel(type: string): string {
  const t = templateById(type);
  if (!t) return type;
  const name = t.name.charAt(0).toUpperCase() + t.name.slice(1);
  return t.symbol && !["m", "dim", "aug", "sus2", "sus4"].includes(t.symbol) ? `${name} (${t.symbol})` : name;
}

/** The allowed types in the filter's order: the order the answer buttons come in (and their number keys) */
export const answerOrder = (types: readonly string[]): string[] =>
  CHORD_PRACTICE_GROUPS.flatMap(g => g.types.map(t => t.id)).filter(id => types.includes(id));

export interface ChordEarState extends Judged<ChordEarPrompt> {
  /** Wrong answers given for this chord, so their buttons can show it */
  wrong: string[];
}

export type ChordEarAction = { type: "answer"; quality: string } | MoveOn<ChordEarPrompt>;

export const initialChordEar = (prompt: ChordEarPrompt): ChordEarState => ({
  prompt,
  status: "waiting",
  wrong: [],
  missed: false,
  answered: 0,
  firstTry: 0,
});

export function reduceChordEar(s: ChordEarState, a: ChordEarAction): ChordEarState {
  if (a.type !== "answer") return movedOn(s, a, { wrong: [] });
  if (s.status === "correct" || s.wrong.includes(a.quality)) return s;
  return a.quality === s.prompt.type ? answeredRight(s) : answeredWrong(s, { wrong: [...s.wrong, a.quality] });
}
