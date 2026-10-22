// Shared by modes: the live staff, and the player input exercises judge.
import type { AppAction, AppState } from "../state/app";
import { pedalOnlyNotes, soundingNotes } from "../state/performance";
import type { Store } from "../state/store";
import { analyze, type KeyContext } from "../theory";
import type { StaffView } from "../views/staff";

export interface Mode {
  stop(): void;
  /** Move on to the next prompt (or restart, for repeatable exercises) */
  skip?(): void;
  /** Start over from the beginning (routines) */
  restart?(): void;
}

export type AppStore = Store<AppState, AppAction>;

export const sounding = (s: AppState) => soundingNotes(s.perf, s.settings.includeSustained);

/** The keys held down, low to high (pedal-sustained notes are not held). */
export const heldNotes = (s: AppState) => [...s.perf.held.keys()].sort((a, b) => a - b);

/**
 * Redraws the staff once per animation frame whenever the notes or settings change, until stopped.
 * `keyOf` gives the key to draw and spell in: the header key in free play, the exercise's own key in practice
 * modes (which never use the header key). Call `schedule()` when that key changes.
 */
export function createPerformanceDrawer(store: AppStore, views: { staff: StaffView },
                                        keyOf: () => KeyContext | null = () => store.getState().settings.key) {
  let frameQueued = false, frame = 0;
  function schedule() {
    if (frameQueued) return;
    frameQueued = true;
    frame = requestAnimationFrame(() => {
      frameQueued = false;
      const s = store.getState();
      const key = keyOf();
      const notes = sounding(s);
      const result = analyze(notes, key);
      views.staff.render(notes, result, key, pedalOnlyNotes(s.perf));
    });
  }
  const unsubscribe = store.subscribe((s, prev) => { if (s.perf !== prev.perf || s.settings !== prev.settings) schedule(); });
  schedule();
  return {
    schedule,
    stop() {
      unsubscribe();
      cancelAnimationFrame(frame);
      frameQueued = false;
    },
  };
}

/**
 * Player input for exercises, until the returned function is called: each note-on with its time, and each change
 * of the held keys with the time of the event that caused it. Note-ons are reported before the held keys.
 */
export function onPlayerInput(store: AppStore, handlers: {
  noteOn?(note: number, time: number): void;
  held?(notes: number[], time: number): void;
}): () => void {
  return store.subscribe((s, prev) => {
    // The history gains exactly one event per input dispatch
    if (s.history === prev.history) return;
    const event = s.history[s.history.length - 1];
    if (event.type === "noteOn") handlers.noteOn?.(event.note, event.time);
    if (handlers.held && s.perf.held !== prev.perf.held) {
      const now = heldNotes(s);
      if (now.join() !== heldNotes(prev).join()) handlers.held(now, event.time);
    }
  });
}

/**
 * Idleness, until the returned function is called: `idle` once there has been no input for `ms` with nothing
 * sounding, `active` on every input. Notes still sounding hold idleness off; letting go is input and starts the wait.
 */
export function onIdle(store: AppStore, ms: number, handlers: { idle(): void; active(): void }): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function wait() {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!sounding(store.getState()).length) handlers.idle(); }, ms);
  }
  const unsubscribe = store.subscribe((s, prev) => {
    if (s.history === prev.history) return;
    handlers.active();
    wait();
  });
  wait();
  return () => { unsubscribe(); clearTimeout(timer); };
}
