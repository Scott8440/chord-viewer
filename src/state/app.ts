// Whole-app state: the performance, a history of recent input events, and user settings.
import { DEFAULT_CHORD_TYPES, sanitizeChordTypes, type PromptStyle } from "../exercises/chordPractice";
import type { InputEvent } from "../input/events";
import { buildKey, type KeyContext } from "../theory";
import { initialPerformance, reducePerformance, type PerformanceState } from "./performance";

export const HISTORY_LIMIT = 512;

export const MODES = ["free", "notes", "chords", "progressions"] as const;
export type ModeId = typeof MODES[number];

export interface Settings {
  /** Key selector value, e.g. "C:major", or "" for none */
  readonly keyValue: string;
  readonly key: KeyContext | null;
  /** Whether pedal-held notes count toward the chord */
  readonly includeSustained: boolean;
  /** Active mode: free play or an exercise */
  readonly mode: ModeId;
  /** Chord template ids that chord practice may ask for */
  readonly chordTypes: readonly string[];
  /** Chord practice prompts: chord names or Roman numerals */
  readonly promptStyle: PromptStyle;
  /** Chord practice asks for a specific inversion */
  readonly inversions: boolean;
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
  | { type: "setInversions"; on: boolean };

export function createAppState(keyValue = "", includeSustained = true, mode: ModeId = "free",
                               chordTypes: readonly string[] = DEFAULT_CHORD_TYPES, promptStyle: PromptStyle = "names",
                               inversions = false): AppState {
  return {
    perf: initialPerformance,
    history: [],
    settings: { keyValue, key: buildKey(keyValue), includeSustained, mode, chordTypes: sanitizeChordTypes(chordTypes), promptStyle, inversions },
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
  }
}
