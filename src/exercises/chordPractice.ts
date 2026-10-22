// Chord practice: the app names a chord, the player plays it in any voicing, inversion or octave.
// Pure data and functions; the mode in src/modes/chordPractice.ts drives it.
import {
  buildKey, chromaOf, KEY_MAJORS, KEY_MINORS, matchTemplate, ROOT_MAJOR, ROOT_MINOR, templateById,
  type KeyContext, type TemplateTone,
} from "../theory";
import type { Rng } from "./notePractice";

/** Chord types offered in the filter, grouped as shown. Ids are chord template ids. */
export const CHORD_PRACTICE_GROUPS: readonly { label: string; types: readonly { id: string; label: string }[] }[] = [
  { label: "Triads", types: [
    { id: "M", label: "Major" }, { id: "m", label: "Minor" }, { id: "dim", label: "Dim" }, { id: "aug", label: "Aug" },
    { id: "sus2", label: "Sus2" }, { id: "sus4", label: "Sus4" },
  ] },
  { label: "Sixths and sevenths", types: [
    { id: "6", label: "6" }, { id: "m6", label: "m6" }, { id: "maj7", label: "maj7" }, { id: "7", label: "7" },
    { id: "m7", label: "m7" }, { id: "m7b5", label: "m7b5" }, { id: "dim7", label: "dim7" },
    { id: "mMaj7", label: "m(maj7)" }, { id: "7sus4", label: "7sus4" },
  ] },
  { label: "Ninths", types: [
    { id: "add9", label: "add9" }, { id: "9", label: "9" }, { id: "maj9", label: "maj9" }, { id: "m9", label: "m9" },
  ] },
];

export const CHORD_PRACTICE_TYPES: readonly string[] = CHORD_PRACTICE_GROUPS.flatMap(g => g.types.map(t => t.id));
export const DEFAULT_CHORD_TYPES: readonly string[] = ["M", "m"];

/** Keeps only known practice types, in display order; falls back to the defaults if nothing is left. */
export function sanitizeChordTypes(ids: readonly string[]): string[] {
  const kept = CHORD_PRACTICE_TYPES.filter(id => ids.includes(id));
  return kept.length ? kept : [...DEFAULT_CHORD_TYPES];
}

export interface ChordPrompt {
  rootPc: number;
  /** Spelled root, e.g. "Db" */
  root: string;
  /** Chord template id, e.g. "maj7" */
  type: string;
  /** Set when the prompt is a Roman numeral rather than a chord name */
  roman?: RomanPrompt;
}

export interface RomanPrompt {
  /** e.g. "V7", "viiø7", "IVmaj7" */
  numeral: string;
  /** Key selector value, e.g. "G:major" */
  keyValue: string;
  /** None of the selected chord types occur in this key, so any diatonic triad was used */
  filterIgnored: boolean;
}

/** How chord practice names the chord to play */
export const PROMPT_STYLES = ["names", "roman"] as const;
export type PromptStyle = typeof PROMPT_STYLES[number];

/**
 * Diatonic chords by scale degree (0 = tonic). Minor keys use harmonic minor for V, V7, vii° and vii°7,
 * the usual common-practice choice and the one romanFor treats as in-key.
 */
const DIATONIC: Record<"major" | "minor", readonly { numeral: string; type: string; degree: number }[]> = {
  major: [
    { numeral: "I", type: "M", degree: 0 }, { numeral: "ii", type: "m", degree: 1 }, { numeral: "iii", type: "m", degree: 2 },
    { numeral: "IV", type: "M", degree: 3 }, { numeral: "V", type: "M", degree: 4 }, { numeral: "vi", type: "m", degree: 5 },
    { numeral: "vii°", type: "dim", degree: 6 },
    { numeral: "Imaj7", type: "maj7", degree: 0 }, { numeral: "ii7", type: "m7", degree: 1 }, { numeral: "iii7", type: "m7", degree: 2 },
    { numeral: "IVmaj7", type: "maj7", degree: 3 }, { numeral: "V7", type: "7", degree: 4 }, { numeral: "vi7", type: "m7", degree: 5 },
    { numeral: "viiø7", type: "m7b5", degree: 6 },
  ],
  minor: [
    { numeral: "i", type: "m", degree: 0 }, { numeral: "ii°", type: "dim", degree: 1 }, { numeral: "III", type: "M", degree: 2 },
    { numeral: "iv", type: "m", degree: 3 }, { numeral: "V", type: "M", degree: 4 }, { numeral: "VI", type: "M", degree: 5 },
    { numeral: "vii°", type: "dim", degree: 6 },
    { numeral: "i7", type: "m7", degree: 0 }, { numeral: "iiø7", type: "m7b5", degree: 1 }, { numeral: "IIImaj7", type: "maj7", degree: 2 },
    { numeral: "iv7", type: "m7", degree: 3 }, { numeral: "V7", type: "7", degree: 4 }, { numeral: "VImaj7", type: "maj7", degree: 5 },
    { numeral: "vii°7", type: "dim7", degree: 6 },
  ],
};

/** The diatonic triads and sevenths of a key, with spelled roots. */
export function diatonicChords(key: KeyContext): { numeral: string; type: string; root: string; rootPc: number }[] {
  return DIATONIC[key.mode].map(d => {
    // The 7th degree of minor is raised (harmonic minor)
    const root = key.mode === "minor" && d.degree === 6 ? key.leadingTone! : key.scale[d.degree];
    return { numeral: d.numeral, type: d.type, root, rootPc: chromaOf(root) };
  });
}

const TRIAD_TYPES = ["M", "m", "dim"];
const ALL_KEYS = [...KEY_MAJORS.map(t => t + ":major"), ...KEY_MINORS.map(t => t + ":minor")];

/**
 * Picks a diatonic chord, by Roman numeral, in the given key (or a random key when there is none),
 * limited to the allowed types. If none of those types occur in the key, any diatonic triad is used.
 * Never the same chord twice in a row.
 */
export function makeRomanPrompt(rng: Rng, types: readonly string[], key: KeyContext | null, previous?: ChordPrompt): ChordPrompt {
  for (let tries = 0; ; tries++) {
    const keyValue = key ? key.tonic + ":" + key.mode : ALL_KEYS[Math.floor(rng() * ALL_KEYS.length)];
    const k = key ?? buildKey(keyValue)!;
    const all = diatonicChords(k);
    const allowed = all.filter(c => types.includes(c.type));
    const filterIgnored = allowed.length === 0;
    const pool = filterIgnored ? all.filter(c => TRIAD_TYPES.includes(c.type)) : allowed;
    const c = pool[Math.floor(rng() * pool.length)];
    const repeat = previous && previous.rootPc === c.rootPc && previous.type === c.type;
    // With a single possible chord a repeat is unavoidable
    if (!repeat || tries > 20) {
      return { rootPc: c.rootPc, root: c.root, type: c.type, roman: { numeral: c.numeral, keyValue, filterIgnored } };
    }
  }
}

/**
 * Picks a chord to ask for: a random root and one of the allowed types, never the same chord twice in a row.
 * The root is spelled from the key if one is set, otherwise the conventional way (Db major, C# minor).
 */
export function makeChordPrompt(rng: Rng, types: readonly string[], key: KeyContext | null, previous?: ChordPrompt): ChordPrompt {
  let rootPc: number, type: string;
  do {
    rootPc = Math.floor(rng() * 12);
    type = types[Math.floor(rng() * types.length)];
  } while (previous && rootPc === previous.rootPc && type === previous.type);
  const t = templateById(type);
  if (!t) throw new Error(`Unknown chord type: ${type}`);
  const root = key ? key.spell[rootPc] : (t.minor ? ROOT_MINOR : ROOT_MAJOR)[rootPc];
  return { rootPc, root, type };
}

export interface ChordMatchOptions {
  /** Accept chords with optional tones (usually the 5th) left out */
  allowOmissions: boolean;
}

export const DEFAULT_CHORD_MATCH: ChordMatchOptions = { allowOmissions: false };

/** Whether the held notes are the prompted chord: every tone present (any octave or inversion), nothing extra. */
export function isChord(notes: readonly number[], prompt: ChordPrompt, opts: ChordMatchOptions = DEFAULT_CHORD_MATCH): boolean {
  if (!notes.length) return false;
  const m = matchTemplate(notes.map(n => n % 12), prompt.rootPc, prompt.type);
  return !m.missing.length && !m.extra.length && (opts.allowOmissions || !m.omitted.length);
}

/** Largest move, in semitones, that counts as "replace X with Y" rather than "remove X, add Y" */
const REPLACE_MAX_SEMITONES = 2;

export interface ChordCorrections {
  /** A played wrong note close to a missing chord tone: move it there */
  replace: { from: number; to: TemplateTone }[];
  /** Chord tones still missing */
  add: TemplateTone[];
  /** Played pitch classes to take away */
  remove: number[];
}

/**
 * What to change so the played notes become the prompted chord. Each missing tone is paired with the
 * nearest wrong note within a whole step (closest pairs first), so C E G for Cm reads "replace E with Eb".
 */
export function chordCorrections(notes: readonly number[], prompt: ChordPrompt): ChordCorrections {
  const m = matchTemplate(notes.map(n => n % 12), prompt.rootPc, prompt.type);
  const missing = [...m.missing, ...m.omitted].sort((a, b) => a.degree - b.degree);
  const pcOf = (t: TemplateTone) => (prompt.rootPc + t.pc) % 12;
  const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 12; return Math.min(d, 12 - d); };
  const pairs = missing.flatMap((to, ti) => m.extra.map(from => ({ from, to, ti, d: dist(from, pcOf(to)) })))
    .filter(p => p.d <= REPLACE_MAX_SEMITONES)
    .sort((a, b) => a.d - b.d || a.ti - b.ti);
  const usedFrom = new Set<number>(), usedTo = new Set<TemplateTone>();
  const replace: ChordCorrections["replace"] = [];
  for (const p of pairs) {
    if (usedFrom.has(p.from) || usedTo.has(p.to)) continue;
    usedFrom.add(p.from); usedTo.add(p.to);
    replace.push({ from: p.from, to: p.to });
  }
  replace.sort((a, b) => a.to.degree - b.to.degree);
  return {
    replace,
    add: missing.filter(t => !usedTo.has(t)),
    remove: m.extra.filter(pc => !usedFrom.has(pc)),
  };
}

export interface ChordPracticeState {
  prompt: ChordPrompt;
  /** waiting: no judged attempt yet; wrong: the last attempt was wrong; correct: answered, about to move on */
  status: "waiting" | "wrong" | "correct";
  /** Fullest set of notes held during the attempt in progress */
  peak: number[];
  /** Notes of the last judged attempt, for feedback */
  attempt: number[] | null;
  /** Ignore input until every key is up (after a new prompt appears while keys are held) */
  waitForRelease: boolean;
  /** A wrong attempt was made on this prompt */
  missed: boolean;
  /** Prompts finished (answered or skipped) */
  answered: number;
  /** Prompts answered with no wrong attempt first */
  firstTry: number;
}

export type ChordPracticeAction =
  /** The keys currently held changed (MIDI numbers, low to high) */
  | { type: "held"; notes: number[] }
  | { type: "next"; prompt: ChordPrompt; held: number[] }
  | { type: "skip"; prompt: ChordPrompt; held: number[] };

export function initialChordPractice(prompt: ChordPrompt, held: number[] = []): ChordPracticeState {
  return { prompt, status: "waiting", peak: [], attempt: null, waitForRelease: held.length > 0, missed: false, answered: 0, firstTry: 0 };
}

export function reduceChordPractice(s: ChordPracticeState, a: ChordPracticeAction,
                                    opts: ChordMatchOptions = DEFAULT_CHORD_MATCH): ChordPracticeState {
  switch (a.type) {
    case "held": {
      if (s.status === "correct") return s;   // answered; ignore input until the next prompt
      if (s.waitForRelease) return a.notes.length ? s : { ...s, waitForRelease: false };
      // Correct as soon as the held keys are the chord, so rolled chords work
      if (isChord(a.notes, s.prompt, opts)) {
        return { ...s, status: "correct", peak: [], attempt: a.notes, answered: s.answered + 1, firstTry: s.firstTry + (s.missed ? 0 : 1) };
      }
      // All keys up without ever matching: that attempt was wrong
      if (!a.notes.length) {
        return s.peak.length ? { ...s, status: "wrong", peak: [], attempt: s.peak, missed: true } : s;
      }
      return a.notes.length >= s.peak.length ? { ...s, peak: a.notes } : s;
    }
    case "next":
    case "skip":
      return {
        ...initialChordPractice(a.prompt, a.held),
        // A skipped prompt counts as answered, but not right first time
        answered: a.type === "skip" && s.status !== "correct" ? s.answered + 1 : s.answered,
        firstTry: s.firstTry,
      };
  }
}
