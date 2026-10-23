// Chord practice mode: asks for a chord, judges the held keys, and moves on after a correct answer.
import {
  type ChordPracticeAction, type ChordPracticeState, initialChordPractice, makeChordPrompt, pickChordKey, reduceChordPractice,
} from "../exercises/chordPractice";
import type { ChordPrompt } from "../exercises/chordPrompt";
import { PROMPTS_PER_KEY } from "../exercises/earTraining";
import { withInversion } from "../exercises/inversions";
import { makeDiatonicNamePrompt, makeRomanPrompt } from "../exercises/romanPrompts";
import type { Rng } from "../exercises/notePractice";
import { buildKey } from "../theory";
import { noRecorder, type Recorder } from "../progress/recorder";
import { chordDrillBody } from "../progress/records";
import { chordPracticeDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, heldNotes, onPlayerInput, type AppStore, type Mode } from "./performance";

/** How long "✓ Correct" stays up before the next prompt */
const NEXT_PROMPT_MS = 900;

/** The key a prompt is in: a Roman numeral's, or the key a chord name was drawn from */
const promptKey = (p: ChordPrompt) => {
  const value = p.roman?.keyValue ?? p.inKey?.keyValue;
  return value ? buildKey(value) : null;
};

export function startChordPractice(store: AppStore, views: {
  staff: StaffView; practice: PracticeView;
}, recorder: Recorder = noRecorder, rng: Rng = Math.random): Mode {
  const settings = () => store.getState().settings;
  // Exercises don't use the header key; chord practice has its own (see CHORD_KEYS). With none, Roman numeral
  // prompts pick a key each time and chord names any chord. With one, the key's diatonic chords, either way.
  let keyValue = pickChordKey(rng, settings().chordKey);
  let inKey = 0;
  const newPrompt = (previous?: ChordPracticeState["prompt"]) => {
    const { promptStyle, chordTypes, inversions, chordKey } = settings();
    if (previous && chordKey === "random" && inKey >= PROMPTS_PER_KEY) {
      keyValue = pickChordKey(rng, "random", keyValue);
      inKey = 0;
    }
    inKey++;
    const key = keyValue ? buildKey(keyValue)! : null;
    const prompt = promptStyle === "roman" ? makeRomanPrompt(rng, chordTypes, key, previous)
      : key ? makeDiatonicNamePrompt(rng, chordTypes, key, previous)
      : makeChordPrompt(rng, chordTypes, null, previous);
    return inversions ? withInversion(rng, prompt) : prompt;
  };
  let state: ChordPracticeState = initialChordPractice(newPrompt(), heldNotes(store.getState()));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the current prompt appeared, to time the answer */
  let shownAt = Date.now();
  // The staff follows the prompt's key, if it has one
  const drawer = createPerformanceDrawer(store, views, () => promptKey(state.prompt));

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
    views.practice.render(chordPracticeDisplay(state, promptKey(state.prompt)));
    if (state.prompt !== prev.prompt) drawer.schedule();
    clearTimeout(nextTimer);
    if (state.status === "correct") {
      nextTimer = setTimeout(() => apply({ type: "next", prompt: newPrompt(state.prompt), held: heldNotes(store.getState()) }), NEXT_PROMPT_MS);
    }
  }

  const offInput = onPlayerInput(store, { held: notes => apply({ type: "held", notes }) });
  const offSettings = store.subscribe((s, prev) => {
    // A new key starts its count afresh
    if (s.settings.chordKey !== prev.settings.chordKey) {
      keyValue = pickChordKey(rng, s.settings.chordKey, keyValue);
      inKey = 0;
    }
    // A new prompt style or key needs a new prompt; a narrower filter may rule out the current chord
    if (s.settings.promptStyle !== prev.settings.promptStyle || s.settings.inversions !== prev.settings.inversions ||
        s.settings.chordKey !== prev.settings.chordKey ||
        (s.settings.chordTypes !== prev.settings.chordTypes && !s.settings.chordTypes.includes(state.prompt.type))) {
      apply({ type: "next", prompt: newPrompt(state.prompt), held: heldNotes(s) });
    }
  });
  views.practice.render(chordPracticeDisplay(state, promptKey(state.prompt)));

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
