// Shared by modes: the live staff and note list, and the player input exercises judge.
import type { AppAction, AppState } from "../state/app";
import { pedalOnlyNotes, soundingNotes } from "../state/performance";
import type { Store } from "../state/store";
import { analyze, type KeyContext } from "../theory";
import type { NoteListView } from "../views/noteList";
import type { StaffView } from "../views/staff";

export interface Mode {
  stop(): void;
  /** Move on to the next prompt (or restart, for repeatable exercises) */
  skip?(): void;
}

export type AppStore = Store<AppState, AppAction>;

export const sounding = (s: AppState) => soundingNotes(s.perf, s.settings.includeSustained);

/** The keys held down, low to high (pedal-sustained notes are not held). */
export const heldNotes = (s: AppState) => [...s.perf.held.keys()].sort((a, b) => a - b);

/**
 * Redraws the staff and note list once per animation frame whenever the notes or settings change, until stopped.
 * `keyOf` gives the key to draw and spell in: the header key in free play, the exercise's own key in practice
 * modes (which never use the header key). Call `schedule()` when that key changes.
 */
export function createPerformanceDrawer(store: AppStore, views: { staff: StaffView; noteList: NoteListView },
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
      views.noteList.render(notes, result, key, n => s.perf.held.has(n));
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
