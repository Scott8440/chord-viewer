// Shared by modes: redraw the staff and note list once per animation frame while notes change.
import type { AppAction, AppState } from "../state/app";
import { pedalOnlyNotes, soundingNotes } from "../state/performance";
import type { Store } from "../state/store";
import { analyze, type KeyContext } from "../theory";
import type { NoteListView } from "../views/noteList";
import type { StaffView } from "../views/staff";

export interface Mode {
  stop(): void;
  /** Move on to the next prompt, for modes that have prompts */
  skip?(): void;
}

export const sounding = (s: AppState) => soundingNotes(s.perf, s.settings.includeSustained);

/**
 * `keyOf` gives the key to draw and spell in: the header key in free play, the exercise's own key in practice
 * modes (which never use the header key).
 */
export function createPerformanceDrawer(store: Store<AppState, AppAction>, views: { staff: StaffView; noteList: NoteListView },
                                        keyOf: () => KeyContext | null = () => store.getState().settings.key) {
  let frameQueued = false, frame = 0;
  return {
    /** Redraws on the next animation frame (at most once per frame) */
    schedule() {
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
    },
    cancel() {
      cancelAnimationFrame(frame);
      frameQueued = false;
    },
  };
}
