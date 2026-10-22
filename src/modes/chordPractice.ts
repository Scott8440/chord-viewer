// Chord practice mode: asks for a chord, judges the held keys, and moves on after a correct answer.
import {
  initialChordPractice, makeChordPrompt, reduceChordPractice,
  type ChordPracticeAction, type ChordPracticeState,
} from "../exercises/chordPractice";
import type { Rng } from "../exercises/notePractice";
import type { AppAction, AppState } from "../state/app";
import type { Store } from "../state/store";
import type { NoteListView } from "../views/noteList";
import { chordPracticeDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, type Mode } from "./performance";

/** How long "✓ Correct" stays up before the next prompt */
const NEXT_PROMPT_MS = 900;

const heldNotes = (s: AppState) => [...s.perf.held.keys()].sort((a, b) => a - b);

export function startChordPractice(store: Store<AppState, AppAction>, views: {
  staff: StaffView; noteList: NoteListView; practice: PracticeView;
}, rng: Rng = Math.random): Mode {
  const drawer = createPerformanceDrawer(store, views);
  const settings = () => store.getState().settings;
  const newPrompt = (previous?: ChordPracticeState["prompt"]) => makeChordPrompt(rng, settings().chordTypes, settings().key, previous);
  let state: ChordPracticeState = initialChordPractice(newPrompt(), heldNotes(store.getState()));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;

  function apply(action: ChordPracticeAction) {
    const prev = state;
    state = reduceChordPractice(state, action);
    if (state === prev) return;
    views.practice.render(chordPracticeDisplay(state, settings().key));
    clearTimeout(nextTimer);
    if (state.status === "correct") {
      nextTimer = setTimeout(() => apply({ type: "next", prompt: newPrompt(state.prompt), held: heldNotes(store.getState()) }), NEXT_PROMPT_MS);
    }
  }

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.perf.held !== prev.perf.held) {
      const now = heldNotes(s), before = heldNotes(prev);
      if (now.join() !== before.join()) apply({ type: "held", notes: now });
    }
    // A new key respells prompts; a narrower filter may rule out the current chord
    if (s.settings.key !== prev.settings.key ||
        (s.settings.chordTypes !== prev.settings.chordTypes && !s.settings.chordTypes.includes(state.prompt.type))) {
      apply({ type: "next", prompt: newPrompt(state.prompt), held: heldNotes(s) });
    }
    if (s.perf !== prev.perf || s.settings !== prev.settings) drawer.schedule();
  });

  views.practice.render(chordPracticeDisplay(state, settings().key));
  drawer.schedule();

  return {
    stop() {
      unsubscribe();
      drawer.cancel();
      clearTimeout(nextTimer);
    },
    skip() {
      apply({ type: "skip", prompt: newPrompt(state.prompt), held: heldNotes(store.getState()) });
    },
  };
}
