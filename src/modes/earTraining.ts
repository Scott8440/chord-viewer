// Ear training mode: a drone on the tonic, a note played over it, and the player finds that note. Moves on after a
// correct answer; with a random tonic, the drone moves to a new key every PROMPTS_PER_KEY prompts. Stop silences
// everything and ignores played notes; Start brings the drone back and plays the current note again.
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
/** After a wrong note, the prompt note plays again this long after it */
const REPLAY_AFTER_MISS_MS = 1000;

export function startEarTraining(store: AppStore, views: {
  staff: StaffView; practice: PracticeView; tones: TonePlayer;
}, recorder: Recorder = noRecorder, rng: Rng = Math.random): Mode {
  const options = () => store.getState().settings.ear;
  let tonic = pickTonic(rng, options().tonic);
  let inKey = 0;
  let state: EarState = initialNotePractice(newPrompt());
  // Spell what's played in the drone's key
  const drawer = createPerformanceDrawer(store, views, () => buildKey(state.prompt.keyValue));
  let nextTimer: ReturnType<typeof setTimeout> | undefined, replayTimer: ReturnType<typeof setTimeout> | undefined;
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

  /** Stopped: no drone, no notes, the player's notes are ignored. Start carries on. */
  let running = true;
  /** The key the drone is sounding in, if it is */
  let droneKey: string | null = null;

  /** Sounds the prompt, after a drone lead-in when the drone is new (a new key, or just started) */
  function sound() {
    if (!running) return;
    const lead = droneKey !== state.prompt.keyValue;
    if (lead) {
      views.tones.drone(tonicMidi(tonic) - 12);
      droneKey = state.prompt.keyValue;
    }
    views.tones.play(state.prompt.note, lead ? DRONE_LEAD_S : 0);
  }

  function silence() {
    views.tones.drone(null);
    droneKey = null;
  }

  /** The key the staff was last drawn in: the drawer only redraws by itself on input */
  let staffKey = state.prompt.keyValue;
  function render() {
    views.practice.render(earDisplay(state, options().degrees, views.tones.blocked(), running));
    if (state.prompt.keyValue !== staffKey) {
      staffKey = state.prompt.keyValue;
      drawer.schedule();
    }
  }

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
      sound();
    }
    render();
    clearTimeout(nextTimer);
    clearTimeout(replayTimer);
    // A miss: hear the note again (another miss meanwhile pushes it back, so it never plays over your trying)
    if (state.status === "wrong") replayTimer = setTimeout(() => { if (running) views.tones.play(state.prompt.note); }, REPLAY_AFTER_MISS_MS);
    if (state.status === "correct") {
      nextTimer = setTimeout(() => apply({ type: "next", prompt: newPrompt(state.prompt) }), NEXT_PROMPT_MS);
    }
  }

  /** New options: a fresh prompt in the right key (not a skip) */
  function restart(o: EarOptions, before: EarOptions) {
    clearTimeout(nextTimer);
    clearTimeout(replayTimer);
    if (o.tonic !== before.tonic) { tonic = pickTonic(rng, o.tonic, tonic); inKey = 0; }
    const prev = state.prompt;
    inKey++;
    state = { ...state, prompt: makeEarPrompt(rng, tonic, o.degrees, prev), status: "waiting", played: null, missed: false };
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
      clearTimeout(nextTimer);
      clearTimeout(replayTimer);
      silence();
    },
    skip() {
      running = true;   // skipping while stopped starts again, on the new note
      apply({ type: "skip", prompt: newPrompt(state.prompt) });
    },
    replay() {
      if (running) views.tones.play(state.prompt.note);
    },
    toggleRunning() {
      clearTimeout(nextTimer);
      clearTimeout(replayTimer);
      running = !running;
      if (!running) {
        silence();
        render();
      } else if (state.status === "correct") {
        // Stopped between an answer and the next note: go straight on to it
        apply({ type: "next", prompt: newPrompt(state.prompt) });
      } else {
        shownAt = Date.now();
        sound();
        render();
      }
    },
  };
}
