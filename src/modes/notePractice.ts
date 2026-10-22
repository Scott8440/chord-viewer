// Note practice mode: asks for a note, judges each note-on, and moves on after a correct answer.
import {
  initialNotePractice, makeNotePrompt, reduceNotePractice,
  type NotePracticeAction, type NotePracticeState, type Rng,
} from "../exercises/notePractice";
import type { AppAction, AppState } from "../state/app";
import type { Store } from "../state/store";
import type { NoteListView } from "../views/noteList";
import { notePracticeDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, type Mode } from "./performance";

/** How long "✓ Correct" stays up before the next prompt */
const NEXT_PROMPT_MS = 700;

export function startNotePractice(store: Store<AppState, AppAction>, views: {
  staff: StaffView; noteList: NoteListView; practice: PracticeView;
}, rng: Rng = Math.random): Mode {
  // Exercises don't use the header key; notes are spelled as a sharp or a flat at random
  const drawer = createPerformanceDrawer(store, views, () => null);
  let state: NotePracticeState = initialNotePractice(makeNotePrompt(rng, null));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;

  function apply(action: NotePracticeAction) {
    const prev = state;
    state = reduceNotePractice(state, action);
    if (state === prev) return;
    views.practice.render(notePracticeDisplay(state, null));
    clearTimeout(nextTimer);
    if (state.status === "correct") {
      nextTimer = setTimeout(() => apply({ type: "next", prompt: makeNotePrompt(rng, null, state.prompt) }), NEXT_PROMPT_MS);
    }
  }

  const unsubscribe = store.subscribe((s, prev) => {
    // Judge each new note-on; the history gains exactly one event per input dispatch
    if (s.history !== prev.history) {
      const event = s.history[s.history.length - 1];
      if (event?.type === "noteOn") apply({ type: "play", note: event.note });
    }
    if (s.perf !== prev.perf || s.settings !== prev.settings) drawer.schedule();
  });

  views.practice.render(notePracticeDisplay(state, null));
  drawer.schedule();

  return {
    stop() {
      unsubscribe();
      drawer.cancel();
      clearTimeout(nextTimer);
    },
    skip() {
      apply({ type: "skip", prompt: makeNotePrompt(rng, null, state.prompt) });
    },
  };
}
