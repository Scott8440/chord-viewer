// Chord practice mode: asks for a chord, judges the held keys, and moves on after a correct answer.
import {
  initialChordPractice, makeChordPrompt, makeRomanPrompt, reduceChordPractice, withInversion,
  type ChordPracticeAction, type ChordPracticeState,
} from "../exercises/chordPractice";
import type { Rng } from "../exercises/notePractice";
import { buildKey } from "../theory";
import type { NoteListView } from "../views/noteList";
import { chordPracticeDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, heldNotes, onPlayerInput, type AppStore, type Mode } from "./performance";

/** How long "✓ Correct" stays up before the next prompt */
const NEXT_PROMPT_MS = 900;

export function startChordPractice(store: AppStore, views: {
  staff: StaffView; noteList: NoteListView; practice: PracticeView;
}, rng: Rng = Math.random): Mode {
  const settings = () => store.getState().settings;
  // Exercises don't use the header key: Roman numeral prompts name their own (random) key, chord names need none
  const newPrompt = (previous?: ChordPracticeState["prompt"]) => {
    const { promptStyle, chordTypes, inversions } = settings();
    const prompt = (promptStyle === "roman" ? makeRomanPrompt : makeChordPrompt)(rng, chordTypes, null, previous);
    return inversions ? withInversion(rng, prompt) : prompt;
  };
  let state: ChordPracticeState = initialChordPractice(newPrompt(), heldNotes(store.getState()));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  // The staff follows the prompt's key, if it has one
  const drawer = createPerformanceDrawer(store, views, () => state.prompt.roman ? buildKey(state.prompt.roman.keyValue) : null);

  function apply(action: ChordPracticeAction) {
    const prev = state;
    state = reduceChordPractice(state, action);
    if (state === prev) return;
    views.practice.render(chordPracticeDisplay(state, null));
    if (state.prompt !== prev.prompt) drawer.schedule();
    clearTimeout(nextTimer);
    if (state.status === "correct") {
      nextTimer = setTimeout(() => apply({ type: "next", prompt: newPrompt(state.prompt), held: heldNotes(store.getState()) }), NEXT_PROMPT_MS);
    }
  }

  const offInput = onPlayerInput(store, { held: notes => apply({ type: "held", notes }) });
  const offSettings = store.subscribe((s, prev) => {
    // A new prompt style needs a new prompt; a narrower filter may rule out the current chord
    if (s.settings.promptStyle !== prev.settings.promptStyle || s.settings.inversions !== prev.settings.inversions ||
        (s.settings.chordTypes !== prev.settings.chordTypes && !s.settings.chordTypes.includes(state.prompt.type))) {
      apply({ type: "next", prompt: newPrompt(state.prompt), held: heldNotes(s) });
    }
  });
  views.practice.render(chordPracticeDisplay(state, null));

  return {
    stop() {
      offInput();
      offSettings();
      drawer.stop();
      clearTimeout(nextTimer);
    },
    skip() {
      apply({ type: "skip", prompt: newPrompt(state.prompt), held: heldNotes(store.getState()) });
    },
  };
}
