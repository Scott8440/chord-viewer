// Progression practice: the app names a chord progression in a key; the player plays it one chord at a time.
// Pure data and functions; the mode in src/modes/progressionPractice.ts drives it.
import { buildKey, chromaOf, KEY_MAJORS, KEY_MINORS, type KeyContext } from "../theory";
import { isChord, type ChordPrompt } from "./chordPractice";
import type { Rng } from "./notePractice";

export interface ProgressionStep {
  /** Roman numeral as the app writes it (romanFor), e.g. "ii7", "VII" */
  numeral: string;
  /** Scale degree of the root, 0 = tonic. Minor keys use the natural minor scale (VII, not vii°). */
  degree: number;
  /** Chord template id */
  type: string;
}

export interface ProgressionDef {
  id: string;
  name: string;
  mode: "major" | "minor";
  steps: readonly ProgressionStep[];
}

const step = (numeral: string, degree: number, type: string): ProgressionStep => ({ numeral, degree, type });

export const PROGRESSIONS: readonly ProgressionDef[] = [
  { id: "I-IV-V-I", name: "I–IV–V–I", mode: "major",
    steps: [step("I", 0, "M"), step("IV", 3, "M"), step("V", 4, "M"), step("I", 0, "M")] },
  { id: "I-V-vi-IV", name: "I–V–vi–IV (pop)", mode: "major",
    steps: [step("I", 0, "M"), step("V", 4, "M"), step("vi", 5, "m"), step("IV", 3, "M")] },
  { id: "I-vi-IV-V", name: "I–vi–IV–V (’50s)", mode: "major",
    steps: [step("I", 0, "M"), step("vi", 5, "m"), step("IV", 3, "M"), step("V", 4, "M")] },
  { id: "vi-IV-I-V", name: "vi–IV–I–V", mode: "major",
    steps: [step("vi", 5, "m"), step("IV", 3, "M"), step("I", 0, "M"), step("V", 4, "M")] },
  { id: "ii-V-I", name: "ii–V–I", mode: "major",
    steps: [step("ii", 1, "m"), step("V", 4, "M"), step("I", 0, "M")] },
  { id: "ii7-V7-Imaj7", name: "ii7–V7–Imaj7 (jazz)", mode: "major",
    steps: [step("ii7", 1, "m7"), step("V7", 4, "7"), step("Imaj7", 0, "maj7")] },
  { id: "Imaj7-vi7-ii7-V7", name: "Imaj7–vi7–ii7–V7 (turnaround)", mode: "major",
    steps: [step("Imaj7", 0, "maj7"), step("vi7", 5, "m7"), step("ii7", 1, "m7"), step("V7", 4, "7")] },
  { id: "circle", name: "I–IV–vii°–iii–vi–ii–V–I (circle of fifths)", mode: "major",
    steps: [step("I", 0, "M"), step("IV", 3, "M"), step("vii°", 6, "dim"), step("iii", 2, "m"),
            step("vi", 5, "m"), step("ii", 1, "m"), step("V", 4, "M"), step("I", 0, "M")] },
  { id: "i-iv-V-i", name: "i–iv–V–i", mode: "minor",
    steps: [step("i", 0, "m"), step("iv", 3, "m"), step("V", 4, "M"), step("i", 0, "m")] },
  { id: "iiø7-V7-i", name: "iiø7–V7–i (minor ii–V–i)", mode: "minor",
    steps: [step("iiø7", 1, "m7b5"), step("V7", 4, "7"), step("i", 0, "m")] },
  { id: "i-VI-III-VII", name: "i–VI–III–VII", mode: "minor",
    steps: [step("i", 0, "m"), step("VI", 5, "M"), step("III", 2, "M"), step("VII", 6, "M")] },
  { id: "i-VII-VI-V", name: "i–VII–VI–V (Andalusian)", mode: "minor",
    steps: [step("i", 0, "m"), step("VII", 6, "M"), step("VI", 5, "M"), step("V", 4, "M")] },
];

export const PROGRESSION_GROUPS = (["major", "minor"] as const).map(mode => ({
  label: mode === "major" ? "Major keys" : "Minor keys",
  types: PROGRESSIONS.filter(p => p.mode === mode).map(p => ({ id: p.id, label: p.name })),
}));

export const DEFAULT_PROGRESSIONS: readonly string[] = ["I-IV-V-I", "I-V-vi-IV", "ii-V-I", "i-iv-V-i"];

/** Keeps only known progressions, in list order; falls back to the defaults if nothing is left. */
export function sanitizeProgressions(ids: readonly string[]): string[] {
  const kept = PROGRESSIONS.filter(p => ids.includes(p.id)).map(p => p.id);
  return kept.length ? kept : [...DEFAULT_PROGRESSIONS];
}

export interface ProgressionPrompt {
  id: string;
  name: string;
  /** Key selector value, e.g. "C:major" */
  keyValue: string;
  /** One chord prompt per step, each with its Roman numeral */
  chords: ChordPrompt[];
  /** No selected progression fits the selected key's mode, so any progression in that mode was used */
  filterIgnored: boolean;
}

/** The chords of a progression in a key, with spelled roots. */
export function progressionChords(def: ProgressionDef, key: KeyContext): ChordPrompt[] {
  const keyValue = key.tonic + ":" + key.mode;
  return def.steps.map(st => {
    const root = key.scale[st.degree];
    return { rootPc: chromaOf(root), root, type: st.type, roman: { numeral: st.numeral, keyValue, filterIgnored: false } };
  });
}

/**
 * Picks one of the allowed progressions in the selected key (only progressions in that key's mode),
 * or in a random key of the progression's mode when none is selected. Never the same progression in the
 * same key twice in a row.
 */
export function makeProgressionPrompt(rng: Rng, ids: readonly string[], key: KeyContext | null,
                                      previous?: ProgressionPrompt): ProgressionPrompt {
  const fits = (p: ProgressionDef) => !key || p.mode === key.mode;
  let pool = PROGRESSIONS.filter(p => ids.includes(p.id) && fits(p));
  const filterIgnored = pool.length === 0;
  if (filterIgnored) pool = PROGRESSIONS.filter(fits);
  for (let tries = 0; ; tries++) {
    const def = pool[Math.floor(rng() * pool.length)];
    const tonics = def.mode === "major" ? KEY_MAJORS : KEY_MINORS;
    const k = key ?? buildKey(tonics[Math.floor(rng() * tonics.length)] + ":" + def.mode)!;
    const keyValue = k.tonic + ":" + k.mode;
    if (!previous || previous.id !== def.id || previous.keyValue !== keyValue || tries > 20) {
      return { id: def.id, name: def.name, keyValue, chords: progressionChords(def, k), filterIgnored };
    }
  }
}

export interface ProgressionState {
  prompt: ProgressionPrompt;
  /** Index of the chord to play next */
  index: number;
  /** playing: in progress; wrong: the last attempt at the current chord was wrong; done: all chords played */
  status: "playing" | "wrong" | "done";
  /** Keys held at the last update, to tell new presses from releases */
  prevHeld: number[];
  /** A key was pressed since the last correct chord, so releasing everything judges an attempt */
  pressed: boolean;
  /** Fullest set of notes held during the attempt in progress */
  peak: number[];
  /** Notes of the last wrong attempt, for feedback */
  attempt: number[] | null;
  /** A wrong attempt was made at the current chord */
  missed: boolean;
  chordsAnswered: number;
  chordsFirstTry: number;
  /** Progressions finished */
  completed: number;
}

export type ProgressionAction =
  /** The keys currently held changed (MIDI numbers, low to high) */
  | { type: "held"; notes: number[] }
  | { type: "next"; prompt: ProgressionPrompt };

export function initialProgression(prompt: ProgressionPrompt, held: number[] = []): ProgressionState {
  return { prompt, index: 0, status: "playing", prevHeld: held, pressed: false, peak: [], attempt: null, missed: false,
           chordsAnswered: 0, chordsFirstTry: 0, completed: 0 };
}

export function reduceProgression(s: ProgressionState, a: ProgressionAction): ProgressionState {
  switch (a.type) {
    case "held": {
      if (s.status === "done") return { ...s, prevHeld: a.notes };
      const notes = a.notes;
      const newPress = notes.some(n => !s.prevHeld.includes(n));
      const next = { ...s, prevHeld: notes };
      // Correct as soon as the held keys are the current chord, however they got there (legato is fine)
      if (isChord(notes, s.prompt.chords[s.index])) {
        const index = s.index + 1;
        const done = index === s.prompt.chords.length;
        return { ...next, index, status: done ? "done" : "playing", pressed: false, peak: [], attempt: null, missed: false,
                 chordsAnswered: s.chordsAnswered + 1, chordsFirstTry: s.chordsFirstTry + (s.missed ? 0 : 1),
                 completed: s.completed + (done ? 1 : 0) };
      }
      // All keys up after pressing something: that attempt was wrong. Just letting go of the last chord is not.
      if (!notes.length) {
        return s.pressed ? { ...next, status: "wrong", pressed: false, peak: [], attempt: s.peak, missed: true } : next;
      }
      const pressed = s.pressed || newPress;
      return { ...next, pressed, peak: pressed && notes.length >= s.peak.length ? notes : s.peak };
    }
    case "next":
      return { ...initialProgression(a.prompt, s.prevHeld),
               chordsAnswered: s.chordsAnswered, chordsFirstTry: s.chordsFirstTry, completed: s.completed };
  }
}
