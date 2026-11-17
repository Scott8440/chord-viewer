// Ear training, progressions: the app sets up a key with a cadence, plays a few chords, and the player names each in
// order by its Roman numeral. Levels on a ladder add numerals from I, IV and V up to borrowed chords and minor keys.
// Half the progressions are the loops pop songs use (I–V–vi–IV …), the rest random, so a loop can't be recognised by
// its shape alone. Chords are voiced as a pianist would play them: a bass note low down, the chord above moving to
// the nearest inversion each time. Pure data and functions; the mode (src/modes/earProgressions.ts) plays it.
import { Note } from "tonal";
import { chordSemitones } from "../theory";
import { prettyAcc } from "../theory/spelling";
import { answeredRight, answeredWrong, movedOn, type Judged, type MoveOn } from "./judging";
import type { Ladder } from "./ladders";
import { pick, randomInt, type Rng } from "./random";

export type KeyMode = "major" | "minor";
/** A chord quality as a chord template id */
type Quality = "M" | "m" | "dim";

export interface Numeral {
  /** Kept in options and records: "I", "bVII", "vii0" */
  id: string;
  /** As shown: "I", "♭VII", "vii°" */
  label: string;
  /** Its root above the tonic (tonal's interval: "6m" is a minor sixth, ♭VI's root) */
  interval: string;
  quality: Quality;
}

const numeral = (id: string, label: string, interval: string, quality: Quality): Numeral => ({
  id,
  label,
  interval,
  quality,
});

/** Every numeral the drill knows: a major key's own chords, borrowed ones, and a minor key's */
export const NUMERALS: Readonly<Record<string, Numeral>> = Object.fromEntries(
  [
    // Major keys
    numeral("I", "I", "1P", "M"),
    numeral("ii", "ii", "2M", "m"),
    numeral("iii", "iii", "3M", "m"),
    numeral("IV", "IV", "4P", "M"),
    numeral("V", "V", "5P", "M"),
    numeral("vi", "vi", "6M", "m"),
    numeral("vii0", "vii°", "7M", "dim"),
    // Borrowed from the parallel minor
    numeral("bVII", "♭VII", "7m", "M"),
    numeral("iv", "iv", "4P", "m"),
    numeral("bVI", "♭VI", "6m", "M"),
    numeral("bIII", "♭III", "3m", "M"),
    // Minor keys (iv and V as above)
    numeral("i", "i", "1P", "m"),
    numeral("ii0", "ii°", "2M", "dim"),
    numeral("III", "III", "3m", "M"),
    numeral("v", "v", "5P", "m"),
    numeral("VI", "VI", "6m", "M"),
    numeral("VII", "VII", "7m", "M"),
  ].map(n => [n.id, n]),
);

export const numeralLabel = (id: string) => NUMERALS[id]?.label ?? id;

export interface ProgressionEarLevel {
  mode: KeyMode;
  /** The numerals on offer, in the order of the answer buttons */
  numerals: readonly string[];
}

const MAJOR_DIATONIC = ["I", "ii", "iii", "IV", "V", "vi"];

/** From I, IV and V up to borrowed chords, then minor keys */
export const PROGRESSION_EAR_LADDER: Ladder<ProgressionEarLevel> = {
  id: "progressionEar.1",
  levels: [
    { name: "I, IV and V", options: { mode: "major", numerals: ["I", "IV", "V"] } },
    { name: "Add vi", options: { mode: "major", numerals: ["I", "IV", "V", "vi"] } },
    { name: "Add ii", options: { mode: "major", numerals: ["I", "ii", "IV", "V", "vi"] } },
    { name: "Add iii", options: { mode: "major", numerals: MAJOR_DIATONIC } },
    { name: "Borrowed ♭VII", options: { mode: "major", numerals: [...MAJOR_DIATONIC, "bVII"] } },
    { name: "Borrowed iv and ♭VI", options: { mode: "major", numerals: [...MAJOR_DIATONIC, "iv", "bVI", "bVII"] } },
    { name: "Minor keys: i, iv, v, VI and VII", options: { mode: "minor", numerals: ["i", "iv", "v", "VI", "VII"] } },
    {
      name: "Minor keys: add III and V",
      options: { mode: "minor", numerals: ["i", "III", "iv", "v", "V", "VI", "VII"] },
    },
  ],
};

/** Loops common in pop songs, four chords each (a longer progression repeats the loop) */
export const COMMON_LOOPS: readonly { mode: KeyMode; numerals: readonly string[] }[] = [
  { mode: "major", numerals: ["I", "V", "vi", "IV"] },
  { mode: "major", numerals: ["vi", "IV", "I", "V"] },
  { mode: "major", numerals: ["I", "vi", "IV", "V"] },
  { mode: "major", numerals: ["I", "IV", "vi", "V"] },
  { mode: "major", numerals: ["I", "IV", "V", "IV"] },
  { mode: "major", numerals: ["I", "V", "IV", "V"] },
  { mode: "major", numerals: ["IV", "I", "V", "vi"] },
  { mode: "major", numerals: ["ii", "V", "I", "vi"] },
  { mode: "major", numerals: ["I", "iii", "IV", "V"] },
  { mode: "major", numerals: ["I", "bVII", "IV", "I"] },
  { mode: "major", numerals: ["I", "IV", "iv", "I"] },
  { mode: "major", numerals: ["I", "bVI", "bVII", "I"] },
  { mode: "minor", numerals: ["i", "VI", "III", "VII"] },
  { mode: "minor", numerals: ["i", "iv", "v", "i"] },
  { mode: "minor", numerals: ["i", "VII", "VI", "VII"] },
  { mode: "minor", numerals: ["i", "VI", "VII", "i"] },
  { mode: "minor", numerals: ["i", "iv", "V", "i"] },
];

/** The cadence that sets up the key before each progression */
const CADENCE: Readonly<Record<KeyMode, readonly string[]>> = {
  major: ["I", "IV", "V", "I"],
  minor: ["i", "iv", "V", "i"],
};

/** How many chords a progression has */
export const PROGRESSION_LENGTHS: readonly number[] = [3, 4, 5, 6, 8];

/** A tonic per pitch class, spelled as keys usually are (D♭ major, C♯ minor) */
const MAJOR_TONICS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
export const tonicName = (pc: number, mode: KeyMode) => (mode === "major" ? MAJOR_TONICS : MINOR_TONICS)[pc];

export interface ProgressionEarOptions {
  /** "random" (a new key every PROMPTS_PER_KEY progressions), or a tonic's pitch class, "0" to "11" */
  tonic: string;
  /** Chords per progression (PROGRESSION_LENGTHS) */
  length: number;
  /** The ladder level (0-based); the mode keeps it to the levels unlocked */
  level: number;
}

export const DEFAULT_PROGRESSION_EAR: ProgressionEarOptions = { tonic: "random", length: 4, level: 0 };

export const TONIC_CHOICES: readonly string[] = ["random", ...Array.from({ length: 12 }, (_, i) => String(i))];

export function sanitizeProgressionEarOptions(raw: unknown): ProgressionEarOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const level = typeof o.level === "number" && Number.isInteger(o.level) ? o.level : 0;
  return {
    tonic: typeof o.tonic === "string" && TONIC_CHOICES.includes(o.tonic) ? o.tonic : DEFAULT_PROGRESSION_EAR.tonic,
    length:
      typeof o.length === "number" && PROGRESSION_LENGTHS.includes(o.length)
        ? o.length
        : DEFAULT_PROGRESSION_EAR.length,
    level: Math.min(Math.max(level, 0), PROGRESSION_EAR_LADDER.levels.length - 1),
  };
}

export const levelOf = (o: ProgressionEarOptions): ProgressionEarLevel =>
  (PROGRESSION_EAR_LADDER.levels[o.level] ?? PROGRESSION_EAR_LADDER.levels[0]).options;

export interface ProgressionChord {
  numeral: string;
  /** Spelled in the key: "Am", "B♭", "F♯dim" */
  name: string;
  /** Low to high: the bass, then the right hand */
  notes: number[];
}

export interface ProgressionEarPrompt {
  mode: KeyMode;
  tonicPc: number;
  /** "C", "F#" (unspelled accidentals; show with prettyAcc) */
  tonic: string;
  /** The key, for the key rotation: "C:major" */
  keyValue: string;
  cadence: ProgressionChord[];
  chords: ProgressionChord[];
}

/** The bass note: the chord's root, from E2 to D♯3 */
const BASS_LOW = 40;
/** The right hand keeps its lowest note between G3 and F♯4 */
const UPPER_LOW = 55;

/** The right-hand voicings of a triad: each inversion, its lowest note in the right hand's range */
function upperVoicings(pcs: readonly number[]): number[][] {
  return pcs.map((_, start) => {
    const order = [...pcs.slice(start), ...pcs.slice(0, start)];
    const notes: number[] = [];
    for (const pc of order) {
      const from = notes.length ? notes[notes.length - 1] + 1 : UPPER_LOW;
      notes.push(from + ((pc - from + 120) % 12));
    }
    return notes;
  });
}

/** How far the hand moves from one voicing to another: the notes' distances added up */
const movement = (a: readonly number[], b: readonly number[]) => a.reduce((n, x, i) => n + Math.abs(x - b[i]), 0);

/**
 * Chords voiced in turn: each a bass note (the root, low down) and a triad above, the first in a random inversion and
 * each after it in the inversion nearest the one before (smooth voice leading, as a pianist plays a progression).
 */
export function voiceLead(rng: Rng, roots: readonly { pc: number; quality: Quality }[], from?: number[]): number[][] {
  let previous = from;
  return roots.map(r => {
    const pcs = chordSemitones(r.quality).map(s => (r.pc + s) % 12);
    const options = upperVoicings(pcs);
    const upper = previous
      ? options.reduce((best, v) => (movement(v, previous!) < movement(best, previous!) ? v : best))
      : options[randomInt(rng, options.length)];
    previous = upper;
    return [BASS_LOW + ((r.pc - BASS_LOW + 120) % 12), ...upper];
  });
}

/** A numeral as a chord in a key: its root and name */
function chordOf(id: string, tonic: string, tonicPc: number): { pc: number; quality: Quality; name: string } {
  const n = NUMERALS[id];
  const root = Note.pitchClass(Note.transpose(tonic, n.interval));
  const pc = (tonicPc + (Note.chroma(root) - Note.chroma(tonic) + 12)) % 12;
  return { pc, quality: n.quality, name: prettyAcc(root) + (n.quality === "M" ? "" : n.quality) };
}

/** Numerals for a progression: half the time a common loop that fits the level, otherwise random */
export function pickNumerals(rng: Rng, level: ProgressionEarLevel, length: number): string[] {
  const allowed = level.numerals;
  const loops = COMMON_LOOPS.filter(l => l.mode === level.mode && l.numerals.every(n => allowed.includes(n)));
  if (loops.length && rng() < 0.5) {
    const loop = pick(rng, loops).numerals;
    return Array.from({ length }, (_, i) => loop[i % loop.length]);
  }
  // Random: usually starting on the tonic, never the same chord twice running
  const tonic = level.mode === "major" ? "I" : "i";
  const out = [rng() < 0.6 ? tonic : pick(rng, allowed)];
  while (out.length < length) {
    const options = allowed.filter(n => n !== out[out.length - 1]);
    out.push(pick(rng, options));
  }
  return out;
}

/** A progression to name, in the given key (tonic pitch class), never the same numerals twice running */
export function makeProgressionEarPrompt(
  rng: Rng,
  o: ProgressionEarOptions,
  tonicPc: number,
  previous?: ProgressionEarPrompt,
): ProgressionEarPrompt {
  const level = levelOf(o);
  const tonic = tonicName(tonicPc, level.mode);
  let numerals = pickNumerals(rng, level, o.length);
  for (let tries = 0; previous && numerals.join() === previous.chords.map(c => c.numeral).join() && tries < 20; tries++)
    numerals = pickNumerals(rng, level, o.length);
  const cadenceChords = CADENCE[level.mode].map(id => ({ id, ...chordOf(id, tonic, tonicPc) }));
  const chords = numerals.map(id => ({ id, ...chordOf(id, tonic, tonicPc) }));
  const cadenceNotes = voiceLead(rng, cadenceChords);
  // The progression carries on from the cadence's last chord, as one hand would
  const chordNotes = voiceLead(rng, chords, cadenceNotes[cadenceNotes.length - 1].slice(1));
  return {
    mode: level.mode,
    tonicPc,
    tonic,
    keyValue: `${tonic}:${level.mode}`,
    cadence: cadenceChords.map((c, i) => ({ numeral: c.id, name: c.name, notes: cadenceNotes[i] })),
    chords: chords.map((c, i) => ({ numeral: c.id, name: c.name, notes: chordNotes[i] })),
  };
}

export interface ProgressionEarState extends Judged<ProgressionEarPrompt> {
  /** How many chords have been named so far */
  index: number;
  /** Wrong answers for the chord being named, so their buttons can show it */
  wrong: string[];
  /** Every wrong answer this progression, as "played>answered" ("vi>IV"), for the Progress page's mix-ups */
  guesses: string[];
}

export type ProgressionEarAction = { type: "answer"; numeral: string } | MoveOn<ProgressionEarPrompt>;

export const initialProgressionEar = (prompt: ProgressionEarPrompt): ProgressionEarState => ({
  prompt,
  status: "waiting",
  index: 0,
  wrong: [],
  guesses: [],
  missed: false,
  answered: 0,
  firstTry: 0,
});

/** Chord by chord: a right answer moves to the next chord (the last one answers the progression), a wrong one waits */
export function reduceProgressionEar(s: ProgressionEarState, a: ProgressionEarAction): ProgressionEarState {
  if (a.type !== "answer") return movedOn(s, a, { index: 0, wrong: [], guesses: [] });
  if (s.status === "correct" || s.wrong.includes(a.numeral)) return s;
  const played = s.prompt.chords[s.index].numeral;
  if (a.numeral !== played)
    return answeredWrong(s, { wrong: [...s.wrong, a.numeral], guesses: [...s.guesses, `${played}>${a.numeral}`] });
  const index = s.index + 1;
  if (index < s.prompt.chords.length) return { ...s, index, status: "waiting", wrong: [] };
  return answeredRight(s, { index, wrong: [] });
}

/** "I–V–vi–IV" */
export const numeralsText = (p: ProgressionEarPrompt) => p.chords.map(c => numeralLabel(c.numeral)).join("–");
/** "C–G–Am–F" */
export const chordsText = (p: ProgressionEarPrompt) => p.chords.map(c => c.name).join("–");
