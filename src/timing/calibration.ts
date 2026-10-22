// Tap-along latency calibration: the player plays a note on each click, and the median distance from the beat
// becomes the latency offset. It covers everything between the click and the note's timestamp at once: how late the
// click is heard, how late MIDI arrives (loopMIDI), and the habit of playing a little ahead of a click. Pure.
import { judgeTime } from "./grid";
import type { Transport } from "./transport";

/** Taps at the start that settle the player in and aren't measured */
export const CALIBRATION_WARMUP = 4;
/** Taps measured after the warm-up */
export const CALIBRATION_TAPS = 12;
/** Taps further than this from the beat are strays (a missed click, a double tap) and don't count */
const STRAY_MS = 150;
/** Taps more spread than this (± ms, median absolute deviation) aren't steady enough to calibrate from */
const STEADY_MS = 25;

export interface Calibration {
  /** Every tap's distance from its nearest beat (ms, − early), warm-up included */
  offsets: number[];
}

export const startCalibration = (): Calibration => ({ offsets: [] });

/** A note played at `time`. The beats are the transport's; any existing latency setting is ignored. */
export function addTap(c: Calibration, transport: Transport, time: number): Calibration {
  const { offsetMs } = judgeTime({ transport, subdivision: 1, strictness: "strict", latencyMs: 0 }, time, null);
  return { offsets: [...c.offsets, offsetMs] };
}

/** Taps measured so far (not counting the warm-up or strays), out of CALIBRATION_TAPS */
export const measured = (c: Calibration): number[] =>
  c.offsets.slice(CALIBRATION_WARMUP).filter(o => Math.abs(o) <= STRAY_MS);

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface CalibrationResult {
  /** The offset to use as the latency setting (ms): + the player's notes arrive late, − early */
  latencyMs: number;
  /** How consistent the taps were (median absolute deviation, ms) */
  spreadMs: number;
  /** Consistent enough to trust */
  steady: boolean;
}

/** The result once enough taps are in, else null. */
export function calibrationResult(c: Calibration): CalibrationResult | null {
  const taps = measured(c);
  if (taps.length < CALIBRATION_TAPS) return null;
  const latencyMs = median(taps);
  const spreadMs = median(taps.map(t => Math.abs(t - latencyMs)));
  return { latencyMs: Math.round(latencyMs), spreadMs: Math.round(spreadMs), steady: spreadMs <= STEADY_MS };
}
