// Free play: show whatever is being played, with its chord name. The staff redraws every
// frame something changes; the chord name waits for ~40ms of stillness so a rolled chord
// doesn't flicker through partial names.
import type { AppAction, AppState } from "../state/app";
import type { Store } from "../state/store";
import { analyze } from "../theory";
import type { ChordNameView } from "../views/chordName";
import type { NoteListView } from "../views/noteList";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, sounding, type Mode } from "./performance";

const NAME_SETTLE_MS = 40;

export function startFreePlay(store: Store<AppState, AppAction>, views: {
  staff: StaffView; chordName: ChordNameView; noteList: NoteListView;
}): Mode {
  const drawer = createPerformanceDrawer(store, views);
  let nameTimer: ReturnType<typeof setTimeout> | undefined;

  function changed() {
    drawer.schedule();
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => {
      const s = store.getState();
      views.chordName.render(analyze(sounding(s), s.settings.key));
    }, NAME_SETTLE_MS);
  }

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.settings.key !== prev.settings.key) views.chordName.reset();
    if (s.perf !== prev.perf || s.settings !== prev.settings) changed();
  });
  changed();

  return {
    stop() {
      unsubscribe();
      drawer.cancel();
      clearTimeout(nameTimer);
    },
  };
}
