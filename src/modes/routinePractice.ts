// Routine mode: plays a routine's exercises one after another, moving on whenever an item's run finishes.
import { initialRoutine, reduceRoutine, routineById, type RoutineAction, type RoutineState } from "../exercises/routines";
import { buildKey } from "../theory";
import type { NoteListView } from "../views/noteList";
import { routineDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, heldNotes, onPlayerInput, type AppStore, type Mode } from "./performance";

export function startRoutinePractice(store: AppStore, views: {
  staff: StaffView; noteList: NoteListView; practice: PracticeView;
}): Mode {
  const fresh = (): RoutineState => {
    const s = store.getState();
    return initialRoutine(routineById(s.settings.routine.id)!, s.settings.routine.direction, s.settings.exercise, heldNotes(s));
  };
  let state = fresh();
  // The staff follows the key of the item in progress
  const drawer = createPerformanceDrawer(store, views, () => buildKey(state.current.exercise.keyValue));

  const render = () => views.practice.render(routineDisplay(state, store.getState().settings.promptStyle));
  function apply(action: RoutineAction) {
    const prev = state;
    state = reduceRoutine(state, action);
    if (state === prev) return;
    render();
    if (state.current.exercise !== prev.current.exercise) drawer.schedule();
  }
  function restart() {
    state = fresh();
    render();
    drawer.schedule();
  }

  const offInput = onPlayerInput(store, {
    noteOn: (note, time) => apply({ type: "noteOn", note, time }),
    held: (notes, time) => apply({ type: "held", notes, time }),
  });
  const offSettings = store.subscribe((s, prev) => {
    // Another routine or direction starts over; other exercise settings apply from the item in progress on
    if (s.settings.routine !== prev.settings.routine) restart();
    else if (s.settings.exercise !== prev.settings.exercise) apply({ type: "setBase", base: s.settings.exercise });
    if (s.settings.promptStyle !== prev.settings.promptStyle) render();
  });
  render();

  return {
    stop() {
      offInput();
      offSettings();
      drawer.stop();
    },
    // Skip the item; at the end, start the routine again
    skip: () => state.status === "done" ? restart() : apply({ type: "skip", held: heldNotes(store.getState()) }),
    restart,
  };
}
