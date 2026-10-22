// Scale practice mode: a repeatable scale exercise, judged note-on by note-on, with each run measured.
import { scaleExercise } from "../exercises/scales";
import { initialSequence, reduceSequence, type SequenceAction, type SequenceState } from "../exercises/sequence";
import type { AppAction, AppState } from "../state/app";
import type { Store } from "../state/store";
import { buildKey } from "../theory";
import type { NoteListView } from "../views/noteList";
import { sequenceDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, type Mode } from "./performance";

/** The scale to play, chosen in the exercise itself (exercises never use the header key) */
const scaleKey = (s: AppState) => buildKey(s.settings.scaleKey)!;
const exerciseFor = (s: AppState) => scaleExercise(scaleKey(s), s.settings.minorForm, s.settings.scaleOctaves);

export function startScalePractice(store: Store<AppState, AppAction>, views: {
  staff: StaffView; noteList: NoteListView; practice: PracticeView;
}): Mode {
  // The staff follows the scale's key
  const drawer = createPerformanceDrawer(store, views, () => scaleKey(store.getState()));
  let state: SequenceState = initialSequence(exerciseFor(store.getState()));

  const render = () => views.practice.render(sequenceDisplay(state, scaleKey(store.getState())));
  function apply(action: SequenceAction) {
    const prev = state;
    state = reduceSequence(state, action);
    if (state !== prev) render();
  }

  const unsubscribe = store.subscribe((s, prev) => {
    // Judge each new note-on, with the time it was played; the history gains one event per input dispatch
    if (s.history !== prev.history) {
      const event = s.history[s.history.length - 1];
      if (event?.type === "noteOn") apply({ type: "noteOn", note: event.note, time: event.time });
    }
    // A different key, minor form or length is a different exercise (and a fresh set of runs)
    if (s.settings !== prev.settings) apply({ type: "setExercise", exercise: exerciseFor(s) });
    if (s.perf !== prev.perf || s.settings !== prev.settings) drawer.schedule();
  });

  render();
  drawer.schedule();

  return {
    stop() {
      unsubscribe();
      drawer.cancel();
    },
    skip: () => apply({ type: "restart" }),
  };
}
