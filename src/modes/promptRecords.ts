// Recording drill prompts, shared by the drill modes: each prompt is timed from when it's shown and recorded once,
// when it's answered, or when it's skipped before being answered (a new prompt from a settings change isn't a skip).
import type { Judged } from "../exercises/judging";
import type { Recorder } from "../progress/recorder";
import type { RecordBody } from "../progress/records";

export interface PromptRecords<S> {
  /** The prompt is (back) on screen or sounding from now: time the answer from here */
  shown(): void;
  /** After each change of state (`skipped` for a skip): records the prompt if it was just answered or skipped, and
   *  starts timing a new one */
  changed(prev: S, now: S, skipped: boolean): void;
}

/** `body` makes the record from the state holding the prompt (`answered` false: skipped) and the time taken */
export function createPromptRecords<S extends Judged<unknown>>(
  recorder: Recorder,
  body: (s: S, answered: boolean, ms: number) => RecordBody,
): PromptRecords<S> {
  let shownAt = Date.now();
  return {
    shown() {
      shownAt = Date.now();
    },
    changed(prev, now, skipped) {
      if (now.status === "correct" && prev.status !== "correct") recorder.record(body(now, true, Date.now() - shownAt));
      else if (skipped && prev.status !== "correct") recorder.record(body(prev, false, Date.now() - shownAt));
      if (now.prompt !== prev.prompt) shownAt = Date.now();
    },
  };
}
