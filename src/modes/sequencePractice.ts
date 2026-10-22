// Prescriptive exercise mode, shared by every exercise in PRESCRIPTIVE (scales, diatonic chords …): runs the
// exercise built from the current options, judges note-ons and held keys with their times, and measures each run.
import { PRESCRIPTIVE, type PrescriptiveId } from "../exercises/prescriptive";
import { initialSequence, reduceSequence, type SequenceAction, type SequenceState } from "../exercises/sequence";
import { buildKey } from "../theory";
import type { NoteListView } from "../views/noteList";
import type { CircleView } from "../views/circleOfFifths";
import { sequenceDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, heldNotes, onPlayerInput, type AppStore, type Mode } from "./performance";

export function startSequencePractice(store: AppStore, views: {
  staff: StaffView; noteList: NoteListView; practice: PracticeView; circle: CircleView;
}, id: PrescriptiveId): Mode {
  const build = () => PRESCRIPTIVE[id].build(store.getState().settings.exercise);
  let state: SequenceState = initialSequence(build(), heldNotes(store.getState()));
  // The staff follows the exercise's key (exercises never use the header key)
  const drawer = createPerformanceDrawer(store, views, () => buildKey(state.exercise.keyValue));

  const render = () => {
    views.practice.render(sequenceDisplay(state, store.getState().settings.promptStyle));
    views.circle.render({ keyValue: state.exercise.keyValue });
  };
  function apply(action: SequenceAction) {
    const prev = state;
    state = reduceSequence(state, action);
    if (state === prev) return;
    render();
    if (state.exercise !== prev.exercise) drawer.schedule();
  }

  const offInput = onPlayerInput(store, {
    noteOn: (note, time) => apply({ type: "noteOn", note, time }),
    held: (notes, time) => apply({ type: "held", notes, time }),
  });
  const offSettings = store.subscribe((s, prev) => {
    // Different options make a different exercise (and a fresh set of runs); the prompt style only changes the display
    if (s.settings.exercise !== prev.settings.exercise) apply({ type: "setExercise", exercise: build() });
    if (s.settings.promptStyle !== prev.settings.promptStyle) render();
  });
  render();

  return {
    stop() {
      offInput();
      offSettings();
      drawer.stop();
    },
    skip: () => apply({ type: "restart" }),
  };
}
