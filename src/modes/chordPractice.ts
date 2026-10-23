// Chord practice mode: asks for a chord, judges the held keys, and moves on after a correct answer.
import {
  initialChordPractice, makeChordPrompt, makeRomanPrompt, reduceChordPractice, withInversion,
  type ChordPracticeAction, type ChordPracticeState,
} from "../exercises/chordPractice";
import type { Rng } from "../exercises/notePractice";
import { buildKey } from "../theory";
import { noRecorder, type Recorder } from "../progress/recorder";
import { chordDrillBody } from "../progress/records";
import { chordPracticeDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, heldNotes, onPlayerInput, type AppStore, type Mode } from "./performance";

/** How long "✓ Correct" stays up before the next prompt */
const NEXT_PROMPT_MS = 900;

export function startChordPractice(store: AppStore, views: {
  staff: StaffView; practice: PracticeView;
}, recorder: Recorder = noRecorder, rng: Rng = Math.random): Mode {
  const settings = () => store.getState().settings;
  // Exercises don't use the header key: Roman numeral prompts name their own (random) key, chord names need none
  const newPrompt = (previous?: ChordPracticeState["prompt"]) => {
    const { promptStyle, chordTypes, inversions } = settings();
    const prompt = (promptStyle === "roman" ? makeRomanPrompt : makeChordPrompt)(rng, chordTypes, null, previous);
    return inversions ? withInversion(rng, prompt) : prompt;
  };
  let state: ChordPracticeState = initialChordPractice(newPrompt(), heldNotes(store.getState()));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the current prompt appeared, to time the answer */
  let shownAt = Date.now();
  // The staff follows the prompt's key, if it has one
  const drawer = createPerformanceDrawer(store, views, () => state.prompt.roman ? buildKey(state.prompt.roman.keyValue) : null);

  function apply(action: ChordPracticeAction) {
    const prev = state;
    state = reduceChordPractice(state, action);
    if (state === prev) return;
    // Answered, or skipped before being answered (a new prompt from a settings change isn't a skip)
    if (state.status === "correct" && prev.status !== "correct") {
      recorder.record(chordDrillBody(state.prompt, true, state.missed, Date.now() - shownAt));
    } else if (action.type === "skip" && prev.status !== "correct") {
      recorder.record(chordDrillBody(prev.prompt, false, prev.missed, Date.now() - shownAt));
    }
    if (state.prompt !== prev.prompt) shownAt = Date.now();
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
