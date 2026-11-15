// Ear training mode: a drone on the tonic, a note played over it, and the player finds that note. Moves on after a
// correct answer; with a random tonic, the drone moves to a new key every PROMPTS_PER_KEY prompts. Stop silences
// everything and ignores played notes; Start brings the drone back and plays the current note again.
// Shown on the scale-degree circle, not the staff: each new drone first plays the degrees on offer, root to octave,
// pinging each, and every note played pings its degree, green or red. Rounds, replays and Stop/Start are the shared
// ear-drill runner's (earDrill.ts); this adds the drone, its introduction and stopping while the window is away.
import type { TonePlayer } from "../audio/tones";
import {
  degreeNote, EAR_DEGREES, makeEarPrompt, pickTonic, tonicMidi, type EarAction, type EarOptions, type EarPrompt,
  type EarState,
} from "../exercises/earTraining";
import { countInKey, keyRotation, rotateKey } from "../exercises/keyRotation";
import { initialNotePractice, reduceNotePractice, type Rng } from "../exercises/notePractice";
import { createDegreeKeys } from "../input/degreeKeys";
import { noRecorder, type Recorder } from "../progress/recorder";
import { earDrillBody } from "../progress/records";
import type { DegreeCircleView } from "../views/degreeCircle";
import type { ProgressStore } from "../progress/store";
import { earDisplay, roundSummaryDisplay, type PracticeView } from "../views/practice";
import { createEarDrill } from "./earDrill";
import { onPlayerInput, type AppStore, type Mode } from "./performance";
import type { RoundVizView } from "../views/roundViz";

/** How long "✓" stays up before the next note */
const NEXT_PROMPT_MS = 1000;
/** Seconds of drone before the introduction, so the key sinks in */
const DRONE_LEAD_S = 1.5;
/** The introduction: the degrees on offer, root to octave, this far apart, each ringing this long */
const INTRO_GAP_S = 0.6;
const INTRO_RING_S = 1.2;
/** Then this long before the note to find */
const INTRO_PAUSE_S = 1.2;
/** At a round's end the drone fades out over this long (the last note rings out over it) */
const ROUND_END_FADE_S = 2.5;
/** Leaving the window (another app or tab) fades the drone out over this long */
const AWAY_FADE_S = 3;

export function startEarTraining({ store, views, recorder = noRecorder, history = null, rng = Math.random }: {
  store: AppStore; views: { practice: PracticeView; tones: TonePlayer; degrees: DegreeCircleView; roundViz: RoundVizView };
  recorder?: Recorder; history?: Promise<ProgressStore> | null; rng?: Rng;
}): Mode {
  const options = () => store.getState().settings.ear;
  let keys = keyRotation(pickTonic(rng, options().tonic));
  const tonic = () => keys.key;

  /** The next prompt: in the same key, or a new one (when the tonic is random and this key has had its turn) */
  function newPrompt(previous?: EarPrompt): EarPrompt {
    keys = rotateKey(keys, options().tonic, (choice, before) => pickTonic(rng, choice, before));
    return makeEarPrompt(rng, tonic(), options().degrees, previous);
  }

  /** The key the drone is sounding in, if it is */
  let droneKey: string | null = null;

  /** The introduction's pings still to come; cut short by a skip, a stop or new options */
  let introTimers: ReturnType<typeof setTimeout>[] = [];
  function cancelIntro() {
    if (!introTimers.length) return;
    introTimers.forEach(clearTimeout);
    introTimers = [];
    views.tones.stopNotes();
  }

  /** The degrees on offer, root to octave (the root always, as the reference), as semitones above the tonic */
  function introSteps(): number[] {
    const offered = EAR_DEGREES.filter(d => d.semitones > 0 && options().degrees.includes(d.id)).map(d => d.semitones);
    return [0, ...offered, 12];
  }

  /** Sounds the prompt; when the drone is new (a new key, or just started), introduces the key first */
  function sound(state: EarState) {
    cancelIntro();
    let delay = 0;
    if (droneKey !== state.prompt.keyValue) {
      views.tones.drone(tonicMidi(tonic()) - 12);
      droneKey = state.prompt.keyValue;
      const steps = introSteps();
      // Each ping waits for its note to be heard, not just sent (Bluetooth headphones add a few hundred ms)
      const heard = views.tones.latency();
      steps.forEach((semitones, i) => {
        const at = DRONE_LEAD_S + i * INTRO_GAP_S;
        views.tones.play(tonicMidi(tonic()) + semitones, at, INTRO_RING_S);
        introTimers.push(setTimeout(() => views.degrees.ping(semitones, "hear"), (at + heard) * 1000));
      });
      delay = DRONE_LEAD_S + (steps.length - 1) * INTRO_GAP_S + INTRO_PAUSE_S;
      introTimers.push(setTimeout(() => { introTimers = []; }, delay * 1000));
    }
    views.tones.play(state.prompt.note, delay);
  }

  /** Stops the drone (fading out over `fadeOut` seconds) and the introduction; the next sound introduces the key */
  function silence(fadeOut?: number) {
    cancelIntro();
    views.tones.drone(null, fadeOut);
    droneKey = null;
  }

  const drill = createEarDrill<EarPrompt, EarState, EarAction, EarOptions>(store, views, {
    drill: "ear",
    options: s => s.settings.ear,
    setup: () => `degrees:${options().degrees.join(",")}`,
    initial: initialNotePractice(newPrompt()),
    reduce: reduceNotePractice,
    nextPrompt: newPrompt,
    // Introduced again (in `restarted`), since the degrees on offer may have changed
    freshPrompt(o, before, previous) {
      if (o.tonic !== before.tonic) keys = keyRotation(pickTonic(rng, o.tonic, tonic()));
      keys = countInKey(keys);
      return makeEarPrompt(rng, tonic(), o.degrees, previous);
    },
    nextPromptMs: NEXT_PROMPT_MS,
    record: (s, answered, ms) => earDrillBody(s.prompt, options().degrees, answered, s.missed, ms),
    sound,
    // The note again, not the introduction
    replay: s => views.tones.play(s.prompt.note),
    silence,
    display: earDisplay,
    summaryDisplay: summary => roundSummaryDisplay(summary, "Scale degrees"),
    rendered: () => views.degrees.render(options().degrees),
    judged(a, now) {
      if (a.type === "play") views.degrees.ping(a.note - tonicMidi(tonic()), now.status === "correct" ? "correct" : "wrong");
    },
    // The drone fades away under the round's last note
    roundOver: () => silence(ROUND_END_FADE_S),
    restarted: () => { droneKey = null; },
  }, recorder, history);

  /** Paused by leaving the window (another app, another tab): carries on when the player comes back */
  let pausedAway = false;
  function away() {
    // Between rounds nothing is playing, and coming back mustn't start the next round by itself
    if (!drill.running() || drill.over()) return;
    pausedAway = true;
    drill.pause(AWAY_FADE_S);
  }
  function back() {
    if (!pausedAway || document.hidden || !document.hasFocus()) return;
    pausedAway = false;
    backAt = performance.now();
    drill.resume();
  }
  /** When `back` last resumed: coming back by clicking Start would otherwise resume on focus, then stop on the click */
  let backAt = -Infinity;
  const onVisibility = () => document.hidden ? away() : back();

  const offInput = onPlayerInput(store, { noteOn: note => drill.answer({ type: "play", note }) });
  // No controller needed: 1–7 play that degree, so they're judged like any other note
  const offDegreeKeys = createDegreeKeys(event => store.dispatch({ type: "input", event }),
    digit => degreeNote(tonicMidi(tonic()), digit));
  window.addEventListener("blur", away);
  window.addEventListener("focus", back);
  document.addEventListener("visibilitychange", onVisibility);
  drill.start();

  return {
    stop() {
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", onVisibility);
      offInput();
      offDegreeKeys();
      drill.stop();
    },
    skip() {
      pausedAway = false;
      drill.skip();
    },
    replay: drill.replay,
    toggleRunning() {
      if (drill.over()) return;
      pausedAway = false;
      if (drill.running() && performance.now() - backAt < 600) return;
      drill.toggleRunning();
    },
  };
}
