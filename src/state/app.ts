// Whole-app state: the performance, a history of recent input events, and user settings.
import { DEFAULT_CHORD_TYPES, PROMPT_STYLES, sanitizeChordTypes, type PromptStyle } from "../exercises/chordPractice";
import { sanitizeExerciseOptions, type ExerciseOptions } from "../exercises/prescriptive";
import type { InputEvent } from "../input/events";
import { buildKey, isKeyValue, type KeyContext } from "../theory";
import { initialPerformance, reducePerformance, type PerformanceState } from "./performance";

export const HISTORY_LIMIT = 512;

export const MODES = ["free", "notes", "chords", "progressions", "scales", "diatonic"] as const;
export type ModeId = typeof MODES[number];

export interface Settings {
  /** Header key selector value, e.g. "C:major", or "" for none. Free play only; exercises never use it. */
  readonly keyValue: string;
  readonly key: KeyContext | null;
  /** Whether pedal-held notes count toward the chord */
  readonly includeSustained: boolean;
  /** Active mode: free play or an exercise */
  readonly mode: ModeId;
  /** Chord template ids that chord practice may ask for */
  readonly chordTypes: readonly string[];
  /** Chord and progression practice (and chord steps in exercises): chord names or Roman numerals */
  readonly promptStyle: PromptStyle;
  /** Chord practice asks for a specific inversion */
  readonly inversions: boolean;
  /** Options shared by the prescriptive exercises (scales, diatonic chords) */
  readonly exercise: ExerciseOptions;
}

/** Settings as saved between sessions; anything missing or invalid falls back to its default. */
export interface SavedSettings {
  keyValue?: unknown;
  includeSustained?: unknown;
  mode?: unknown;
  chordTypes?: unknown;
  promptStyle?: unknown;
  inversions?: unknown;
  exercise?: unknown;
}

export interface AppState {
  readonly perf: PerformanceState;
  /** Most recent input events, oldest first, at most HISTORY_LIMIT */
  readonly history: readonly InputEvent[];
  readonly settings: Settings;
}

export type AppAction =
  | { type: "input"; event: InputEvent }
  | { type: "setKey"; value: string }
  | { type: "setIncludeSustained"; on: boolean }
  | { type: "setMode"; mode: ModeId }
  | { type: "setChordTypes"; types: readonly string[] }
  | { type: "setPromptStyle"; style: PromptStyle }
  | { type: "setInversions"; on: boolean }
  | { type: "setExerciseOptions"; options: Partial<ExerciseOptions> };

const oneOf = <T>(values: readonly T[], v: unknown, fallback: T): T => values.includes(v as T) ? v as T : fallback;

/** Initial state from saved settings, validating each one. */
export function createAppState(saved: SavedSettings = {}): AppState {
  const keyValue = typeof saved.keyValue === "string" && isKeyValue(saved.keyValue) ? saved.keyValue : "";
  return {
    perf: initialPerformance,
    history: [],
    settings: {
      keyValue, key: buildKey(keyValue),
      includeSustained: typeof saved.includeSustained === "boolean" ? saved.includeSustained : true,
      mode: oneOf(MODES, saved.mode, "free"),
      chordTypes: sanitizeChordTypes(Array.isArray(saved.chordTypes) ? saved.chordTypes : DEFAULT_CHORD_TYPES),
      promptStyle: oneOf(PROMPT_STYLES, saved.promptStyle, "names"),
      inversions: saved.inversions === true,
      exercise: sanitizeExerciseOptions(saved.exercise),
    },
  };
}

export function reduceApp(s: AppState, a: AppAction): AppState {
  switch (a.type) {
    case "input": {
      const history = s.history.length >= HISTORY_LIMIT
        ? [...s.history.slice(s.history.length - HISTORY_LIMIT + 1), a.event]
        : [...s.history, a.event];
      return { ...s, perf: reducePerformance(s.perf, a.event), history };
    }
    case "setKey":
      return { ...s, settings: { ...s.settings, keyValue: a.value, key: buildKey(a.value) } };
    case "setIncludeSustained":
      return { ...s, settings: { ...s.settings, includeSustained: a.on } };
    case "setMode":
      return a.mode === s.settings.mode ? s : { ...s, settings: { ...s.settings, mode: a.mode } };
    case "setChordTypes":
      return { ...s, settings: { ...s.settings, chordTypes: sanitizeChordTypes(a.types) } };
    case "setPromptStyle":
      return a.style === s.settings.promptStyle ? s : { ...s, settings: { ...s.settings, promptStyle: a.style } };
    case "setInversions":
      return a.on === s.settings.inversions ? s : { ...s, settings: { ...s.settings, inversions: a.on } };
    case "setExerciseOptions": {
      const exercise = sanitizeExerciseOptions({ ...s.settings.exercise, ...a.options });
      const same = (Object.keys(exercise) as (keyof ExerciseOptions)[]).every(k => exercise[k] === s.settings.exercise[k]);
      return same ? s : { ...s, settings: { ...s.settings, exercise } };
    }
  }
}
