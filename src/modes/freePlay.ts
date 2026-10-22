// Free play: show whatever is being played, with its chord name. The staff redraws every
// frame something changes; the chord name waits for ~40ms of stillness so a rolled chord
// doesn't flicker through partial names. After a while without input the chord fades out.
import { analyze } from "../theory";
import type { ChordNameView } from "../views/chordName";
import { chordOnCircle, type CircleView } from "../views/circleOfFifths";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, sounding, type AppStore, type Mode } from "./performance";

const NAME_SETTLE_MS = 40;
/** No input for this long, with nothing sounding, and the player is idle */
const IDLE_MS = 10_000;

export function startFreePlay(store: AppStore, views: {
  staff: StaffView; chordName: ChordNameView; circle: CircleView;
}): Mode {
  const drawer = createPerformanceDrawer(store, views);
  let nameTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  /** Any input ends idleness and restarts the wait; notes still sounding then keep it from starting
   *  (letting go is input, and starts the wait again) */
  function active() {
    clearTimeout(idleTimer);
    views.chordName.setIdle(false);
    idleTimer = setTimeout(() => {
      if (!sounding(store.getState()).length) views.chordName.setIdle(true);
    }, IDLE_MS);
  }

  function nameSoon() {
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => {
      const s = store.getState();
      const result = analyze(sounding(s), s.settings.key);
      views.chordName.render(result);
      // With a key chosen, the circle shows it, its neighbourhood, and where the chord being played sits
      views.circle.render(s.settings.key ? { keyValue: s.settings.keyValue, chord: chordOnCircle(result) } : null);
    }, NAME_SETTLE_MS);
  }

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.settings.key !== prev.settings.key) views.chordName.reset();
    if (s.perf !== prev.perf || s.settings !== prev.settings) nameSoon();
    if (s.history !== prev.history) active();
  });
  nameSoon();
  active();

  return {
    stop() {
      unsubscribe();
      drawer.stop();
      clearTimeout(nameTimer);
      clearTimeout(idleTimer);
      views.chordName.setIdle(false);
    },
  };
}
