// Prescriptive exercises: an exact sequence of steps, played in order. Each step is either a single note (judged
// note-on by note-on, octave included) or a chord (judged from the held keys, like chord practice).
// Repeatable: the same exercise can be run again and again, and each run is measured.
// Pure data and functions; exercises are built from it in scales.ts and diatonicChords.ts.
import { freshAttempt, trackAttempt, type ChordAttempt } from "./chordAttempt";
import { isChord, type ChordPrompt } from "./chordPractice";

export interface NoteStep {
  kind: "note";
  /** Semitones above the exercise's base pitch class, in the octave the run is played in */
  offset: number;
  /** Spelled note name, e.g. "F#" */
  name: string;
}

export interface ChordStep {
  kind: "chord";
  /** The chord to play: any voicing, or a required bass if `chord.inversion` is set */
  chord: ChordPrompt;
}

export type SequenceStep = NoteStep | ChordStep;

/** An exercise; `S` narrows the kind of steps (a scale is all note steps, diatonic chords all chord steps). */
export interface SequenceExercise<S extends SequenceStep = SequenceStep> {
  /** Identifies the exercise and its settings, e.g. "scale:C:major::1" */
  id: string;
  title: string;
  /** Instruction shown above the exercise */
  instruction: string;
  /** Note steps' offsets count from this pitch class; the first note step played sets the octave of the run */
  basePc: number;
  /** Key the exercise is in, e.g. "C:major": for spelling and the staff's key signature */
  keyValue: string;
  steps: readonly S[];
}

export interface RunResult {
  mistakes: number;
  /** First step to last step */
  durationMs: number;
  /** Average tempo, counting each step as one beat */
  bpm: number;
  /** 1 = perfectly even gaps between steps; 1 minus the coefficient of variation of the gaps, floored at 0 */
  evenness: number;
}

export type WrongStep =
  /** A wrong note; `expected` is null when the run's octave is not known yet */
  | { kind: "note"; expected: number | null; played: number }
  /** A chord attempt that never formed the chord */
  | { kind: "chord"; notes: number[] };

export interface SequenceState {
  exercise: SequenceExercise;
  /** ready: waiting for the first step; playing: a run is in progress; done: the last run finished */
  status: "ready" | "playing" | "done";
  /** MIDI note of the base pitch class in the octave of the run, once a note step has been played */
  anchor: number | null;
  /** Index of the next step to play */
  index: number;
  mistakes: number;
  /** The last attempt at the current step was wrong */
  lastWrong: WrongStep | null;
  /** Something other than the first step was played while waiting to start */
  startHint: boolean;
  /** The chord attempt in progress (see chordAttempt.ts) */
  tracker: ChordAttempt;
  /** Times the steps of the current run were completed */
  times: number[];
  /** Result of the last finished run */
  result: RunResult | null;
  /** All finished runs of this exercise, oldest first */
  runs: RunResult[];
}

export type SequenceAction =
  | { type: "noteOn"; note: number; time: number }
  /** The keys currently held changed (MIDI numbers, low to high) */
  | { type: "held"; notes: number[]; time: number }
  | { type: "restart" }
  | { type: "setExercise"; exercise: SequenceExercise };

export function initialSequence(exercise: SequenceExercise, held: number[] = []): SequenceState {
  return { exercise, status: "ready", anchor: null, index: 0, mistakes: 0, lastWrong: null, startHint: false,
           tracker: freshAttempt(held), times: [], result: null, runs: [] };
}

/** The step being waited for: the next one in a run, or the first one before a run starts. */
export const currentStep = (s: SequenceState): SequenceStep => s.exercise.steps[s.status === "playing" ? s.index : 0];

export function reduceSequence(s: SequenceState, a: SequenceAction): SequenceState {
  switch (a.type) {
    case "noteOn": {
      const step = currentStep(s);
      if (step.kind !== "note") return s;    // chord steps are judged from the held keys
      const anchor = s.status === "playing" ? s.anchor : null;
      const ok = anchor != null
        ? a.note === anchor + step.offset
        // No octave yet: the right pitch class in any octave sets it
        : (a.note - step.offset - s.exercise.basePc) % 12 === 0;
      // The note just played is still down: if a chord step comes next, it is not part of that chord's attempt
      if (ok) return advance({ ...s, tracker: freshAttempt([...new Set([...s.tracker.prevHeld, a.note])]) },
                             a.time, anchor ?? a.note - step.offset);
      if (s.status !== "playing") return s.startHint ? s : { ...s, startHint: true };
      return { ...s, mistakes: s.mistakes + 1,
               lastWrong: { kind: "note", expected: anchor == null ? null : anchor + step.offset, played: a.note } };
    }
    case "held": {
      const step = currentStep(s);
      // Keep the chord tracker in step with the keys even while note steps are being played
      if (step.kind !== "chord") return { ...s, tracker: freshAttempt(a.notes) };
      const { attempt: tracker, outcome } = trackAttempt(s.tracker, a.notes, notes => isChord(notes, step.chord));
      if (outcome.kind === "match") return advance({ ...s, tracker }, a.time, s.anchor);
      if (outcome.kind === "miss") {
        if (s.status !== "playing") return { ...s, tracker, startHint: true };
        return { ...s, tracker, mistakes: s.mistakes + 1, lastWrong: { kind: "chord", notes: outcome.notes } };
      }
      return { ...s, tracker };
    }
    case "restart":
      return { ...s, status: "ready", anchor: null, index: 0, mistakes: 0, lastWrong: null, startHint: false, times: [] };
    case "setExercise":
      return a.exercise.id === s.exercise.id ? s : initialSequence(a.exercise, s.tracker.prevHeld);
  }
}

/** The current step was played at `time`: start a run, move on, or finish. */
function advance(s: SequenceState, time: number, anchor: number | null): SequenceState {
  const next: SequenceState = s.status === "playing"
    ? { ...s, anchor, index: s.index + 1, lastWrong: null, times: [...s.times, time] }
    // Start (or start again) with the first step
    : { ...s, status: "playing", anchor, index: 1, mistakes: 0, lastWrong: null, startHint: false, times: [time], result: null };
  if (next.index < s.exercise.steps.length) return next;
  const result = runResult(next.times, next.mistakes);
  return { ...next, status: "done", result, runs: [...next.runs, result] };
}

/** Tempo and evenness from the times of the steps of a run. */
export function runResult(times: readonly number[], mistakes: number): RunResult {
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const durationMs = times.length ? times[times.length - 1] - times[0] : 0;
  if (!gaps.length) return { mistakes, durationMs, bpm: 0, evenness: 1 };
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  return { mistakes, durationMs, bpm: mean > 0 ? 60000 / mean : 0, evenness: mean > 0 ? Math.max(0, 1 - sd / mean) : 1 };
}

/** Best run so far: fewest mistakes, then most even. */
export function bestRun(runs: readonly RunResult[]): RunResult | null {
  return runs.reduce<RunResult | null>((best, r) =>
    !best || r.mistakes < best.mistakes || (r.mistakes === best.mistakes && r.evenness > best.evenness) ? r : best, null);
}
