// Ear training, progressions: a cadence sets up the key, then a few chords play, and the player names each in order by
// its Roman numeral, on a board of numeral boxes with a slot per chord above them. A wrong answer plays the chords up
// to that one again a second later; Replay plays the whole progression. With a random key, the key changes every
// PROMPTS_PER_KEY progressions. Levels on a ladder (src/exercises/progressionEar.ts) add numerals. Chords play on the
// sampled piano, voiced with a bass note low down (the simple tone in tests, which have no piano). Rounds, replays and
// Stop/Start are the shared ear-drill runner's (earDrill.ts); this sounds the progression and runs the board.
import type { PianoSound } from "../audio/piano";
import type { TonePlayer } from "../audio/tones";
import { countInKey, keyRotation, rotateKey } from "../exercises/keyRotation";
import {
  initialProgressionEar,
  levelOf,
  makeProgressionEarPrompt,
  PROGRESSION_EAR_LADDER,
  reduceProgressionEar,
  type ProgressionChord,
  type ProgressionEarAction,
  type ProgressionEarOptions,
  type ProgressionEarPrompt,
  type ProgressionEarState,
} from "../exercises/progressionEar";
import { randomInt, type Rng } from "../exercises/random";
import { isTypingOrModified } from "../input/keys";
import { noRecorder, type Recorder } from "../progress/recorder";
import { progressionEarDrillBody } from "../progress/records";
import type { ProgressStore } from "../progress/store";
import type { AnswerBoard } from "../views/answerBoard";
import type { LadderPickView } from "../views/ladderPick";
import {
  progressionEarAnswers,
  progressionEarDisplay,
  progressionEarSlots,
  roundSummaryDisplay,
  type PracticeView,
} from "../views/practice";
import type { RoundVizView } from "../views/roundViz";
import { createEarDrill, type EarDrill } from "./earDrill";
import { createLadderDrill, type LadderDrill } from "./ladderDrill";
import type { AppStore, Mode } from "./performance";

/** The cadence: a chord this often, each ringing this long, then a pause before the progression (unhurried, so the
 *  key sinks in) */
const CADENCE_GAP_S = 0.9,
  CADENCE_RING_S = 1.125,
  CADENCE_PAUSE_S = 1.2;
/** The progression: a chord this often, each ringing this long */
const CHORD_GAP_S = 1.15,
  CHORD_RING_S = 1.35;
/** Progressions per round: each is several answers, so half the usual round */
const ROUND_OF = 10;
/** How long the named progression stays up before the next */
const NEXT_PROMPT_MS = 2200;

/** A tonic for the key choice: the one chosen, or a random one other than the last */
function pickTonic(rng: Rng, choice: string, previous?: number): number {
  if (choice !== "random") return Number(choice);
  for (;;) {
    const pc = randomInt(rng, 12);
    if (pc !== previous) return pc;
  }
}

export function startEarProgressions({
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
    progressionLadder?: LadderPickView;
    /** The sampled piano (left out in tests, which then hear the simple tone) */
    piano?: PianoSound;
  };
  recorder?: Recorder;
  history?: Promise<ProgressStore> | null;
  rng?: Rng;
}): Mode {
  const options = () => store.getState().settings.earProgressions;
  const setLevel = (level: number) => store.dispatch({ type: "setEarProgressionOptions", options: { level } });
  let keys = keyRotation(pickTonic(rng, options().tonic));
  let stopped = false;

  /** The next progression: in the same key, or a new one (when the key is random and this one has had its turn) */
  function newPrompt(previous?: ProgressionEarPrompt): ProgressionEarPrompt {
    keys = rotateKey(keys, options().tonic, (choice, before) => pickTonic(rng, choice, before));
    return makeProgressionEarPrompt(rng, options(), keys.key, previous);
  }

  /** Chords, one after another from `at` seconds, `gap` apart, each ringing `ring`, on the piano or the tone */
  function playChords(chords: readonly ProgressionChord[], at: number, gap: number, ring: number) {
    chords.forEach((c, i) => {
      const t = at + i * gap;
      if (views.piano?.loaded()) {
        const velocity = 70 + Math.round(rng() * 20);
        c.notes.forEach((n, j) =>
          views.piano!.play(n, velocity + (j === 0 ? 6 : 0), t + (j === 0 ? 0 : rng() * 0.02), ring),
        );
      } else c.notes.forEach(n => views.tones.play(n, t, ring, 1 / Math.sqrt(c.notes.length)));
    });
  }

  function cut() {
    views.tones.stopNotes();
    views.piano?.allOff();
  }

  /** Plays once the piano's samples are in (at once if they are, or there's no piano); then only if still wanted */
  function whenReady(s: ProgressionEarState, play: () => void) {
    const piano = views.piano;
    if (!piano || piano.loaded()) return play();
    piano.load().then(
      () => {
        if (!stopped && drill.running() && drill.state().prompt === s.prompt) play();
      },
      e => {
        console.error("Couldn't load the piano samples", e);
        play(); // the simple tone instead
      },
    );
  }

  const ladder: LadderDrill = createLadderDrill({
    ladder: PROGRESSION_EAR_LADDER,
    enabled: () => true,
    level: () => options().level,
    counts: () => true,
    setLevel,
    drill: (): EarDrill<unknown, unknown> => drill,
    picker: views.progressionLadder,
  });

  const numerals = () => levelOf(options()).numerals;

  const drill = createEarDrill<ProgressionEarPrompt, ProgressionEarState, ProgressionEarAction, ProgressionEarOptions>(
    store,
    views,
    {
      drill: "progressionEar",
      options: s => s.settings.earProgressions,
      setup: () => `level:${options().level};length:${options().length}`,
      roundSize: ROUND_OF,
      ladder: () => ({ id: PROGRESSION_EAR_LADDER.id, level: options().level }),
      initial: initialProgressionEar(newPrompt()),
      reduce: reduceProgressionEar,
      nextPrompt: newPrompt,
      freshPrompt(o, before, previous) {
        if (o.tonic !== before.tonic) keys = keyRotation(pickTonic(rng, o.tonic, keys.key));
        keys = countInKey(keys);
        return makeProgressionEarPrompt(rng, o, keys.key, previous);
      },
      nextPromptMs: NEXT_PROMPT_MS,
      record: (s, answered, ms) =>
        progressionEarDrillBody(s.prompt, options().level, answered, s.missed, ms, s.guesses),
      // The cadence, a pause, then the progression
      sound(s) {
        cut();
        whenReady(s, () => {
          playChords(s.prompt.cadence, 0, CADENCE_GAP_S, CADENCE_RING_S);
          const at = s.prompt.cadence.length * CADENCE_GAP_S + CADENCE_PAUSE_S;
          playChords(s.prompt.chords, at, CHORD_GAP_S, CHORD_RING_S);
        });
      },
      // After a wrong answer, the chords up to the one being named; otherwise (Replay) the whole progression
      replay(s) {
        cut();
        const upTo = s.status === "wrong" ? s.index + 1 : s.prompt.chords.length;
        whenReady(s, () => playChords(s.prompt.chords.slice(0, upTo), 0, CHORD_GAP_S, CHORD_RING_S));
      },
      silence: cut,
      display: (s, blocked, running) => ladder.playing(progressionEarDisplay(s, blocked, running)),
      // Between rounds the board holds just the way on: one large Next round, so the panel's button is hidden
      summaryDisplay: summary =>
        ladder.summary(summary, { ...roundSummaryDisplay(summary, "Progressions"), skipHidden: true }),
      rendered(s, { summary, running, over }) {
        if (summary) views.answers.renderNext(ladder.nextLabel());
        else
          views.answers.render(
            progressionEarAnswers(s, numerals(), running),
            { enabled: running && !over },
            progressionEarSlots(s),
          );
        ladder.rendered(summary);
      },
    },
    recorder,
    history,
  );

  const answer = (numeral: string) => drill.answer({ type: "answer", numeral });
  const offAnswer = views.answers.onAnswer(answer);
  const offReplay = views.answers.onReplay(drill.replay);
  const offNext = views.answers.onNext(ladder.nextRound);

  /** The number keys answer: 1 for the first button, and so on (not while typing in a field, nor with modifiers) */
  function onKey(e: KeyboardEvent) {
    if (e.repeat || isTypingOrModified(e)) return;
    const n = Number(e.key);
    const order = numerals();
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
