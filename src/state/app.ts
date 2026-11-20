// Whole-app state: the performance, a history of recent input events, and user settings (see settings.ts).
import type { PromptStyle } from "../exercises/chordPrompt";
import type { ChordEarOptions } from "../exercises/chordEar";
import type { EarKind, TheoryKind } from "./settings";
import type { ProgressionEarOptions } from "../exercises/progressionEar";
import type { IntervalEarOptions } from "../exercises/intervalEar";
import type { KeySigOptions } from "../exercises/keySignatures";
import type { CircleQuizOptions } from "../exercises/circleQuiz";
import type { EarOptions } from "../exercises/earTraining";
import type { ReadingOptions } from "../exercises/sightReading";
import type { ExerciseOptions } from "../exercises/prescriptive";
import type { RoutineOptions } from "../exercises/routines";
import type { InputEvent } from "../input/events";
import { buildKey } from "../theory";
import type { Transport } from "../timing/transport";
import { initialPerformance, reducePerformance, type PerformanceState } from "./performance";
import {
  SETTINGS,
  sameSetting,
  sanitizeLatency,
  sanitizeSettings,
  type ModeId,
  type SavedSettings,
  type Settings,
  type SettingSpec,
} from "./settings";

export {
  EAR_KINDS,
  THEORY_KINDS,
  LATENCY_RANGE,
  MODES,
  type EarKind,
  type TheoryKind,
  type ModeId,
  type SavedSettings,
  type Settings,
} from "./settings";

export const HISTORY_LIMIT = 512;

export interface AppState {
  readonly perf: PerformanceState;
  /** Most recent input events, oldest first, at most HISTORY_LIMIT */
  readonly history: readonly InputEvent[];
  readonly settings: Settings;
  /** Where the beats are, while a metronome (or, later, an external clock) runs; null otherwise */
  readonly transport: Transport | null;
  /** A latency calibration is listening: exercises ignore the player's notes meanwhile */
  readonly calibrating: boolean;
  /** Practising (the mode in settings), or looking at the Progress or Reference page. Not saved: the app always opens on practice */
  readonly page: Page;
}

export type Page = "practice" | "progress" | "reference";

export type AppAction =
  | { type: "input"; event: InputEvent }
  | { type: "setKey"; value: string }
  | { type: "setIncludeSustained"; on: boolean }
  | { type: "setMode"; mode: ModeId }
  | { type: "setChordTypes"; types: readonly string[] }
  | { type: "setPromptStyle"; style: PromptStyle }
  | { type: "setInversions"; on: boolean }
  | { type: "setStayClose"; on: boolean }
  | { type: "setPianoSound"; on: boolean }
  | { type: "setChordKey"; value: string }
  | { type: "setExerciseOptions"; options: Partial<ExerciseOptions> }
  | { type: "setRoutineOptions"; options: Partial<RoutineOptions> }
  | { type: "setEarOptions"; options: Partial<EarOptions> }
  | { type: "setEarChordOptions"; options: Partial<ChordEarOptions> }
  | { type: "setEarProgressionOptions"; options: Partial<ProgressionEarOptions> }
  | { type: "setEarIntervalOptions"; options: Partial<IntervalEarOptions> }
  | { type: "setEarKind"; kind: EarKind }
  | { type: "setReadingOptions"; options: Partial<ReadingOptions> }
  | { type: "setKeySigOptions"; options: Partial<KeySigOptions> }
  | { type: "setTheoryKind"; kind: TheoryKind }
  | { type: "setCircleQuizOptions"; options: Partial<CircleQuizOptions> }
  /** Calibrated or typed in: either way, the latency counts as dealt with */
  | { type: "setLatency"; ms: number }
  /** Calibration declined */
  | { type: "setLatencyCalibrated" }
  /** From whatever drives the clock */
  | { type: "setTransport"; transport: Transport | null }
  | { type: "setCalibrating"; on: boolean }
  | { type: "setPage"; page: Page };

/** Initial state from saved settings, validating each one. */
export function createAppState(saved: SavedSettings = {}): AppState {
  const settings = sanitizeSettings(saved);
  return {
    perf: initialPerformance,
    history: [],
    transport: null,
    calibrating: false,
    page: "practice",
    settings: { ...settings, key: buildKey(settings.keyValue) },
  };
}

/** The state with these settings changed, or the same state when they already have these values (so subscribers,
 *  the controls and saving among them, see no change) */
function withSettings(s: AppState, changes: Partial<Settings>): AppState {
  const same = (Object.keys(changes) as (keyof Settings)[]).every(k => sameSetting(changes[k], s.settings[k]));
  return same ? s : { ...s, settings: { ...s.settings, ...changes } };
}

/** An options object with some fields changed, then checked */
const merged = <T>(was: T, options: Partial<T>, spec: SettingSpec<T>) => spec.sanitize({ ...was, ...options });

export function reduceApp(s: AppState, a: AppAction): AppState {
  switch (a.type) {
    case "input": {
      const history =
        s.history.length >= HISTORY_LIMIT
          ? [...s.history.slice(s.history.length - HISTORY_LIMIT + 1), a.event]
          : [...s.history, a.event];
      return { ...s, perf: reducePerformance(s.perf, a.event), history };
    }
    case "setKey":
      // The key context is built anew each time, so only the value decides whether anything changed
      return a.value === s.settings.keyValue ? s : withSettings(s, { keyValue: a.value, key: buildKey(a.value) });
    case "setIncludeSustained":
      return withSettings(s, { includeSustained: a.on });
    case "setMode": {
      // Choosing a mode is choosing to practise: it leaves the Progress page
      const t = withSettings(s, { mode: a.mode });
      return t.page === "practice" ? t : { ...t, page: "practice" };
    }
    case "setChordTypes":
      return withSettings(s, { chordTypes: SETTINGS.chordTypes.sanitize(a.types) });
    case "setPromptStyle":
      return withSettings(s, { promptStyle: a.style });
    case "setInversions":
      return withSettings(s, { inversions: a.on });
    case "setStayClose":
      return withSettings(s, { stayClose: a.on });
    case "setPianoSound":
      return withSettings(s, { pianoSound: a.on });
    case "setChordKey":
      return withSettings(s, { chordKey: SETTINGS.chordKey.sanitize(a.value) });
    case "setExerciseOptions":
      return withSettings(s, { exercise: merged(s.settings.exercise, a.options, SETTINGS.exercise) });
    case "setRoutineOptions":
      return withSettings(s, { routine: merged(s.settings.routine, a.options, SETTINGS.routine) });
    case "setEarOptions":
      return withSettings(s, { ear: merged(s.settings.ear, a.options, SETTINGS.ear) });
    case "setEarKind":
      return withSettings(s, { earKind: a.kind });
    case "setKeySigOptions":
      return withSettings(s, { keySig: merged(s.settings.keySig, a.options, SETTINGS.keySig) });
    case "setTheoryKind":
      return withSettings(s, { theoryKind: a.kind });
    case "setCircleQuizOptions":
      return withSettings(s, { circleQuiz: merged(s.settings.circleQuiz, a.options, SETTINGS.circleQuiz) });
    case "setEarIntervalOptions":
      return withSettings(s, {
        earIntervals: merged(s.settings.earIntervals, a.options, SETTINGS.earIntervals),
      });
    case "setEarProgressionOptions":
      return withSettings(s, {
        earProgressions: merged(s.settings.earProgressions, a.options, SETTINGS.earProgressions),
      });
    case "setEarChordOptions":
      return withSettings(s, { earChords: merged(s.settings.earChords, a.options, SETTINGS.earChords) });
    case "setReadingOptions":
      return withSettings(s, { reading: merged(s.settings.reading, a.options, SETTINGS.reading) });
    case "setLatency":
      return withSettings(s, { latencyMs: sanitizeLatency(a.ms), latencyCalibrated: true });
    case "setLatencyCalibrated":
      return withSettings(s, { latencyCalibrated: true });
    case "setTransport":
      return a.transport === s.transport ? s : { ...s, transport: a.transport };
    case "setCalibrating":
      return a.on === s.calibrating ? s : { ...s, calibrating: a.on };
    case "setPage":
      return a.page === s.page ? s : { ...s, page: a.page };
  }
}
