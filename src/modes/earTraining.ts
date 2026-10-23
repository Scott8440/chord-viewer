// Ear training mode: a drone on the tonic, a note played over it, and the player finds that note. Moves on after a
// correct answer; with a random tonic, the drone moves to a new key every PROMPTS_PER_KEY prompts.
import type { TonePlayer } from "../audio/tones";
import {
  makeEarPrompt, pickTonic, PROMPTS_PER_KEY, tonicMidi, type EarAction, type EarOptions, type EarPrompt, type EarState,
} from "../exercises/earTraining";
import { initialNotePractice, reduceNotePractice, type Rng } from "../exercises/notePractice";
import { noRecorder, type Recorder } from "../progress/recorder";
import { earDrillBody } from "../progress/records";
import { buildKey } from "../theory";
import { earDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, onPlayerInput, type AppStore, type Mode } from "./performance";

/** How long "✓" stays up before the next note */
const NEXT_PROMPT_MS = 1000;
/** Seconds of drone before the first note in a key, so the key sinks in */
const DRONE_LEAD_S = 1.5;

export function startEarTraining(store: AppStore, views: {
  staff: StaffView; practice: PracticeView; tones: TonePlayer;
}, recorder: Recorder = noRecorder, rng: Rng = Math.random): Mode {
  const options = () => store.getState().settings.ear;
  let tonic = pickTonic(rng, options().tonic);
  let inKey = 0;
  let state: EarState = initialNotePractice(newPrompt());
  // Spell what's played in the drone's key
  const drawer = createPerformanceDrawer(store, views, () => buildKey(state.prompt.keyValue));
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  let shownAt = Date.now();

  /** The next prompt: in the same key, or a new one (when the tonic is random and this key has had its turn) */
  function newPrompt(previous?: EarPrompt): EarPrompt {
    if (previous && options().tonic === "random" && inKey >= PROMPTS_PER_KEY) {
      tonic = pickTonic(rng, "random", tonic);
      inKey = 0;
    }
    inKey++;
    return makeEarPrompt(rng, tonic, options().degrees, previous);
  }

  /** Sounds the prompt, after a drone lead-in when the key is new */
  function sound(prev: EarPrompt | null) {
    const newKey = !prev || prev.keyValue !== state.prompt.keyValue;
    if (newKey) views.tones.drone(tonicMidi(tonic) - 12);
    views.tones.play(state.prompt.note, newKey ? DRONE_LEAD_S : 0);
  }

  const render = () => views.practice.render(earDisplay(state, options().degrees, views.tones.blocked()));

  function apply(action: EarAction) {
    const prev = state;
    state = reduceNotePractice(state, action);
    if (state === prev) return;
    // Answered, or skipped before being answered
    if (state.status === "correct" && prev.status !== "correct") {
      recorder.record(earDrillBody(state.prompt, options().degrees, true, state.missed, Date.now() - shownAt));
    } else if (action.type === "skip" && prev.status !== "correct") {
      recorder.record(earDrillBody(prev.prompt, options().degrees, false, prev.missed, Date.now() - shownAt));
    }
    if (state.prompt !== prev.prompt) {
      shownAt = Date.now();
      sound(prev.prompt);
    }
    render();
    clearTimeout(nextTimer);
    if (state.status === "correct") {
      nextTimer = setTimeout(() => apply({ type: "next", prompt: newPrompt(state.prompt) }), NEXT_PROMPT_MS);
    }
  }

  /** New options: a fresh prompt in the right key (not a skip) */
  function restart(o: EarOptions, before: EarOptions) {
    clearTimeout(nextTimer);
    if (o.tonic !== before.tonic) { tonic = pickTonic(rng, o.tonic, tonic); inKey = 0; }
    const prev = state.prompt;
    inKey++;
    state = { ...state, prompt: makeEarPrompt(rng, tonic, o.degrees, prev), status: "waiting", played: null, missed: false };
    shownAt = Date.now();
    sound(prev);
    render();
  }

  const offInput = onPlayerInput(store, { noteOn: note => apply({ type: "play", note }) });
  const offSettings = store.subscribe((s, p) => { if (s.settings.ear !== p.settings.ear) restart(s.settings.ear, p.settings.ear); });
  const offBlocked = views.tones.onBlockedChange(render);
  sound(null);
  render();

  return {
    stop() {
      offInput();
      offSettings();
      offBlocked();
      drawer.stop();
      clearTimeout(nextTimer);
      views.tones.drone(null);
    },
    skip() {
      apply({ type: "skip", prompt: newPrompt(state.prompt) });
    },
    replay() {
      views.tones.play(state.prompt.note);
    },
  };
}
