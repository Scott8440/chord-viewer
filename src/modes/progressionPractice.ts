// Progression practice mode: asks for a progression, judges the held keys chord by chord,
// and starts a new progression after the last chord.
import {
  initialProgression, makeProgressionPrompt, reduceProgression,
  type ProgressionAction, type ProgressionState,
} from "../exercises/progressions";
import type { Rng } from "../exercises/notePractice";
import { buildKey } from "../theory";
import type { NoteListView } from "../views/noteList";
import { progressionDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, heldNotes, onPlayerInput, type AppStore, type Mode } from "./performance";

/** How long "✓ Progression complete" stays up before the next progression */
const NEXT_PROGRESSION_MS = 1200;

export function startProgressionPractice(store: AppStore, views: {
  staff: StaffView; noteList: NoteListView; practice: PracticeView;
}, rng: Rng = Math.random): Mode {
  // Exercises don't use the header key: each progression names its own (random) key
  const newPrompt = (previous?: ProgressionState["prompt"]) => makeProgressionPrompt(rng, null, previous);
  let state: ProgressionState = initialProgression(newPrompt(), heldNotes(store.getState()));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  // The staff follows the progression's key
  const drawer = createPerformanceDrawer(store, views, () => buildKey(state.prompt.keyValue));

  const render = () => views.practice.render(progressionDisplay(state, store.getState().settings.promptStyle));

  function apply(action: ProgressionAction) {
    const prev = state;
    state = reduceProgression(state, action);
    if (state === prev) return;
    render();
    if (state.prompt !== prev.prompt) drawer.schedule();
    if (state.status === "done" && prev.status !== "done") {
      clearTimeout(nextTimer);
      nextTimer = setTimeout(() => apply({ type: "next", prompt: newPrompt(state.prompt) }), NEXT_PROGRESSION_MS);
    }
  }

  function restart() {
    clearTimeout(nextTimer);
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
