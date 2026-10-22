// The prescriptive exercises and the options they share. Each exercise builds a SequenceExercise from the options;
// the mode (src/modes/sequencePractice.ts) and the options UI are the same for all of them.
import { buildKey, isKeyValue } from "../theory";
import { STRICTNESS, SUBDIVISIONS, type Strictness, type Subdivision } from "../timing/grid";
import { diatonicChordsExercise } from "./diatonicChords";
import { MINOR_FORMS, SCALE_OCTAVES, scaleExercise, type MinorForm, type ScaleOctaves } from "./scales";
import type { SequenceExercise } from "./sequence";

/** Options shared by the prescriptive exercises; each exercise uses some of them. */
export interface ExerciseOptions {
  /** Key value, e.g. "Eb:minor" */
  key: string;
  /** Scales: which minor scale in minor keys */
  minorForm: MinorForm;
  /** Scales: how many octaves */
  octaves: ScaleOctaves;
  /** Diatonic chords: seventh chords instead of triads */
  sevenths: boolean;
  /** Diatonic chords: every chord in root position */
  rootPosition: boolean;
  /** Play to the metronome: each step is timed against it */
  metronome: boolean;
  /** Metronome tempo */
  bpm: number;
  /** Steps per beat: quarters, eighths or sixteenths */
  subdivision: Subdivision;
  /** How close to the beat counts as on time */
  strictness: Strictness;
}

export type ExerciseOption = keyof ExerciseOptions;

export const BPM_RANGE = { min: 30, max: 240 } as const;

export const DEFAULT_EXERCISE_OPTIONS: ExerciseOptions = {
  key: "C:major", minorForm: "natural", octaves: 1, sevenths: false, rootPosition: true,
  metronome: false, bpm: 80, subdivision: 1, strictness: "strict",
};

/** Fills in anything missing or invalid (e.g. options saved by an older version) with the defaults. */
export function sanitizeExerciseOptions(raw: unknown): ExerciseOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_EXERCISE_OPTIONS;
  return {
    key: typeof o.key === "string" && isKeyValue(o.key) ? o.key : d.key,
    minorForm: (MINOR_FORMS as readonly unknown[]).includes(o.minorForm) ? o.minorForm as MinorForm : d.minorForm,
    octaves: (SCALE_OCTAVES as readonly unknown[]).includes(o.octaves) ? o.octaves as ScaleOctaves : d.octaves,
    sevenths: typeof o.sevenths === "boolean" ? o.sevenths : d.sevenths,
    rootPosition: typeof o.rootPosition === "boolean" ? o.rootPosition : d.rootPosition,
    metronome: typeof o.metronome === "boolean" ? o.metronome : d.metronome,
    bpm: typeof o.bpm === "number" && Number.isFinite(o.bpm)
      ? Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, Math.round(o.bpm))) : d.bpm,
    subdivision: (SUBDIVISIONS as readonly unknown[]).includes(o.subdivision) ? o.subdivision as Subdivision : d.subdivision,
    strictness: (STRICTNESS as readonly unknown[]).includes(o.strictness) ? o.strictness as Strictness : d.strictness,
  };
}

export interface PrescriptiveExercise {
  /** Short name, e.g. "scale", to label the exercise among others (in routines) */
  short: string;
  /** Has chord steps, so the chord names / Roman numerals setting applies */
  chords: boolean;
  /** Builds the exercise for the current options */
  build(options: ExerciseOptions): SequenceExercise;
  /** The options this exercise uses, to show in its settings ("metronome" stands for all the metronome options) */
  options: readonly ExerciseOption[];
}

/** Every prescriptive exercise, by mode id. Adding one: a builder, an entry here, and a mode in MODES. */
export const PRESCRIPTIVE = {
  scales: {
    short: "scale",
    chords: false,
    build: o => scaleExercise(buildKey(o.key)!, o.minorForm, o.octaves),
    options: ["key", "octaves", "minorForm", "metronome"],
  },
  diatonic: {
    short: "chords",
    chords: true,
    build: o => diatonicChordsExercise(buildKey(o.key)!, { sevenths: o.sevenths, rootPosition: o.rootPosition }),
    options: ["key", "sevenths", "rootPosition", "metronome"],
  },
} satisfies Record<string, PrescriptiveExercise>;

export type PrescriptiveId = keyof typeof PRESCRIPTIVE;
