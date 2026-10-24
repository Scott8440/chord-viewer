// Whole-app state: the performance, a history of recent input events, and user settings.
import { DEFAULT_CHORD_TYPES, sanitizeChordKey, sanitizeChordTypes } from "../exercises/chordPractice";
import { PROMPT_STYLES, type PromptStyle } from "../exercises/chordPrompt";
import { sanitizeEarOptions, type EarOptions } from "../exercises/earTraining";
import { sanitizeReadingOptions, type ReadingOptions } from "../exercises/sightReading";
import { sanitizeExerciseOptions, type ExerciseOptions } from "../exercises/prescriptive";
import { sanitizeRoutineOptions, type RoutineOptions } from "../exercises/routines";
import type { InputEvent } from "../input/events";
import { buildKey, isKeyValue, type KeyContext } from "../theory";
import type { Transport } from "../timing/transport";
import { initialPerformance, reducePerformance, type PerformanceState } from "./performance";

export const HISTORY_LIMIT = 512;

export const MODES = ["free", "notes", "chords", "progressions", "scales", "diatonic", "routines", "ear", "earMelody"] as const;
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
  /** Chord practice's key: "none", "random" or a key value (see CHORD_KEYS) */
  readonly chordKey: string;
  /** Options shared by the prescriptive exercises (scales, diatonic chords), also the base for routine items */
  readonly exercise: ExerciseOptions;
  /** Which routine, and which way round the circle of fifths */
  readonly routine: RoutineOptions;
  /** Ear training (both modes): the tonic (or random), which scale degrees it asks for, and the melody length */
  readonly ear: EarOptions;
  /** Sight reading (mode "notes"): how many notes, which staff, which key (or random) */
  readonly reading: ReadingOptions;
  /** How long the player's notes take to arrive after they hear the click (ms): taken off note times when timing */
  readonly latencyMs: number;
  /** The latency has been dealt with: calibrated, set by hand, or calibration declined. Until it is, starting the
   *  metronome opens the calibration. */
  readonly latencyCalibrated: boolean;
}

/** Settings as saved between sessions; anything missing or invalid falls back to its default. */
export interface SavedSettings {
  keyValue?: unknown;
  includeSustained?: unknown;
  mode?: unknown;
  chordTypes?: unknown;
  promptStyle?: unknown;
  inversions?: unknown;
  chordKey?: unknown;
  exercise?: unknown;
  routine?: unknown;
  ear?: unknown;
  reading?: unknown;
  latencyMs?: unknown;
  latencyCalibrated?: unknown;
}

export const LATENCY_RANGE = { min: -200, max: 300 } as const;
const sanitizeLatency = (v: unknown) => typeof v === "number" && Number.isFinite(v)
  ? Math.min(LATENCY_RANGE.max, Math.max(LATENCY_RANGE.min, Math.round(v))) : 0;

export interface AppState {
  readonly perf: PerformanceState;
  /** Most recent input events, oldest first, at most HISTORY_LIMIT */
  readonly history: readonly InputEvent[];
  readonly settings: Settings;
  /** Where the beats are, while a metronome (or, later, an external clock) runs; null otherwise */
  readonly transport: Transport | null;
  /** A latency calibration is listening: exercises ignore the player's notes meanwhile */
  readonly calibrating: boolean;
  /** Practising (the mode in settings), or looking at the Progress page. Not saved: the app always opens on practice */
  readonly page: Page;
}

export type Page = "practice" | "progress";

export type AppAction =
  | { type: "input"; event: InputEvent }
  | { type: "setKey"; value: string }
  | { type: "setIncludeSustained"; on: boolean }
  | { type: "setMode"; mode: ModeId }
  | { type: "setChordTypes"; types: readonly string[] }
  | { type: "setPromptStyle"; style: PromptStyle }
  | { type: "setInversions"; on: boolean }
  | { type: "setChordKey"; value: string }
  | { type: "setExerciseOptions"; options: Partial<ExerciseOptions> }
  | { type: "setRoutineOptions"; options: Partial<RoutineOptions> }
  | { type: "setEarOptions"; options: Partial<EarOptions> }
  | { type: "setReadingOptions"; options: Partial<ReadingOptions> }
  /** Calibrated or typed in: either way, the latency counts as dealt with */
  | { type: "setLatency"; ms: number }
  /** Calibration declined */
  | { type: "setLatencyCalibrated" }
  /** From whatever drives the clock */
  | { type: "setTransport"; transport: Transport | null }
  | { type: "setCalibrating"; on: boolean }
  | { type: "setPage"; page: Page };

const oneOf = <T>(values: readonly T[], v: unknown, fallback: T): T => values.includes(v as T) ? v as T : fallback;

/** Initial state from saved settings, validating each one. */
export function createAppState(saved: SavedSettings = {}): AppState {
  const keyValue = typeof saved.keyValue === "string" && isKeyValue(saved.keyValue) ? saved.keyValue : "";
  return {
    perf: initialPerformance,
    history: [],
    transport: null,
    calibrating: false,
    page: "practice",
    settings: {
      keyValue, key: buildKey(keyValue),
      includeSustained: typeof saved.includeSustained === "boolean" ? saved.includeSustained : true,
      mode: oneOf(MODES, saved.mode, "free"),
      chordTypes: sanitizeChordTypes(Array.isArray(saved.chordTypes) ? saved.chordTypes : DEFAULT_CHORD_TYPES),
      promptStyle: oneOf(PROMPT_STYLES, saved.promptStyle, "names"),
      inversions: saved.inversions === true,
      chordKey: sanitizeChordKey(saved.chordKey),
      exercise: sanitizeExerciseOptions(saved.exercise),
      routine: sanitizeRoutineOptions(saved.routine),
      ear: sanitizeEarOptions(saved.ear),
      reading: sanitizeReadingOptions(saved.reading),
      latencyMs: sanitizeLatency(saved.latencyMs),
      // A latency saved before this flag existed was calibrated or typed in, unless it's the default 0
      latencyCalibrated: saved.latencyCalibrated === true || sanitizeLatency(saved.latencyMs) !== 0,
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
      // Choosing a mode is choosing to practise: it leaves the Progress page
      if (a.mode === s.settings.mode) return s.page === "practice" ? s : { ...s, page: "practice" };
      return { ...s, page: "practice", settings: { ...s.settings, mode: a.mode } };
    case "setChordTypes":
      return { ...s, settings: { ...s.settings, chordTypes: sanitizeChordTypes(a.types) } };
    case "setPromptStyle":
      return a.style === s.settings.promptStyle ? s : { ...s, settings: { ...s.settings, promptStyle: a.style } };
    case "setInversions":
      return a.on === s.settings.inversions ? s : { ...s, settings: { ...s.settings, inversions: a.on } };
    case "setChordKey": {
      const chordKey = sanitizeChordKey(a.value);
      return chordKey === s.settings.chordKey ? s : { ...s, settings: { ...s.settings, chordKey } };
    }
    case "setExerciseOptions": {
      const exercise = sanitizeExerciseOptions({ ...s.settings.exercise, ...a.options });
      const same = (Object.keys(exercise) as (keyof ExerciseOptions)[]).every(k => exercise[k] === s.settings.exercise[k]);
      return same ? s : { ...s, settings: { ...s.settings, exercise } };
    }
    case "setRoutineOptions": {
      const routine = sanitizeRoutineOptions({ ...s.settings.routine, ...a.options });
      return routine.id === s.settings.routine.id && routine.direction === s.settings.routine.direction ? s
        : { ...s, settings: { ...s.settings, routine } };
    }
    case "setEarOptions": {
      const ear = sanitizeEarOptions({ ...s.settings.ear, ...a.options });
      return ear.tonic === s.settings.ear.tonic && ear.degrees.join() === s.settings.ear.degrees.join() &&
        ear.melodyLength === s.settings.ear.melodyLength ? s
        : { ...s, settings: { ...s.settings, ear } };
    }
    case "setReadingOptions": {
      const reading = sanitizeReadingOptions({ ...s.settings.reading, ...a.options });
      const r = s.settings.reading;
      return reading.length === r.length && reading.range === r.range && reading.key === r.key ? s
        : { ...s, settings: { ...s.settings, reading } };
    }
    case "setLatency": {
      const latencyMs = sanitizeLatency(a.ms);
      return latencyMs === s.settings.latencyMs && s.settings.latencyCalibrated ? s
        : { ...s, settings: { ...s.settings, latencyMs, latencyCalibrated: true } };
    }
    case "setLatencyCalibrated":
      return s.settings.latencyCalibrated ? s : { ...s, settings: { ...s.settings, latencyCalibrated: true } };
    case "setTransport":
      return a.transport === s.transport ? s : { ...s, transport: a.transport };
    case "setCalibrating":
      return a.on === s.calibrating ? s : { ...s, calibrating: a.on };
    case "setPage":
      return a.page === s.page ? s : { ...s, page: a.page };
  }
}
