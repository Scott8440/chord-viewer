// The prescriptive exercises and the options they share. Each exercise builds a SequenceExercise from the options;
// the mode (src/modes/sequencePractice.ts) and the options UI are the same for all of them.
import { requireKey, isKeyValue } from "../theory";
import { KEY_PROGRESSIONS, type KeyProgression } from "./keyOrder";
import { STRICTNESS, SUBDIVISIONS, type Strictness, type Subdivision } from "../timing/grid";
import { diatonicChordsExercise, tonicTriadExercise } from "./diatonicChords";
import { MINOR_FORMS, SCALE_OCTAVES, scaleExercise, type MinorForm, type ScaleOctaves } from "./scales";
import type { SequenceExercise } from "./sequence";
import {
  ARPEGGIO_INVERSIONS,
  arpeggioExercise,
  brokenChordExercise,
  chromaticExercise,
  fiveFingerExercise,
  type ArpeggioInversion,
} from "./technique";

/** Options shared by the prescriptive exercises; each exercise uses some of them. */
export interface ExerciseOptions {
  /** Key value, e.g. "Eb:minor" */
  key: string;
  /** Where to go once a run is done: the same key again, or on to the next (round the circle, chromatically, at
   *  random), which then becomes `key` */
  progression: KeyProgression;
  /** Scales: which minor scale in minor keys */
  minorForm: MinorForm;
  /** Scales, arpeggios, broken chords, chromatic: how many octaves */
  octaves: ScaleOctaves;
  /** Arpeggios: start from the root, 3rd or 5th */
  inversion: ArpeggioInversion;
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
  key: "C:major",
  progression: "circle-sharps",
  minorForm: "natural",
  octaves: 1,
  inversion: 0,
  sevenths: false,
  rootPosition: true,
  metronome: false,
  bpm: 80,
  subdivision: 1,
  strictness: "strict",
};

/** Fills in anything missing or invalid (e.g. options saved by an older version) with the defaults. */
export function sanitizeExerciseOptions(raw: unknown): ExerciseOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_EXERCISE_OPTIONS;
  return {
    key: typeof o.key === "string" && isKeyValue(o.key) ? o.key : d.key,
    progression: (KEY_PROGRESSIONS as readonly unknown[]).includes(o.progression)
      ? (o.progression as KeyProgression)
      : d.progression,
    minorForm: (MINOR_FORMS as readonly unknown[]).includes(o.minorForm) ? (o.minorForm as MinorForm) : d.minorForm,
    octaves: (SCALE_OCTAVES as readonly unknown[]).includes(o.octaves) ? (o.octaves as ScaleOctaves) : d.octaves,
    inversion: (ARPEGGIO_INVERSIONS as readonly unknown[]).includes(o.inversion)
      ? (o.inversion as ArpeggioInversion)
      : d.inversion,
    sevenths: typeof o.sevenths === "boolean" ? o.sevenths : d.sevenths,
    rootPosition: typeof o.rootPosition === "boolean" ? o.rootPosition : d.rootPosition,
    metronome: typeof o.metronome === "boolean" ? o.metronome : d.metronome,
    bpm:
      typeof o.bpm === "number" && Number.isFinite(o.bpm)
        ? Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, Math.round(o.bpm)))
        : d.bpm,
    subdivision: (SUBDIVISIONS as readonly unknown[]).includes(o.subdivision)
      ? (o.subdivision as Subdivision)
      : d.subdivision,
    strictness: (STRICTNESS as readonly unknown[]).includes(o.strictness) ? (o.strictness as Strictness) : d.strictness,
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
    build: o => scaleExercise(requireKey(o.key), o.minorForm, o.octaves),
    options: ["key", "progression", "octaves", "minorForm", "metronome"],
  },
  diatonic: {
    short: "chords",
    chords: true,
    build: o => diatonicChordsExercise(requireKey(o.key), { sevenths: o.sevenths, rootPosition: o.rootPosition }),
    options: ["key", "progression", "sevenths", "rootPosition", "metronome"],
  },
  fiveFinger: {
    short: "five-finger",
    chords: false,
    build: o => fiveFingerExercise(requireKey(o.key)),
    options: ["key", "progression", "metronome"],
  },
  arpeggios: {
    short: "arpeggio",
    chords: false,
    build: o => arpeggioExercise(requireKey(o.key), o.octaves, o.inversion),
    options: ["key", "progression", "octaves", "inversion", "metronome"],
  },
  brokenChords: {
    short: "broken chords",
    chords: false,
    build: o => brokenChordExercise(requireKey(o.key), o.octaves),
    options: ["key", "progression", "octaves", "metronome"],
  },
  // Not a mode of its own: the item of triad routines, which set its key
  triad: {
    short: "triad",
    chords: true,
    build: o => tonicTriadExercise(requireKey(o.key), o.rootPosition),
    options: ["rootPosition", "metronome"],
  },
  chromatic: {
    short: "chromatic",
    chords: false,
    build: o => chromaticExercise(requireKey(o.key), o.octaves),
    options: ["key", "progression", "octaves", "metronome"],
  },
} satisfies Record<string, PrescriptiveExercise>;

export type PrescriptiveId = keyof typeof PRESCRIPTIVE;
