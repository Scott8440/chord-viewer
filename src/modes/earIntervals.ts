// Ear training, intervals: the app plays two notes (the lower first, the upper first, both together, or a mix) and the
// player picks how far apart they are, from the intervals on offer, by clicking or with the number keys. A wrong
// answer plays them again a second later; a right one names the notes on its box and moves on. On the ladder (the
// default) its level sets the intervals; with free choice the player picks them. With the Piano sound the notes play
// on the sampled piano. Rounds, replays and Stop/Start are the shared ear-drill runner's (earDrill.ts); the ladder is
// the shared ladder helper's (ladderDrill.ts).
import type { PianoSound } from "../audio/piano";
import type { TonePlayer } from "../audio/tones";
import {
  INTERVAL_EAR_LADDER,
  initialIntervalEar,
  intervalOrder,
  makeIntervalEarPrompt,
  offeredIntervals,
  playOrder,
  reduceIntervalEar,
  type IntervalEarAction,
  type IntervalEarOptions,
  type IntervalEarPrompt,
  type IntervalEarState,
} from "../exercises/intervalEar";
import type { Rng } from "../exercises/random";
import { isTypingOrModified } from "../input/keys";
import { noRecorder, type Recorder } from "../progress/recorder";
import { intervalEarDrillBody } from "../progress/records";
import type { ProgressStore } from "../progress/store";
import type { AnswerBoard } from "../views/answerBoard";
import type { LadderPickView } from "../views/ladderPick";
import { intervalEarAnswers, intervalEarDisplay, roundSummaryDisplay, type PracticeView } from "../views/practice";
import type { RoundVizView } from "../views/roundViz";
import { createEarDrill, type EarDrill } from "./earDrill";
import { createLadderDrill, type LadderDrill } from "./ladderDrill";
import type { AppStore, Mode } from "./performance";

/** One note after the other this far apart; how long a note rings, and both together */
const NOTE_GAP_S = 0.8,
  NOTE_RING_S = 1.3,
  TOGETHER_RING_S = 1.8;
/** How long "✓ Minor 3rd" stays up before the next interval */
const NEXT_PROMPT_MS = 1500;

export function startEarIntervals({
  store,
  views,
  recorder = noRecorder,
  history = null,
  rng = Math.random,
}: {
  store: AppStore;
  views: {
    practice: PracticeView;
    tones: TonePlayer;
    answers: AnswerBoard;
    roundViz: RoundVizView;
    /** The level picker (left out in tests) */
    intervalLadder?: LadderPickView;
    /** The sampled piano, for the Piano sound (left out in tests, which then hear the simple tone) */
    piano?: PianoSound;
  };
  recorder?: Recorder;
  history?: Promise<ProgressStore> | null;
  rng?: Rng;
}): Mode {
  const options = () => store.getState().settings.earIntervals;
  const offered = () => offeredIntervals(options());
  const setLevel = (level: number) => store.dispatch({ type: "setEarIntervalOptions", options: { level } });
  let stopped = false;

  function cut() {
    views.tones.stopNotes();
    views.piano?.allOff();
  }

  /** The two notes, one after the other or together, on the piano or the tone */
  function play(s: IntervalEarState) {
    const together = s.prompt.direction === "together";
    const piano = options().sound === "piano" ? views.piano : undefined;
    playOrder(s.prompt).forEach((note, i) => {
      const at = together ? 0 : i * NOTE_GAP_S,
        ring = together ? TOGETHER_RING_S : NOTE_RING_S;
      if (piano) piano.play(note, 80, at, ring);
      else views.tones.play(note, at, ring, together ? 0.7 : 1);
    });
  }

  /** Plays once the piano's samples are in (at once with the tone, or when they're loaded); then only if still wanted */
  function sound(s: IntervalEarState) {
    cut();
    const piano = options().sound === "piano" ? views.piano : undefined;
    if (!piano || piano.loaded()) return play(s);
    piano.load().then(
      () => {
        if (!stopped && drill.running() && drill.state().prompt === s.prompt) play(s);
      },
      e => console.error("Couldn't load the piano samples", e),
    );
  }

  const ladder: LadderDrill = createLadderDrill({
    ladder: INTERVAL_EAR_LADDER,
    enabled: () => options().ladder,
    level: () => options().level,
    counts: () => true,
    setLevel,
    drill: (): EarDrill<unknown, unknown> => drill,
    picker: views.intervalLadder,
  });

  const drill = createEarDrill<IntervalEarPrompt, IntervalEarState, IntervalEarAction, IntervalEarOptions>(
    store,
    views,
    {
      drill: "intervalEar",
      options: s => s.settings.earIntervals,
      // Rounds compare with rounds asking the same intervals, played the same way, on the same sound
      setup: () => `intervals:${intervalOrder(offered()).join(",")};play:${options().play};sound:${options().sound}`,
      ladder: () => (options().ladder ? { id: INTERVAL_EAR_LADDER.id, level: options().level } : null),
      initial: initialIntervalEar(makeIntervalEarPrompt(rng, options())),
      reduce: reduceIntervalEar,
      nextPrompt: previous => makeIntervalEarPrompt(rng, options(), previous),
      freshPrompt: (o, _before, previous) => makeIntervalEarPrompt(rng, o, previous),
      nextPromptMs: NEXT_PROMPT_MS,
      record: (s, answered, ms) => intervalEarDrillBody(s.prompt, offered(), answered, s.missed, ms, s.wrong),
      sound,
      silence: cut,
      display: (s, blocked, running) => ladder.playing(intervalEarDisplay(s, offered(), blocked, running)),
      // Between rounds the board holds just the way on: one large Next round, so the panel's button is hidden
      summaryDisplay: summary =>
        ladder.summary(summary, { ...roundSummaryDisplay(summary, "Intervals"), skipHidden: true }),
      rendered(s, { summary, running, over }) {
        if (summary) views.answers.renderNext(ladder.nextLabel());
        else views.answers.render(intervalEarAnswers(s, offered(), running), { enabled: running && !over });
        ladder.rendered(summary);
      },
    },
    recorder,
    history,
  );

  const answer = (interval: string) => drill.answer({ type: "answer", interval });
  const offAnswer = views.answers.onAnswer(answer);
  const offReplay = views.answers.onReplay(drill.replay);
  const offNext = views.answers.onNext(ladder.nextRound);

  /** The number keys answer: 1 for the first button, and so on (not while typing in a field, nor with modifiers) */
  function onKey(e: KeyboardEvent) {
    if (e.repeat || isTypingOrModified(e)) return;
    const n = Number(e.key);
    const order = intervalOrder(offered());
    if (!Number.isInteger(n) || n < 1 || n > Math.min(9, order.length)) return;
    e.preventDefault();
    answer(order[n - 1]);
  }
  window.addEventListener("keydown", onKey);
  drill.start();

  return {
    stop() {
      stopped = true;
      ladder.stop();
      offAnswer();
      offReplay();
      offNext();
      window.removeEventListener("keydown", onKey);
      drill.stop();
    },
    skip: () => (ladder.showingSummary() ? ladder.nextRound() : drill.skip()),
    toggleRunning: drill.toggleRunning,
  };
}
