// Note practice mode: asks for a note, judges each note-on, and moves on after a correct answer.
import {
  initialNotePractice, makeNotePrompt, reduceNotePractice,
  type NotePracticeAction, type NotePracticeState, type Rng,
} from "../exercises/notePractice";
import { noRecorder, type Recorder } from "../progress/recorder";
import { noteDrillBody } from "../progress/records";
import { notePracticeDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, onPlayerInput, type AppStore, type Mode } from "./performance";

/** How long "✓ Correct" stays up before the next prompt */
const NEXT_PROMPT_MS = 700;

export function startNotePractice(store: AppStore, views: {
  staff: StaffView; practice: PracticeView;
}, recorder: Recorder = noRecorder, rng: Rng = Math.random): Mode {
  // Exercises don't use the header key; notes are spelled as a sharp or a flat at random
  const drawer = createPerformanceDrawer(store, views, () => null);
  let state: NotePracticeState = initialNotePractice(makeNotePrompt(rng, null));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the current prompt appeared, to time the answer */
  let shownAt = Date.now();

  function apply(action: NotePracticeAction) {
    const prev = state;
    state = reduceNotePractice(state, action);
    if (state === prev) return;
    // Answered, or skipped before being answered
    if (state.status === "correct" && prev.status !== "correct") {
      recorder.record(noteDrillBody(state.prompt, true, state.missed, Date.now() - shownAt));
    } else if (action.type === "skip" && prev.status !== "correct") {
      recorder.record(noteDrillBody(prev.prompt, false, prev.missed, Date.now() - shownAt));
    }
    if (state.prompt !== prev.prompt) shownAt = Date.now();
    views.practice.render(notePracticeDisplay(state, null));
    clearTimeout(nextTimer);
    if (state.status === "correct") {
      nextTimer = setTimeout(() => apply({ type: "next", prompt: makeNotePrompt(rng, null, state.prompt) }), NEXT_PROMPT_MS);
    }
  }

  const offInput = onPlayerInput(store, { noteOn: note => apply({ type: "play", note }) });
  views.practice.render(notePracticeDisplay(state, null));

  return {
    stop() {
      offInput();
      drawer.stop();
      clearTimeout(nextTimer);
    },
    skip() {
      apply({ type: "skip", prompt: makeNotePrompt(rng, null, state.prompt) });
    },
  };
}
