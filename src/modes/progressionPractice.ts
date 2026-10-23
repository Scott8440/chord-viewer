// Progression practice mode: asks for a progression, judges the held keys chord by chord,
// and starts a new progression after the last chord.
import {
  initialProgression, makeProgressionPrompt, reduceProgression,
  type ProgressionAction, type ProgressionState,
} from "../exercises/progressions";
import type { Rng } from "../exercises/notePractice";
import { buildKey } from "../theory";
import { noRecorder, type Recorder } from "../progress/recorder";
import { progressionDrillBody } from "../progress/records";
import { progressionDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, heldNotes, onPlayerInput, type AppStore, type Mode } from "./performance";

/** How long "✓ Progression complete" stays up before the next progression */
const NEXT_PROGRESSION_MS = 1200;

export function startProgressionPractice(store: AppStore, views: {
  staff: StaffView; practice: PracticeView;
}, recorder: Recorder = noRecorder, rng: Rng = Math.random): Mode {
  // Exercises don't use the header key: each progression names its own (random) key
  const newPrompt = (previous?: ProgressionState["prompt"]) => makeProgressionPrompt(rng, null, previous);
  let state: ProgressionState = initialProgression(newPrompt(), heldNotes(store.getState()));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the current progression appeared, and the first-try count then, to judge this progression alone */
  let shownAt = Date.now(), firstTryBefore = state.chordsFirstTry;
  // The staff follows the progression's key
  const drawer = createPerformanceDrawer(store, views, () => buildKey(state.prompt.keyValue));

  const render = () => views.practice.render(progressionDisplay(state, store.getState().settings.promptStyle));

  function apply(action: ProgressionAction) {
    const prev = state;
    state = reduceProgression(state, action);
    if (state === prev) return;
    if (state.status === "done" && prev.status !== "done") {
      recorder.record(progressionDrillBody(state.prompt, true, state.chordsFirstTry - firstTryBefore, Date.now() - shownAt));
    }
    if (state.prompt !== prev.prompt) { shownAt = Date.now(); firstTryBefore = state.chordsFirstTry; }
    render();
    if (state.prompt !== prev.prompt) drawer.schedule();
    if (state.status === "done" && prev.status !== "done") {
      clearTimeout(nextTimer);
      nextTimer = setTimeout(() => apply({ type: "next", prompt: newPrompt(state.prompt) }), NEXT_PROGRESSION_MS);
    }
  }

  function restart() {
    clearTimeout(nextTimer);
    // Skipped part-way (or before starting)
    if (state.status !== "done") {
      recorder.record(progressionDrillBody(state.prompt, false, state.chordsFirstTry - firstTryBefore, Date.now() - shownAt));
    }
    apply({ type: "next", prompt: newPrompt(state.prompt) });
  }

  const offInput = onPlayerInput(store, { held: notes => apply({ type: "held", notes }) });
  // The prompt style only changes how the progression is shown
  const offSettings = store.subscribe((s, prev) => { if (s.settings.promptStyle !== prev.settings.promptStyle) render(); });
  render();

  return {
    stop() {
      offInput();
      offSettings();
      drawer.stop();
      clearTimeout(nextTimer);
    },
    skip: restart,
  };
}
