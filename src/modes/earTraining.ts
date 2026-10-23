// Ear training mode: a drone on the tonic, a note played over it, and the player finds that note. Moves on after a
// correct answer; with a random tonic, the drone moves to a new key every PROMPTS_PER_KEY prompts. Stop silences
// everything and ignores played notes; Start brings the drone back and plays the current note again.
// Shown on the scale-degree circle, not the staff: each new drone first plays the degrees on offer, root to octave,
// pinging each, and every note played pings its degree, green or red.
import type { TonePlayer } from "../audio/tones";
import {
  degreeNote, EAR_DEGREES, makeEarPrompt, pickTonic, PROMPTS_PER_KEY, tonicMidi, type EarAction, type EarOptions,
  type EarPrompt, type EarState,
} from "../exercises/earTraining";
import { initialNotePractice, reduceNotePractice, type Rng } from "../exercises/notePractice";
import { createDegreeKeys } from "../input/degreeKeys";
import { noRecorder, type Recorder } from "../progress/recorder";
import { earDrillBody } from "../progress/records";
import type { DegreeCircleView } from "../views/degreeCircle";
import { earDisplay, type PracticeView } from "../views/practice";
import { onPlayerInput, type AppStore, type Mode } from "./performance";

/** How long "✓" stays up before the next note */
const NEXT_PROMPT_MS = 1000;
/** Seconds of drone before the introduction, so the key sinks in */
const DRONE_LEAD_S = 1.5;
/** The introduction: the degrees on offer, root to octave, this far apart, each ringing this long */
const INTRO_GAP_S = 0.6;
const INTRO_RING_S = 1.2;
/** Then this long before the note to find */
const INTRO_PAUSE_S = 1.2;
/** After a wrong note, the prompt note plays again this long after it */
const REPLAY_AFTER_MISS_MS = 1000;

export function startEarTraining(store: AppStore, views: {
  practice: PracticeView; tones: TonePlayer; degrees: DegreeCircleView;
}, recorder: Recorder = noRecorder, rng: Rng = Math.random): Mode {
  const options = () => store.getState().settings.ear;
  let tonic = pickTonic(rng, options().tonic);
  let inKey = 0;
  let state: EarState = initialNotePractice(newPrompt());
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
  function sound() {
    if (!running) return;
    cancelIntro();
    let delay = 0;
    if (droneKey !== state.prompt.keyValue) {
      views.tones.drone(tonicMidi(tonic) - 12);
      droneKey = state.prompt.keyValue;
      const steps = introSteps();
      steps.forEach((semitones, i) => {
        const at = DRONE_LEAD_S + i * INTRO_GAP_S;
        views.tones.play(tonicMidi(tonic) + semitones, at, INTRO_RING_S);
        introTimers.push(setTimeout(() => views.degrees.ping(semitones, "hear"), at * 1000));
      });
      delay = DRONE_LEAD_S + (steps.length - 1) * INTRO_GAP_S + INTRO_PAUSE_S;
      introTimers.push(setTimeout(() => { introTimers = []; }, delay * 1000));
    }
    views.tones.play(state.prompt.note, delay);
  }

  function silence() {
    cancelIntro();
    views.tones.drone(null);
    droneKey = null;
  }

  function render() {
    views.practice.render(earDisplay(state, options().degrees, views.tones.blocked(), running));
    views.degrees.render(options().degrees);
  }

  function apply(action: EarAction) {
    const prev = state;
    state = reduceNotePractice(state, action);
    if (state === prev) return;
    if (action.type === "play") views.degrees.ping(action.note - tonicMidi(tonic), state.status === "correct" ? "correct" : "wrong");
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

  /** New options: a fresh prompt in the right key (not a skip), introduced again since the degrees on offer changed */
  function restart(o: EarOptions, before: EarOptions) {
    clearTimeout(nextTimer);
    clearTimeout(replayTimer);
    if (o.tonic !== before.tonic) { tonic = pickTonic(rng, o.tonic, tonic); inKey = 0; }
    const prev = state.prompt;
    inKey++;
    state = { ...state, prompt: makeEarPrompt(rng, tonic, o.degrees, prev), status: "waiting", played: null, missed: false };
    shownAt = Date.now();
    droneKey = null;
    sound();
    render();
  }

  const offInput = onPlayerInput(store, { noteOn: note => { if (running) apply({ type: "play", note }); } });
  // No controller needed: 1–7 play that degree, so they're judged like any other note
  const offDegreeKeys = createDegreeKeys(event => store.dispatch({ type: "input", event }),
    digit => degreeNote(tonicMidi(tonic), digit));
  const offSettings = store.subscribe((s, p) => { if (s.settings.ear !== p.settings.ear) restart(s.settings.ear, p.settings.ear); });
  const offBlocked = views.tones.onBlockedChange(render);
  render();
  sound();

  return {
    stop() {
      offInput();
      offDegreeKeys();
      offSettings();
      offBlocked();
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
