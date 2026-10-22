// The prescriptive exercises and the options they share. Each exercise builds a SequenceExercise from the options;
// the mode (src/modes/sequencePractice.ts) and the options UI are the same for all of them.
import { buildKey, isKeyValue } from "../theory";
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
}

export type ExerciseOption = keyof ExerciseOptions;

export const DEFAULT_EXERCISE_OPTIONS: ExerciseOptions = {
  key: "C:major", minorForm: "natural", octaves: 1, sevenths: false, rootPosition: true,
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
  };
}

export interface PrescriptiveExercise {
  /** Short name, e.g. "scale", to label the exercise among others (in routines) */
  short: string;
  /** Has chord steps, so the chord names / Roman numerals setting applies */
  chords: boolean;
  /** Builds the exercise for the current options */
  build(options: ExerciseOptions): SequenceExercise;
  /** The options this exercise uses, to show in its settings */
  options: readonly ExerciseOption[];
}

/** Every prescriptive exercise, by mode id. Adding one: a builder, an entry here, and a mode in MODES. */
export const PRESCRIPTIVE = {
  scales: {
    short: "scale",
    chords: false,
    build: o => scaleExercise(buildKey(o.key)!, o.minorForm, o.octaves),
    options: ["key", "octaves", "minorForm"],
  },
  diatonic: {
    short: "chords",
    chords: true,
    build: o => diatonicChordsExercise(buildKey(o.key)!, { sevenths: o.sevenths, rootPosition: o.rootPosition }),
    options: ["key", "sevenths", "rootPosition"],
  },
} satisfies Record<string, PrescriptiveExercise>;

export type PrescriptiveId = keyof typeof PRESCRIPTIVE;
