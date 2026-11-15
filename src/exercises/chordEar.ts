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
  /** Climb the ladder (CHORD_EAR_LADDER): its level sets the types and inversions, and `types`/`inversions` above
   *  wait, kept, for free choice */
  ladder: boolean;
  /** The ladder level being played (0-based); the mode keeps it to the levels unlocked */
  level: number;
}

export const DEFAULT_CHORD_EAR: ChordEarOptions = {
  types: ["M", "m"],
  inversions: false,
  broken: false,
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

/** A chord to play: one of the allowed types on a random root, never the same chord (root and type) twice running. */
export function makeChordEarPrompt(rng: Rng, o: ChordEarOptions, previous?: ChordEarPrompt): ChordEarPrompt {
  for (;;) {
    const type = pick(rng, o.types);
    const rootPc = randomInt(rng, 12);
    if (previous && previous.type === type && previous.rootPc === rootPc) continue;
    const inversion = o.inversions ? randomInt(rng, chordSemitones(type).length) : 0;
    const notes = voiceChord(LOWEST_ROOT + rootPc, type, inversion);
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
