// Ear training, melodies: the root, then a few notes in the key; the player plays the notes back in order. A wrong
// note waits on its step and the melody plays again a second later. With a random tonic the key changes every
// PROMPTS_PER_KEY melodies. Stop silences everything and ignores played notes; Start plays the melody again.
import type { TonePlayer } from "../audio/tones";
import {
  makeMelodyPrompt, pickTonic, PROMPTS_PER_KEY, reduceMelody, initialMelody,
  type EarOptions, type MelodyAction, type MelodyPrompt, type MelodyState,
} from "../exercises/earTraining";
import type { Rng } from "../exercises/notePractice";
import { noRecorder, type Recorder } from "../progress/recorder";
import { melodyDrillBody } from "../progress/records";
import { buildKey } from "../theory";
import { earMelodyDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, onPlayerInput, type AppStore, type Mode } from "./performance";

/** Seconds from the root to the first note, and between notes; how long each note rings */
const ROOT_GAP_S = 1.1, NOTE_GAP_S = 0.65, NOTE_RING_S = 1.4;
/** How long "✓" stays up before the next melody */
const NEXT_PROMPT_MS = 1500;
/** After a wrong note, the melody plays again this long after it */
const REPLAY_AFTER_MISS_MS = 1000;

export function startEarMelody(store: AppStore, views: {
  staff: StaffView; practice: PracticeView; tones: TonePlayer;
}, recorder: Recorder = noRecorder, rng: Rng = Math.random): Mode {
  const options = () => store.getState().settings.ear;
  let tonic = pickTonic(rng, options().tonic);
  let inKey = 0;
  let state: MelodyState = initialMelody(newPrompt());
  // The staff draws the melody as it's played back, the root shown (grey) from the start, spelled in its key
  const drawer = createPerformanceDrawer(store, views, () => buildKey(state.prompt.keyValue), () => ({
    notes: state.prompt.notes.slice(0, Math.max(1, state.index)).map((n, i) => ({ midi: n.note, dim: i >= state.index })),
    slots: state.prompt.notes.length,
  }));
  let nextTimer: ReturnType<typeof setTimeout> | undefined, replayTimer: ReturnType<typeof setTimeout> | undefined;
  let shownAt = Date.now();
  let running = true;

  /** The next melody: in the same key, or a new one (when the tonic is random and this key has had its turn) */
  function newPrompt(previous?: MelodyPrompt): MelodyPrompt {
    if (previous && options().tonic === "random" && inKey >= PROMPTS_PER_KEY) {
      tonic = pickTonic(rng, "random", tonic);
      inKey = 0;
    }
    inKey++;
    const o = options();
    return makeMelodyPrompt(rng, tonic, o.degrees, o.melodyLength, previous);
  }

  /** Plays the root and then the melody (a little gap after the root), cutting off anything still sounding */
  function sound() {
    if (!running) return;
    views.tones.stopNotes();
    state.prompt.notes.forEach((n, i) =>
      views.tones.play(n.note, i === 0 ? 0 : ROOT_GAP_S + (i - 1) * NOTE_GAP_S, NOTE_RING_S));
  }

  function clearTimers() {
    clearTimeout(nextTimer);
    clearTimeout(replayTimer);
  }

  function render() {
    views.practice.render(earMelodyDisplay(state, options().degrees, views.tones.blocked(), running));
    // The drawer only redraws by itself on input; the melody and its key change here
    drawer.schedule();
  }

  function apply(action: MelodyAction) {
    const prev = state;
    state = reduceMelody(state, action);
    if (state === prev) return;
    // Played back, or skipped before the end
    if (state.status === "correct" && prev.status !== "correct") {
      recorder.record(melodyDrillBody(state.prompt, options().degrees, true, state.missed, Date.now() - shownAt));
    } else if (action.type === "skip" && prev.status !== "correct") {
      recorder.record(melodyDrillBody(prev.prompt, options().degrees, false, prev.missed, Date.now() - shownAt));
    }
    if (state.prompt !== prev.prompt) {
      shownAt = Date.now();
      sound();
    }
    render();
    clearTimers();
    // A miss: hear it all again (another miss meanwhile pushes it back)
    if (state.status === "wrong") replayTimer = setTimeout(sound, REPLAY_AFTER_MISS_MS);
    if (state.status === "correct") {
      nextTimer = setTimeout(() => apply({ type: "next", prompt: newPrompt(state.prompt) }), NEXT_PROMPT_MS);
    }
  }

  /** New options: a fresh melody (not a skip) */
  function restart(o: EarOptions, before: EarOptions) {
    clearTimers();
    if (o.tonic !== before.tonic) { tonic = pickTonic(rng, o.tonic, tonic); inKey = 0; }
    inKey++;
    state = { ...state, prompt: makeMelodyPrompt(rng, tonic, o.degrees, o.melodyLength, state.prompt),
              index: 0, status: "waiting", played: null, missed: false };
    shownAt = Date.now();
    sound();
    render();
  }

  const offInput = onPlayerInput(store, { noteOn: note => { if (running) apply({ type: "play", note }); } });
  const offSettings = store.subscribe((s, p) => { if (s.settings.ear !== p.settings.ear) restart(s.settings.ear, p.settings.ear); });
  const offBlocked = views.tones.onBlockedChange(render);
  sound();
  render();

  return {
    stop() {
      offInput();
      offSettings();
      offBlocked();
      drawer.stop();
      clearTimers();
      views.tones.stopNotes();
    },
    skip() {
      running = true;   // skipping while stopped starts again, on the new melody
      apply({ type: "skip", prompt: newPrompt(state.prompt) });
    },
    replay() {
      if (running) sound();
    },
    toggleRunning() {
      clearTimers();
      running = !running;
      if (!running) {
        views.tones.stopNotes();
        render();
      } else if (state.status === "correct") {
        apply({ type: "next", prompt: newPrompt(state.prompt) });
      } else {
        shownAt = Date.now();
        sound();
        render();
      }
    },
  };
}
