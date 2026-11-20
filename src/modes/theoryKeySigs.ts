// Theory quiz, key signatures: the staff shows a key signature and nothing else; the player names the key from the
// board under it, or plays its tonic. A right answer moves on after a moment; Skip moves on at once. Each prompt is
// recorded once, answered or skipped.
import {
  initialKeySig,
  makeKeySigPrompt,
  reduceKeySig,
  type KeySigAction,
  type KeySigState,
} from "../exercises/keySignatures";
import type { Rng } from "../exercises/random";
import { noRecorder, type Recorder } from "../progress/recorder";
import { keySigDrillBody } from "../progress/records";
import { buildKey } from "../theory";
import type { AnswerBoard } from "../views/answerBoard";
import { keyName, keySigAnswers, keySigDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, onPlayerInput, type AppStore, type Mode } from "./performance";
import { createPromptRecords } from "./promptRecords";

/** How long the answer stays up before the next signature */
export const KEY_SIG_NEXT_MS = 1200;

export function startTheoryKeySigs({
  store,
  views,
  recorder = noRecorder,
  rng = Math.random,
}: {
  store: AppStore;
  views: { staff: StaffView; practice: PracticeView; answers: AnswerBoard };
  recorder?: Recorder;
  rng?: Rng;
}): Mode {
  const options = () => store.getState().settings.keySig;
  let state: KeySigState = initialKeySig(makeKeySigPrompt(rng, options()));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  const records = createPromptRecords<KeySigState>(recorder, (s, answered, ms) =>
    keySigDrillBody(s.prompt.keyValue, keyName(s.prompt.keyValue), answered, s.missed, ms, s.tried),
  );
  // The staff shows the prompt's signature, and whatever the player holds
  const drawer = createPerformanceDrawer(store, views, () => buildKey(state.prompt.keyValue));

  function render() {
    views.practice.render(keySigDisplay(state));
    views.answers.render(keySigAnswers(state));
  }

  function apply(action: KeySigAction) {
    const prev = state;
    state = reduceKeySig(state, action);
    if (state === prev) return;
    records.changed(prev, state, action.type === "skip");
    render();
    if (state.prompt !== prev.prompt) drawer.schedule();
    clearTimeout(nextTimer);
    if (state.status === "correct")
      nextTimer = setTimeout(
        () => apply({ type: "next", prompt: makeKeySigPrompt(rng, options(), state.prompt) }),
        KEY_SIG_NEXT_MS,
      );
  }

  const offAnswer = views.answers.onAnswer(keyValue => apply({ type: "answer", keyValue }));
  const offInput = onPlayerInput(store, { noteOn: note => apply({ type: "play", note }) });
  // New options: a new signature to fit them (not a skip)
  const offSettings = store.subscribe((s, prev) => {
    if (s.settings.keySig !== prev.settings.keySig)
      apply({ type: "next", prompt: makeKeySigPrompt(rng, s.settings.keySig, state.prompt) });
  });
  render();

  return {
    stop() {
      offAnswer();
      offInput();
      offSettings();
      drawer.stop();
      clearTimeout(nextTimer);
    },
    skip() {
      apply({ type: "skip", prompt: makeKeySigPrompt(rng, options(), state.prompt) });
    },
  };
}
