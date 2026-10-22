// Timing judgement against the transport: the grid of slots a timed exercise is played on (one step per slot), and
// how early or late each step was. Pure.
import { beatAt, beatMs, timeOfBeat, type Transport } from "./transport";

/** Steps per beat: quarters, eighths or sixteenths */
export const SUBDIVISIONS = [1, 2, 4] as const;
export type Subdivision = typeof SUBDIVISIONS[number];

export const STRICTNESS = ["strict", "loose"] as const;
export type Strictness = typeof STRICTNESS[number];
/** How far from the slot still counts as on time (capped by slot length, see `windowMs`) */
export const WINDOW_MS: Record<Strictness, number> = { strict: 50, loose: 80 };

export interface TimingGrid {
  transport: Transport;
  subdivision: Subdivision;
  strictness: Strictness;
  /** Taken off every note time first: how long the player's notes take to arrive after they hear the click */
  latencyMs: number;
}

export interface StepTiming {
  /** The slot (counted in subdivisions from beat 0) the step landed on */
  slot: number;
  /** Ms after (+) or before (−) that slot */
  offsetMs: number;
  /** Slots away from where the step was due (0: on its slot; 1: a whole slot late, e.g. after a stumble) */
  slipped: number;
}

export type TimingVerdict = "onTime" | "early" | "late";

/** Length of a slot in ms. */
export const slotMs = (g: TimingGrid): number => beatMs(g.transport) / g.subdivision;

/** The on-time window, ± ms: the strictness's, but never more than 40% of a slot (so fast sixteenths stay distinct). */
export const windowMs = (g: TimingGrid): number => Math.min(WINDOW_MS[g.strictness], slotMs(g) * 0.4);

/**
 * Times a step played at `time`. It belongs to the nearest slot; it was due on the slot after the previous step's
 * (or, for the first step, on whichever slot is nearest: a run may start on any slot). A step that lands on another
 * slot has slipped, and later steps are due after it, so one stumble doesn't make the rest of the run late.
 */
export function judgeTime(g: TimingGrid, time: number, previousSlot: number | null): StepTiming {
  const t = time - g.latencyMs;
  const slot = Math.round(beatAt(g.transport, t) * g.subdivision);
  return {
    slot,
    offsetMs: t - timeOfBeat(g.transport, slot / g.subdivision),
    slipped: previousSlot == null ? 0 : slot - (previousSlot + 1),
  };
}

export function timingVerdict(g: TimingGrid, st: StepTiming): TimingVerdict {
  if (st.slipped) return st.slipped > 0 ? "late" : "early";
  return Math.abs(st.offsetMs) <= windowMs(g) ? "onTime" : st.offsetMs < 0 ? "early" : "late";
}

export interface TimingSummary {
  /** Share of steps on time, 0–1 */
  onTime: number;
  /** Average ms off the slot over steps that landed on their own slot: + dragging, − rushing */
  meanOffsetMs: number;
  /** Standard deviation of those offsets: how steady */
  spreadMs: number;
  /** Steps that landed a whole slot or more away from where they were due */
  slips: number;
  /** The grid's tempo and subdivision, for showing which settings the run was played at */
  bpm: number;
  subdivision: Subdivision;
}

export function timingSummary(g: TimingGrid, timings: readonly StepTiming[]): TimingSummary {
  const onSlot = timings.filter(t => !t.slipped).map(t => t.offsetMs);
  const mean = onSlot.length ? onSlot.reduce((a, b) => a + b, 0) / onSlot.length : 0;
  const spread = onSlot.length ? Math.sqrt(onSlot.reduce((a, o) => a + (o - mean) ** 2, 0) / onSlot.length) : 0;
  return {
    onTime: timings.length ? timings.filter(t => timingVerdict(g, t) === "onTime").length / timings.length : 1,
    meanOffsetMs: mean, spreadMs: spread,
    slips: timings.filter(t => t.slipped).length,
    bpm: g.transport.bpm, subdivision: g.subdivision,
  };
}
