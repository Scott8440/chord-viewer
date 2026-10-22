// Latency calibration, run from the metronome options: listens to the player tapping along to the click (exercises
// ignore those notes meanwhile) and sets the latency from the result. See src/timing/calibration.ts.
import { addTap, CALIBRATION_TAPS, CALIBRATION_WARMUP, calibrationResult, measured, startCalibration, type CalibrationResult } from "../timing/calibration";
import type { AppStore } from "./performance";

export type CalibrationProgress =
  | { kind: "listening"; warmupLeft: number; measured: number }
  | { kind: "done"; result: CalibrationResult }
  /** The metronome stopped (turned off, or another mode) */
  | { kind: "cancelled" };

/** Starts listening; `progress` is told each step. Returns a function that cancels it. Needs the metronome running. */
export function startCalibrating(store: AppStore, progress: (p: CalibrationProgress) => void): () => void {
  let cal = startCalibration();
  store.dispatch({ type: "setCalibrating", on: true });
  progress({ kind: "listening", warmupLeft: CALIBRATION_WARMUP, measured: 0 });

  let unsubscribe = () => {};
  function finish() {
    unsubscribe();
    store.dispatch({ type: "setCalibrating", on: false });
  }
  unsubscribe = store.subscribe((s, prev) => {
    if (!s.transport) { finish(); progress({ kind: "cancelled" }); return; }
    if (s.history === prev.history) return;
    const event = s.history[s.history.length - 1];
    if (event.type !== "noteOn") return;
    cal = addTap(cal, s.transport, event.time);
    const result = calibrationResult(cal);
    if (!result) {
      progress({ kind: "listening", warmupLeft: Math.max(0, CALIBRATION_WARMUP - cal.offsets.length), measured: measured(cal).length });
      return;
    }
    finish();
    // Only a steady result is applied; a scattered one is reported so the player can try again
    if (result.steady) store.dispatch({ type: "setLatency", ms: result.latencyMs });
    progress({ kind: "done", result });
  });
  return finish;
}
