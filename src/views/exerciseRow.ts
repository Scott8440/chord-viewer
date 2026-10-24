// The notes an exercise expects, for the staff: a page of steps at a time (the page with the step being played),
// played steps green, the current one amber (red after a wrong attempt). Note steps sit in the octave the run is
// played in once it's begun; before that, in the octave the player last played in (the last run, or the routine's
// last item), so a routine doesn't jump between staves from key to key; failing that, near the staves. Chord steps
// in root position, close, above their root.
import { Interval, Note } from "tonal";
import type { SequenceState, SequenceStep } from "../exercises/sequence";
import { templateById } from "../theory";
import type { StaffRow } from "./staff";

/** Steps on the staff at once */
export const PAGE_STEPS = 16;
/** Before a run sets the octave: the exercise's lowest note no lower than this, and its highest no higher than TOP */
const BOTTOM = 55, TOP = 84;

/** The pitch class `pc` in the same octave (C to B) as the note `near`: C4 then G gives G4, as a player keeping
 *  each key's scale in one octave plays it */
export const inOctaveOf = (pc: number, near: number) => Math.floor(near / 12) * 12 + pc;

/** Where the base pitch class sits: the run's octave; else the octave the player last played in (`near`, the base
 *  pitch of their last run); else the octave keeping the exercise between BOTTOM and TOP */
function anchorOf(state: SequenceState, near: number | null): number {
  if (state.anchor != null) return state.anchor;
  const { basePc, steps } = state.exercise;
  if (near != null && steps.some(s => s.kind === "note")) return inOctaveOf(basePc, near);
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

export function exerciseRow(state: SequenceState, near: number | null = null): StaffRow {
  const { steps, basePc } = state.exercise;
  const anchor = anchorOf(state, near);
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
