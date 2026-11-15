// Chord practice mode: asks for a chord, judges the held keys, and moves on after a correct answer.
import {
  type ChordPracticeAction, type ChordPracticeState, initialChordPractice, makeChordPrompt, pickChordKey, reduceChordPractice,
} from "../exercises/chordPractice";
import type { ChordPrompt } from "../exercises/chordPrompt";
import { withInversion } from "../exercises/inversions";
import { makeDiatonicNamePrompt, makeRomanPrompt } from "../exercises/romanPrompts";
import { keyRotation, rotateKey } from "../exercises/keyRotation";
import type { Rng } from "../exercises/random";
import { buildKey, requireKey } from "../theory";
import { noRecorder, type Recorder } from "../progress/recorder";
import { chordDrillBody } from "../progress/records";
import { chordPracticeDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, heldNotes, onPlayerInput, type AppStore, type Mode } from "./performance";
import { createPromptRecords } from "./promptRecords";

/** How long "✓ Correct" stays up before the next prompt */
const NEXT_PROMPT_MS = 900;

/** The key a prompt is in: a Roman numeral's, or the key a chord name was drawn from */
const promptKey = (p: ChordPrompt) => {
  const value = p.roman?.keyValue ?? p.inKey?.keyValue;
  return value ? buildKey(value) : null;
};

export function startChordPractice({ store, views, recorder = noRecorder, rng = Math.random }: {
  store: AppStore; views: { staff: StaffView; practice: PracticeView }; recorder?: Recorder; rng?: Rng;
}): Mode {
  const settings = () => store.getState().settings;
  // Exercises don't use the header key; chord practice has its own (see CHORD_KEYS). With none, Roman numeral
  // prompts pick a key each time and chord names any chord. With one, the key's diatonic chords, either way.
  let keys = keyRotation(pickChordKey(rng, settings().chordKey));
  const newPrompt = (previous?: ChordPracticeState["prompt"]) => {
    const { promptStyle, chordTypes, inversions, chordKey } = settings();
    keys = rotateKey(keys, chordKey, (choice, before) => pickChordKey(rng, choice, before));
    const key = keys.key ? requireKey(keys.key) : null;
    const prompt = promptStyle === "roman" ? makeRomanPrompt(rng, chordTypes, key, previous)
      : key ? makeDiatonicNamePrompt(rng, chordTypes, key, previous)
      : makeChordPrompt(rng, chordTypes, null, previous);
    return inversions ? withInversion(rng, prompt) : prompt;
  };
  let state: ChordPracticeState = initialChordPractice(newPrompt(), heldNotes(store.getState()));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  // Answered, or skipped before being answered (a new prompt from a settings change isn't a skip)
  const records = createPromptRecords<ChordPracticeState>(recorder, (s, answered, ms) => chordDrillBody(s.prompt, answered, s.missed, ms));
  // The staff follows the prompt's key, if it has one
  const drawer = createPerformanceDrawer(store, views, () => promptKey(state.prompt));

  function apply(action: ChordPracticeAction) {
    const prev = state;
    state = reduceChordPractice(state, action);
    if (state === prev) return;
    records.changed(prev, state, action.type === "skip");
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
    if (s.settings.chordKey !== prev.settings.chordKey) keys = keyRotation(pickChordKey(rng, s.settings.chordKey, keys.key));
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
