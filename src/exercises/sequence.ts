// Prescriptive exercises: an exact sequence of notes, played in order, judged note-on by note-on.
// Repeatable: the same exercise can be run again and again, and each run is measured.
// Pure data and functions; scales are the first exercise built on it (see scales.ts).

export interface SequenceStep {
  /** Semitones above the first note of the run */
  offset: number;
  /** Spelled note name, e.g. "F#" */
  name: string;
}

export interface SequenceExercise {
  /** Identifies the exercise and its settings, e.g. "scale:C:major:1" */
  id: string;
  title: string;
  /** Instruction shown above the exercise */
  instruction: string;
  /** The first step must be this pitch class; the octave it is played in sets the octave of the run */
  startPc: number;
  steps: readonly SequenceStep[];
}

export interface RunResult {
  mistakes: number;
  /** First note to last note */
  durationMs: number;
  /** Average tempo, counting each note as one beat */
  bpm: number;
  /** 1 = perfectly even gaps between notes; 1 minus the coefficient of variation of the gaps, floored at 0 */
  evenness: number;
}

export interface SequenceState {
  exercise: SequenceExercise;
  /** ready: waiting for the first note; playing: a run is in progress; done: the last run finished */
  status: "ready" | "playing" | "done";
  /** MIDI note the run started on */
  anchor: number | null;
  /** Index of the next step to play */
  index: number;
  mistakes: number;
  /** The last note played was wrong: what was expected and what was played */
  lastWrong: { expected: number; played: number } | null;
  /** A note other than the starting note was played while waiting to start */
  startHint: boolean;
  /** Times of the correct notes in the current run */
  times: number[];
  /** Result of the last finished run */
  result: RunResult | null;
  /** All finished runs of this exercise, oldest first */
  runs: RunResult[];
}

export type SequenceAction =
  | { type: "noteOn"; note: number; time: number }
  | { type: "restart" }
  | { type: "setExercise"; exercise: SequenceExercise };

export function initialSequence(exercise: SequenceExercise): SequenceState {
  return { exercise, status: "ready", anchor: null, index: 0, mistakes: 0, lastWrong: null, startHint: false,
           times: [], result: null, runs: [] };
}

/** MIDI note expected at a step, once the run's octave is known. */
export const expectedNote = (s: SequenceState, index = s.index) => s.anchor! + s.exercise.steps[index].offset;

export function reduceSequence(s: SequenceState, a: SequenceAction): SequenceState {
  switch (a.type) {
    case "noteOn": {
      if (s.status !== "playing") {
        // Start (or start again) on the first note, in any octave
        if (a.note % 12 !== s.exercise.startPc) return s.startHint ? s : { ...s, startHint: true };
        const started: SequenceState = { ...s, status: "playing", anchor: a.note, index: 1, mistakes: 0, lastWrong: null,
                                         startHint: false, times: [a.time], result: null };
        return started.index === s.exercise.steps.length ? finish(started) : started;
      }
      const expected = expectedNote(s);
      if (a.note !== expected) return { ...s, mistakes: s.mistakes + 1, lastWrong: { expected, played: a.note } };
      const next = { ...s, index: s.index + 1, lastWrong: null, times: [...s.times, a.time] };
      return next.index === s.exercise.steps.length ? finish(next) : next;
    }
    case "restart":
      return { ...s, status: "ready", anchor: null, index: 0, mistakes: 0, lastWrong: null, startHint: false, times: [] };
    case "setExercise":
      return a.exercise.id === s.exercise.id ? s : initialSequence(a.exercise);
  }
}

function finish(s: SequenceState): SequenceState {
  const result = runResult(s.times, s.mistakes);
  return { ...s, status: "done", result, runs: [...s.runs, result] };
}

/** Tempo and evenness from the times of the notes of a run. */
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
