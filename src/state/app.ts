// Whole-app state: the performance, a history of recent input events, and user settings.
import type { InputEvent } from "../input/events";
import { buildKey, type KeyContext } from "../theory";
import { initialPerformance, reducePerformance, type PerformanceState } from "./performance";

export const HISTORY_LIMIT = 512;

export const MODES = ["free", "notes"] as const;
export type ModeId = typeof MODES[number];

export interface Settings {
  /** Key selector value, e.g. "C:major", or "" for none */
  readonly keyValue: string;
  readonly key: KeyContext | null;
  /** Whether pedal-held notes count toward the chord */
  readonly includeSustained: boolean;
  /** Active mode: free play or an exercise */
  readonly mode: ModeId;
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
  | { type: "setMode"; mode: ModeId };

export function createAppState(keyValue = "", includeSustained = true, mode: ModeId = "free"): AppState {
  return {
    perf: initialPerformance,
    history: [],
    settings: { keyValue, key: buildKey(keyValue), includeSustained, mode },
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
  }
}
