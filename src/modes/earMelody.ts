// Ear training, melodies: the root, then a few notes in the key; the player plays the notes back in order. A wrong
// note waits on its step and the melody plays again a second later. With a random tonic the key changes every
// PROMPTS_PER_KEY melodies. Stop silences everything and ignores played notes; Start plays the melody again.
// Rounds, replays and Stop/Start are the shared ear-drill runner's (earDrill.ts); this sounds the melody and draws it.
import type { TonePlayer } from "../audio/tones";
import {
  initialMelody, makeMelodyPrompt, pickTonic, reduceMelody, type EarOptions, type MelodyAction, type MelodyPrompt,
  type MelodyState,
} from "../exercises/earTraining";
import { countInKey, keyRotation, rotateKey } from "../exercises/keyRotation";
import type { Rng } from "../exercises/notePractice";
import { noRecorder, type Recorder } from "../progress/recorder";
import { melodyDrillBody } from "../progress/records";
import { buildKey } from "../theory";
import type { ProgressStore } from "../progress/store";
import { earMelodyDisplay, roundSummaryDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createEarDrill } from "./earDrill";
import { createPerformanceDrawer, onPlayerInput, type AppStore, type Mode } from "./performance";
import type { RoundVizView } from "../views/roundViz";

/** Seconds from the root to the first note, and between notes; how long each note rings */
const ROOT_GAP_S = 1.1, NOTE_GAP_S = 0.65, NOTE_RING_S = 1.4;
/** How long "✓" stays up before the next melody */
const NEXT_PROMPT_MS = 1500;

export function startEarMelody({ store, views, recorder = noRecorder, history = null, rng = Math.random }: {
  store: AppStore; views: { staff: StaffView; practice: PracticeView; tones: TonePlayer; roundViz: RoundVizView };
  recorder?: Recorder; history?: Promise<ProgressStore> | null; rng?: Rng;
}): Mode {
  const options = () => store.getState().settings.ear;
  let keys = keyRotation(pickTonic(rng, options().tonic));

  /** The next melody: in the same key, or a new one (when the tonic is random and this key has had its turn) */
  function newPrompt(previous?: MelodyPrompt): MelodyPrompt {
    keys = rotateKey(keys, options().tonic, (choice, before) => pickTonic(rng, choice, before));
    const o = options();
    return makeMelodyPrompt(rng, keys.key, o.degrees, o.melodyLength, previous);
  }

  const drill = createEarDrill<MelodyPrompt, MelodyState, MelodyAction, EarOptions>(store, views, {
    drill: "melody",
    options: s => s.settings.ear,
    setup: () => `length:${options().melodyLength};degrees:${options().degrees.join(",")}`,
    initial: initialMelody(newPrompt()),
    reduce: reduceMelody,
    nextPrompt: newPrompt,
    freshPrompt(o, before, previous) {
      if (o.tonic !== before.tonic) keys = keyRotation(pickTonic(rng, o.tonic, keys.key));
      keys = countInKey(keys);
      return makeMelodyPrompt(rng, keys.key, o.degrees, o.melodyLength, previous);
    },
    nextPromptMs: NEXT_PROMPT_MS,
    record: (s, answered, ms) => melodyDrillBody(s.prompt, options().degrees, answered, s.missed, ms),
    // The root and then the melody (a little gap after the root), cutting off anything still sounding
    sound(s) {
      views.tones.stopNotes();
      s.prompt.notes.forEach((n, i) =>
        views.tones.play(n.note, i === 0 ? 0 : ROOT_GAP_S + (i - 1) * NOTE_GAP_S, NOTE_RING_S));
    },
    silence: () => views.tones.stopNotes(),
    display: (s, blocked, running) => earMelodyDisplay(s, options().degrees, blocked, running),
    summaryDisplay: summary => roundSummaryDisplay(summary, "Melodies"),
    // The drawer only redraws by itself on input; the melody and its key change here
    rendered: () => drawer.schedule(),
  }, recorder, history);

  // The staff draws the melody as it's played back, the root shown (grey) from the start, spelled in its key
  const drawer = createPerformanceDrawer(store, views, () => buildKey(drill.state().prompt.keyValue), () => {
    const state = drill.state();
    return {
      notes: state.prompt.notes.slice(0, Math.max(1, state.index)).map((n, i) => ({ midi: n.note, dim: i >= state.index })),
      slots: state.prompt.notes.length,
    };
  });
  const offInput = onPlayerInput(store, { noteOn: note => drill.answer({ type: "play", note }) });
  drill.start();

  return {
    stop() {
      offInput();
      drawer.stop();
      drill.stop();
    },
    skip: drill.skip,
    replay: drill.replay,
    toggleRunning: drill.toggleRunning,
  };
}
