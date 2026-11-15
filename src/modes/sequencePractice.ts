// Prescriptive exercise mode, shared by every exercise in PRESCRIPTIVE (scales, diatonic chords …): runs the
// exercise built from the current options, judges note-ons and held keys with their times, and measures each run.
// With a progression (the Then option), a finished run moves the exercise on to the next key (round the circle,
// chromatically or at random), showing how the last key went until the next one starts; Skip moves on too.
import { nextKey } from "../exercises/keyOrder";
import { PRESCRIPTIVE, type PrescriptiveId } from "../exercises/prescriptive";
import { initialSequence, reduceSequence, type RunResult, type SequenceAction, type SequenceState } from "../exercises/sequence";
import { noRecorder, type Recorder } from "../progress/recorder";
import { runBody } from "../progress/records";
import { buildKey } from "../theory";
import type { CircleView } from "../views/circleOfFifths";
import { progressingDisplay, sequenceDisplay, type PracticeView } from "../views/practice";
import { exerciseRow } from "../views/exerciseRow";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, heldNotes, onPlayerInput, onTimingGrid, timingGrid, type AppStore, type Mode } from "./performance";

export function startSequencePractice({ store, views, id, recorder = noRecorder }: {
  store: AppStore; views: { staff: StaffView; practice: PracticeView; circle: CircleView };
  /** Which exercise it runs */
  id: PrescriptiveId; recorder?: Recorder;
}): Mode {
  const build = () => PRESCRIPTIVE[id].build(store.getState().settings.exercise);
  let state: SequenceState = initialSequence(build(), heldNotes(store.getState()), timingGrid(store.getState()));
  // The staff shows the notes to play, a page at a time, in the exercise's key (exercises never use the header key)
  const drawer = createPerformanceDrawer(store, views, () => buildKey(state.exercise.keyValue), () => exerciseRow(state));

  /** The key just finished (shown until the next one starts), and the keys played this session */
  let previous: { title: string; result: RunResult } | null = null;
  let played = 0, clean = 0;
  /** Set while this mode itself moves the key on, so the settings change isn't taken for the player's */
  let advancing = false;
  /** Once stopped, a key change queued by the last run must not land on the next mode */
  let stopped = false;
  const progressing = () => store.getState().settings.exercise.progression !== "repeat";

  /** On to the next key in the progression (it becomes the exercise's Key, so the picker follows) */
  function advance() {
    if (stopped) return;
    const o = store.getState().settings.exercise;
    advancing = true;
    store.dispatch({ type: "setExerciseOptions", options: { key: nextKey(o.key, o.progression) } });
    advancing = false;
  }

  const render = () => {
    const display = sequenceDisplay(state, store.getState().settings.promptStyle);
    views.practice.render(progressing() ? progressingDisplay(display, state, previous, played, clean) : display);
    views.circle.render({ keyValue: state.exercise.keyValue });
  };
  function apply(action: SequenceAction) {
    const prev = state;
    state = reduceSequence(state, action);
    if (state === prev) return;
    if (state.status === "done" && prev.status !== "done") {
      const { exercise, latencyMs } = store.getState().settings;
      recorder.record(runBody(id, state.exercise, exercise, latencyMs, state.result!));
      if (progressing()) {
        previous = { title: state.exercise.title, result: state.result! };
        played++;
        if (!state.result!.mistakes) clean++;
        // After this action has finished: the new key arrives as a settings change
        queueMicrotask(advance);
      }
    }
    // The next key's first note: its predecessor's result has had its moment
    if (state.status === "playing" && prev.status !== "playing") previous = null;
    render();
    drawer.schedule();
  }

  const offInput = onPlayerInput(store, {
    noteOn: (note, time) => apply({ type: "noteOn", note, time }),
    held: (notes, time) => apply({ type: "held", notes, time }),
  });
  const offGrid = onTimingGrid(store, grid => apply({ type: "setGrid", grid }));
  const offSettings = store.subscribe((s, prev) => {
    // Different options make a different exercise (and a fresh set of runs); the prompt style only changes the display
    if (s.settings.exercise !== prev.settings.exercise) {
      // The player picking another key or option starts afresh, without the last key's result
      if (!advancing) previous = null;
      apply({ type: "setExercise", exercise: build() });
      // An option that doesn't change the exercise (Then, say) still changes what the panel says
      render();
    }
    if (s.settings.promptStyle !== prev.settings.promptStyle) render();
  });
  render();

  return {
    stop() {
      stopped = true;
      offInput();
      offGrid();
      offSettings();
      drawer.stop();
    },
    // With a progression, on to the next key; else start the run over
    skip: () => {
      if (!progressing()) { apply({ type: "restart" }); return; }
      previous = null;
      advance();
    },
  };
}
