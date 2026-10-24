// The notes an exercise expects, for the staff: a page of steps at a time (the page with the step being played),
// played steps green, the current one amber (red after a wrong attempt). Note steps sit in the octave the run is
// played in once it's begun, else in one near the staves; chord steps in root position, close, above their root.
import { Interval, Note } from "tonal";
import type { SequenceState, SequenceStep } from "../exercises/sequence";
import { templateById } from "../theory";
import type { StaffRow } from "./staff";

/** Steps on the staff at once */
export const PAGE_STEPS = 16;
/** Before a run sets the octave: the exercise's lowest note no lower than this, and its highest no higher than TOP */
const BOTTOM = 55, TOP = 84;

/** Where the base pitch class sits: the run's octave, or the one keeping the exercise between BOTTOM and TOP */
function anchorOf(state: SequenceState): number {
  if (state.anchor != null) return state.anchor;
  const { basePc, steps } = state.exercise;
  const offsets = steps.flatMap(s => s.kind === "note" ? [s.offset] : []);
  const high = offsets.length ? Math.max(...offsets) : 12;
  let anchor = 60 + basePc;
  if (anchor + high > TOP) anchor -= 12;
  if (anchor + (offsets.length ? Math.min(...offsets) : 0) < BOTTOM) anchor += 12;
  return anchor;
}

/** A step's notes: MIDI and spelled names */
function stepNotes(step: SequenceStep, anchor: number, basePc: number): { midi: number[]; names: string[] } {
  if (step.kind === "note") return { midi: [anchor + step.offset], names: [step.name] };
  const { root, rootPc, type } = step.chord;
  const rootMidi = anchor + ((rootPc - basePc + 12) % 12);
  const intervals = (templateById(type)?.tones ?? "1P 3M 5P").replace(/[()]/g, "").split(/\s+/).filter(Boolean);
  return {
    midi: intervals.map(i => rootMidi + (Interval.semitones(i) ?? 0)),
    names: intervals.map(i => Note.pitchClass(Note.transpose(root, i))),
  };
}

export function exerciseRow(state: SequenceState): StaffRow {
  const { steps, basePc } = state.exercise;
  const anchor = anchorOf(state);
  // The page with the step being played (the last page once the run is done)
  const current = Math.min(state.index, steps.length - 1);
  const from = Math.floor(current / PAGE_STEPS) * PAGE_STEPS;
  const done = state.status === "done";
  return {
    notes: steps.slice(from, from + PAGE_STEPS).map((step, k) => {
      const i = from + k;
      const style = done || i < state.index ? "done" as const
        : i === state.index ? (state.lastWrong ? "wrong" as const : "current" as const) : undefined;
      return { ...stepNotes(step, anchor, basePc), style };
    }),
    slots: PAGE_STEPS,
    heldAt: null,
    duration: "q",
  };
}
