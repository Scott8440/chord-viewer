// The ear-training drills' shared runner (scale degrees, melodies, chord qualities): the app sounds a prompt and the
// player answers it. A wrong answer sounds it again a second later (another wrong answer meanwhile pushes that back,
// so it never plays over the player's trying); a right one moves on after a moment. Prompts come in rounds
// (rounds.ts), with the round's summary between them until Next round. Stop silences it and ignores answers; Start
// sounds the prompt again (or moves on, if it was answered). Opened before the browser lets audio start, it waits
// stopped and begins once it can, rather than queue sound to burst out on the first click.
// Each drill is a configuration: how it sounds and judges, what it shows, and hooks for what only it does.
import type { TonePlayer } from "../audio/tones";
import type { Judged, MoveOn } from "../exercises/judging";
import type { RoundSummary } from "../exercises/rounds";
import type { Recorder } from "../progress/recorder";
import type { DrillKind, RecordBody } from "../progress/records";
import type { ProgressStore } from "../progress/store";
import type { AppState } from "../state/app";
import { roundScore, type PracticeDisplay, type PracticeView } from "../views/practice";
import type { RoundVizView } from "../views/roundViz";
import type { AppStore } from "./performance";
import { createPromptRecords } from "./promptRecords";
import { createRoundKeeper } from "./rounds";

/** After a wrong answer, the prompt sounds again this long after it */
export const REPLAY_AFTER_MISS_MS = 1000;

export interface EarDrillViews {
  practice: PracticeView;
  tones: TonePlayer;
  roundViz: RoundVizView;
}

/** `A` is the drill's answers; moving on (next, skip) is the runner's */
export interface EarDrillConfig<P, S extends Judged<P>, A extends { type: string }, O> {
  /** What its prompts and rounds are recorded as */
  drill: DrillKind;
  /** Its options in the settings: new options start a new round with a fresh prompt */
  options(s: AppState): O;
  /** The options that make rounds comparable, as a key */
  setup(): string;
  initial: S;
  reduce(s: S, a: A | MoveOn<P>): S;
  /** The prompt after this one */
  nextPrompt(previous: P): P;
  /** A fresh prompt for new options (not a skip) */
  freshPrompt(o: O, before: O, previous: P): P;
  /** How long a right answer stays up before the next prompt (ms) */
  nextPromptMs: number;
  /** The record for a prompt answered (or, `answered` false, skipped) */
  record(s: S, answered: boolean, ms: number): RecordBody;
  /** Sounds the prompt (only while running) */
  sound(s: S): void;
  /** Sounds it again, after a miss or on Replay; the whole prompt (`sound`) if not given */
  replay?(s: S): void;
  /** Silences it (Stop, or the mode stopping), fading out over `fadeOut` seconds where that means anything */
  silence(fadeOut?: number): void;
  /** The practice panel while playing (the runner adds the round's score), and between rounds */
  display(s: S, soundBlocked: boolean, running: boolean): PracticeDisplay;
  summaryDisplay(summary: RoundSummary): PracticeDisplay;
  /** After each render: the drill's own views */
  rendered?(s: S, at: { summary: RoundSummary | null; running: boolean; over: boolean }): void;
  /** An answer changed the state */
  judged?(a: A | MoveOn<P>, now: S): void;
  /** The round's last prompt was answered or skipped (what's sounding rings out unless this stops it) */
  roundOver?(): void;
  /** New options, just before the fresh prompt sounds */
  restarted?(): void;
}

export interface EarDrill<S, A> {
  /** Sounds the first prompt and shows it */
  start(): void;
  state(): S;
  /** An answer from the player (ignored while stopped or between rounds) */
  answer(a: A): void;
  /** Skip: on to a new prompt (starting again if stopped); between rounds, Next round */
  skip(): void;
  /** Next round, once the summary shows */
  nextRound(): void;
  replay(): void;
  /** Stop or Start (not between rounds) */
  toggleRunning(): void;
  pause(fadeOut?: number): void;
  resume(): void;
  running(): boolean;
  /** The round is over (its summary may not be showing yet) */
  over(): boolean;
  /** Stops the runner: no more sounds, renders or records */
  stop(): void;
}

export function createEarDrill<P, S extends Judged<P>, A extends { type: string }, O>(store: AppStore, views: EarDrillViews,
                                                            cfg: EarDrillConfig<P, S, A, O>, recorder: Recorder,
                                                            history: Promise<ProgressStore> | null): EarDrill<S, A> {
  // In rounds of ROUND_SIZE prompts, compared at the end with earlier rounds played the same way
  const rounds = createRoundKeeper({ drill: cfg.drill, recorder, history, changed: () => render(), setup: cfg.setup });
  let state = cfg.initial;
  const records = createPromptRecords<S>(recorder, cfg.record);
  let nextTimer: ReturnType<typeof setTimeout> | undefined, replayTimer: ReturnType<typeof setTimeout> | undefined;
  /** Stopped: no sound, answers ignored. Start carries on. */
  let running = !views.tones.blocked();
  /** Opened before any click or key press, so the browser hasn't let audio start: begin once it can */
  let awaitingSound = !running;
  const replay = cfg.replay ?? cfg.sound;

  function clearTimers() {
    clearTimeout(nextTimer);
    clearTimeout(replayTimer);
  }

  function sound() {
    if (running) cfg.sound(state);
  }

  /** The prompt again from the start: timed afresh, sounded and shown */
  function again() {
    records.shown();
    sound();
    render();
  }

  function render() {
    const summary = rounds.summary();
    views.roundViz.render({ outcomes: rounds.outcomes(), average: rounds.average() });
    views.practice.render(summary ? cfg.summaryDisplay(summary)
      : { ...cfg.display(state, views.tones.blocked(), running), score: roundScore(rounds.progress(state)) });
    cfg.rendered?.(state, { summary, running, over: rounds.over() });
  }

  const next = () => apply({ type: "next", prompt: cfg.nextPrompt(state.prompt) });

  function apply(action: A | MoveOn<P>) {
    const prev = state;
    state = cfg.reduce(state, action);
    if (state === prev) return;
    cfg.judged?.(action, state);
    const skipped = action.type === "skip";
    records.changed(prev, state, skipped);
    // The round's last prompt: nothing new plays (no replay, no next prompt) and its summary shows until Next round
    if (state.answered !== prev.answered && rounds.check(state, skipped)) {
      clearTimers();
      cfg.roundOver?.();
      render();
      return;
    }
    if (state.prompt !== prev.prompt) sound();
    render();
    clearTimers();
    if (state.status === "wrong") replayTimer = setTimeout(() => { if (running) replay(state); }, REPLAY_AFTER_MISS_MS);
    if (state.status === "correct") nextTimer = setTimeout(next, cfg.nextPromptMs);
  }

  function pause(fadeOut?: number) {
    clearTimers();
    running = false;
    cfg.silence(fadeOut);
    render();
  }

  function resume() {
    clearTimers();
    running = true;
    // Stopped between an answer and the next prompt: go straight on to it
    if (state.status === "correct") next();
    else again();
  }

  /** On to a new prompt (the last round's last one was answered, or skipped onto a new one) */
  function nextRound() {
    rounds.next(state);
    running = true;
    if (state.status === "correct") next();
    else again();
  }

  /** New options: a new round (compared with rounds played that way) and a fresh prompt from them */
  function restart(o: O, before: O) {
    clearTimers();
    rounds.next(state);
    state = cfg.reduce(state, { type: "next", prompt: cfg.freshPrompt(o, before, state.prompt) });
    records.shown();
    cfg.restarted?.();
    sound();
    render();
  }

  const offSettings = store.subscribe((s, p) => {
    const o = cfg.options(s), before = cfg.options(p);
    if (o !== before) restart(o, before);
  });
  const offBlocked = views.tones.onBlockedChange(() => {
    if (awaitingSound && !views.tones.blocked()) {
      awaitingSound = false;
      if (!running) {
        running = true;
        records.shown();
        sound();
      }
    }
    render();
  });

  return {
    start() {
      sound();
      render();
    },
    state: () => state,
    answer(a) {
      if (running && !rounds.over()) apply(a);
    },
    skip() {
      awaitingSound = false;
      if (rounds.over()) {
        if (rounds.summary()) nextRound();
        else rounds.reveal();
        return;
      }
      running = true;   // skipping while stopped starts again, on the new prompt
      apply({ type: "skip", prompt: cfg.nextPrompt(state.prompt) });
    },
    nextRound() {
      if (rounds.summary()) nextRound();
    },
    replay() {
      if (running && !rounds.over()) replay(state);
    },
    toggleRunning() {
      if (rounds.over()) return;
      awaitingSound = false;
      if (running) pause();
      else resume();
    },
    pause,
    resume,
    running: () => running,
    over: () => rounds.over(),
    stop() {
      rounds.dispose();
      offSettings();
      offBlocked();
      clearTimers();
      cfg.silence();
    },
  };
}
