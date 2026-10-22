// Progression practice mode: asks for a progression, judges the held keys chord by chord,
// and starts a new progression after the last chord.
import {
  initialProgression, makeProgressionPrompt, reduceProgression,
  type ProgressionAction, type ProgressionState,
} from "../exercises/progressions";
import type { Rng } from "../exercises/notePractice";
import type { AppAction, AppState } from "../state/app";
import type { Store } from "../state/store";
import type { NoteListView } from "../views/noteList";
import { progressionDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, type Mode } from "./performance";

/** How long "✓ Progression complete" stays up before the next progression */
const NEXT_PROGRESSION_MS = 1200;

const heldNotes = (s: AppState) => [...s.perf.held.keys()].sort((a, b) => a - b);

export function startProgressionPractice(store: Store<AppState, AppAction>, views: {
  staff: StaffView; noteList: NoteListView; practice: PracticeView;
}, rng: Rng = Math.random): Mode {
  const drawer = createPerformanceDrawer(store, views);
  const settings = () => store.getState().settings;
  const newPrompt = (previous?: ProgressionState["prompt"]) => makeProgressionPrompt(rng, settings().key, previous);
  let state: ProgressionState = initialProgression(newPrompt(), heldNotes(store.getState()));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;

  const render = () => views.practice.render(progressionDisplay(state, settings().promptStyle));

  function apply(action: ProgressionAction) {
    const prev = state;
    state = reduceProgression(state, action);
    if (state === prev) return;
    render();
    if (state.status === "done" && prev.status !== "done") {
      clearTimeout(nextTimer);
      nextTimer = setTimeout(() => apply({ type: "next", prompt: newPrompt(state.prompt) }), NEXT_PROGRESSION_MS);
    }
  }

  function restart() {
    clearTimeout(nextTimer);
    apply({ type: "next", prompt: newPrompt(state.prompt) });
  }

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.perf.held !== prev.perf.held) {
      const now = heldNotes(s);
      if (now.join() !== heldNotes(prev).join()) apply({ type: "held", notes: now });
    }
    // A new key needs a new progression; the prompt style only changes how it is shown
    if (s.settings.key !== prev.settings.key) {
      restart();
    } else if (s.settings.promptStyle !== prev.settings.promptStyle) {
      render();
    }
    if (s.perf !== prev.perf || s.settings !== prev.settings) drawer.schedule();
  });

  render();
  drawer.schedule();

  return {
    stop() {
      unsubscribe();
      drawer.cancel();
      clearTimeout(nextTimer);
    },
    skip: restart,
  };
}
