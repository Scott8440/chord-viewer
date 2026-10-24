// Routine mode: plays a routine's exercises one after another, moving on whenever an item's run finishes.
import { initialRoutine, itemExercise, keyProgress, reduceRoutine, routineById, type RoutineAction, type RoutineState } from "../exercises/routines";
import { noRecorder, toWallTime, uuid, type Recorder } from "../progress/recorder";
import { routineBody, runBody } from "../progress/records";
import { buildKey } from "../theory";
import type { CircleView } from "../views/circleOfFifths";
import { routineDisplay, type PracticeView } from "../views/practice";
import { exerciseRow } from "../views/exerciseRow";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, heldNotes, onPlayerInput, onTimingGrid, timingGrid, type AppStore, type Mode } from "./performance";

export function startRoutinePractice(store: AppStore, views: {
  staff: StaffView; practice: PracticeView; circle: CircleView;
}, recorder: Recorder = noRecorder): Mode {
  const fresh = (): RoutineState => {
    const s = store.getState();
    return initialRoutine(routineById(s.settings.routine.id)!, s.settings.routine.direction, s.settings.exercise, heldNotes(s),
                          timingGrid(s));
  };
  let state = fresh();
  /** Ties the session's run records to its routine record */
  let session = uuid();

  /** Records the session: when it finishes, or when it's left part-way (restart, another routine, another mode) */
  function recordRoutine() {
    if (state.startTime == null) return;   // nothing played
    const { routine, latencyMs } = store.getState().settings;
    const s = state;
    recorder.record(routineBody(s, session, routine.direction, latencyMs, i => itemExercise(s.items[i], s.base), toWallTime));
  }
  // The staff shows the notes of the item in progress, a page at a time, in its key
  const drawer = createPerformanceDrawer(store, views, () => buildKey(state.current.exercise.keyValue), () => exerciseRow(state.current));

  const render = () => {
    views.practice.render(routineDisplay(state, store.getState().settings.promptStyle));
    // The circle shows progress round it, with the key in progress highlighted
    const progress = keyProgress(state);
    const at = progress.findIndex(g => g.state === "current");
    views.circle.render({
      keyValue: state.status === "done" ? null : state.current.exercise.keyValue,
      neighbours: false,
      progress: Object.fromEntries(progress.map(g => [g.keyValue, g.state])),
      center: { text: state.status === "done" ? "Done" : `${at + 1} / ${progress.length}`,
                direction: store.getState().settings.routine.direction },
    });
  };
  function apply(action: RoutineAction) {
    const prev = state;
    state = reduceRoutine(state, action);
    if (state === prev) return;
    // An item's run finished: record it, as part of this session
    const finished = state.outcomes.length > prev.outcomes.length ? state.outcomes[prev.outcomes.length] : null;
    if (finished && finished !== "skipped") {
      const i = prev.outcomes.length, item = state.items[i];
      const { latencyMs } = store.getState().settings;
      recorder.record(runBody(item.exercise, itemExercise(item, state.base), state.base, latencyMs, finished, session));
    }
    if (state.status === "done" && prev.status !== "done") recordRoutine();
    render();
    drawer.schedule();
  }
  function restart() {
    if (state.status !== "done") recordRoutine();
    state = fresh();
    session = uuid();
    render();
    drawer.schedule();
  }

  const offInput = onPlayerInput(store, {
    noteOn: (note, time) => apply({ type: "noteOn", note, time }),
    held: (notes, time) => apply({ type: "held", notes, time }),
  });
  const offGrid = onTimingGrid(store, grid => apply({ type: "setGrid", grid }));
  const offSettings = store.subscribe((s, prev) => {
    // Another routine or direction starts over; other exercise settings apply from the item in progress on
    if (s.settings.routine !== prev.settings.routine) restart();
    else if (s.settings.exercise !== prev.settings.exercise) apply({ type: "setBase", base: s.settings.exercise });
    if (s.settings.promptStyle !== prev.settings.promptStyle) render();
  });
  render();

  return {
    stop() {
      if (state.status !== "done") recordRoutine();
      offInput();
      offGrid();
      offSettings();
      drawer.stop();
    },
    // Skip the item; at the end, start the routine again
    skip: () => state.status === "done" ? restart() : apply({ type: "skip", held: heldNotes(store.getState()) }),
    restart,
  };
}
