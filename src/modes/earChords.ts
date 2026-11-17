// Ear training, chord qualities: the app plays a chord (optionally its notes one by one first) and the player picks
// which kind it is from the types they've chosen, by clicking or with the number keys. A wrong answer plays the chord
// again a second later; a right one names it on its box and moves on. The answers are a board of large boxes in the
// staff's place (no staff: the chord isn't for reading). Played notes are ignored (answering by playing comes later).
// Stop silences it; Start plays the chord again. Rounds, replays and Stop/Start are the shared ear-drill runner's
// (earDrill.ts); this sounds the chord and runs the answer board.
// On the ladder (the default), the level sets the types and inversions: rounds played on it are tagged with it, the
// levels unlocked are worked out from those rounds (src/exercises/ladders.ts), and after a round that unlocks the next
// level, Next round moves up to it.
import type { PianoSound } from "../audio/piano";
import type { TonePlayer } from "../audio/tones";
import {
  answerOrder,
  chordEarLadderTag,
  initialChordEar,
  playedChordEar,
  makeChordEarPrompt,
  qualityLabel,
  reduceChordEar,
  type ChordEarAction,
  type ChordEarOptions,
  type ChordEarPrompt,
  type ChordEarState,
} from "../exercises/chordEar";
import { CHORD_EAR_LADDER } from "../exercises/ladders";
import type { Rng } from "../exercises/random";
import type { LadderPickView } from "../views/ladderPick";
import { isTypingOrModified } from "../input/keys";
import { noRecorder, type Recorder } from "../progress/recorder";
import { chordEarDrillBody } from "../progress/records";
import type { AnswerBoard } from "../views/answerBoard";
import type { ProgressStore } from "../progress/store";
import { chordEarAnswers, chordEarDisplay, roundSummaryDisplay, type PracticeView } from "../views/practice";
import { createEarDrill, type EarDrill } from "./earDrill";
import { createLadderDrill, type LadderDrill } from "./ladderDrill";
import type { AppStore, Mode } from "./performance";
import type { RoundVizView } from "../views/roundViz";

/** How long the chord rings; with Broken, the gap between its notes and the pause before them together */
const CHORD_RING_S = 2.4,
  BROKEN_GAP_S = 0.45,
  BROKEN_PAUSE_S = 0.35;
/** How long "✓ D♭ minor" stays up before the next chord */
const NEXT_PROMPT_MS = 1500;

export function startEarChords({
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
    ladder?: LadderPickView;
    /** The sampled piano, for the Piano sound (left out in tests, which then hear the simple sound) */
    piano?: PianoSound;
  };
  recorder?: Recorder;
  history?: Promise<ProgressStore> | null;
  rng?: Rng;
}): Mode {
  /** The options as saved, and what they play (on the ladder, its level's types and inversions) */
  const saved = () => store.getState().settings.earChords;
  const options = () => playedChordEar(saved());
  const setLevel = (level: number) => store.dispatch({ type: "setEarChordOptions", options: { level } });

  /** The ladder: where the player is, unlocking, the level picker */
  const ladder: LadderDrill = createLadderDrill({
    ladder: CHORD_EAR_LADDER,
    enabled: () => saved().ladder,
    level: () => saved().level,
    counts: () => chordEarLadderTag(saved()) != null,
    setLevel,
    drill: (): EarDrill<unknown, unknown> => drill,
    picker: views.ladder,
  });
  /**
   * The chord on the sampled piano, as a pianist might play it: a little louder or softer each time, the bass first
   * and the right hand a few milliseconds behind it, unevenly (with Broken, its notes one by one first). The first
   * time, it waits for the samples to load, then plays if the chord is still the one to play.
   */
  function playOnPiano(piano: PianoSound, s: ChordEarState) {
    if (!piano.loaded()) {
      piano.load().then(
        () => {
          if (!stopped && drill.running() && drill.state().prompt === s.prompt) playOnPiano(piano, s);
        },
        e => console.error("Couldn't load the piano samples", e),
      );
      return;
    }
    const notes = s.prompt.notes;
    const velocity = 68 + Math.round(rng() * 30);
    let at = 0;
    if (options().broken) {
      notes.forEach((n, i) => piano.play(n, velocity - 10, i * BROKEN_GAP_S, 1.2));
      at = notes.length * BROKEN_GAP_S + BROKEN_PAUSE_S;
    }
    notes.forEach((n, i) => {
      const spread = i === 0 ? 0 : rng() * 0.025;
      piano.play(n, velocity + (i === 0 ? 6 : Math.round(rng() * 10) - 5), at + spread, CHORD_RING_S);
    });
  }

  let stopped = false;

  const drill = createEarDrill<ChordEarPrompt, ChordEarState, ChordEarAction, ChordEarOptions>(
    store,
    views,
    {
      drill: "chordEar",
      options: s => s.settings.earChords,
      setup: () => {
        const o = options();
        // Piano rounds compare only with piano rounds (and simple ones keep the key they always had)
        const sound = o.sound === "piano" ? ";sound:piano" : "";
        return `types:${answerOrder(o.types).join(",")};inversions:${o.inversions};broken:${o.broken}${sound}`;
      },
      ladder: () => chordEarLadderTag(saved()),
      initial: initialChordEar(makeChordEarPrompt(rng, options())),
      reduce: reduceChordEar,
      nextPrompt: previous => makeChordEarPrompt(rng, options(), previous),
      freshPrompt: (o, _before, previous) => makeChordEarPrompt(rng, playedChordEar(o), previous),
      nextPromptMs: NEXT_PROMPT_MS,
      record: (s, answered, ms) =>
        chordEarDrillBody(s.prompt, qualityLabel(s.prompt.type), options().types, answered, s.missed, ms, s.wrong),
      // The chord (its notes one by one first, with Broken), cutting off anything still sounding
      sound(s) {
        views.tones.stopNotes();
        views.piano?.allOff();
        if (options().sound === "piano" && views.piano) {
          playOnPiano(views.piano, s);
          return;
        }
        const notes = s.prompt.notes,
          level = 1 / Math.sqrt(notes.length);
        const together = options().broken ? notes.length * BROKEN_GAP_S + BROKEN_PAUSE_S : 0;
        if (options().broken) notes.forEach((n, i) => views.tones.play(n, i * BROKEN_GAP_S, 1.2, 0.8));
        for (const n of notes) views.tones.play(n, together, CHORD_RING_S, level);
      },
      // At a round's end the chord just named rings out rather than being cut off
      silence() {
        views.tones.stopNotes();
        views.piano?.allOff();
      },
      display: (s, blocked, running) => ladder.playing(chordEarDisplay(s, options().types, blocked, running)),
      // Between rounds the board holds just the way on: one large Next round, so the panel's button is hidden
      summaryDisplay: summary =>
        ladder.summary(summary, { ...roundSummaryDisplay(summary, "Chord qualities"), skipHidden: true }),
      rendered(s, { summary, running, over }) {
        if (summary) views.answers.renderNext(ladder.nextLabel());
        else views.answers.render(chordEarAnswers(s, options().types, running), { enabled: running && !over });
        ladder.rendered(summary);
      },
    },
    recorder,
    history,
  );

  const answer = (quality: string) => drill.answer({ type: "answer", quality });
  const offAnswer = views.answers.onAnswer(answer);
  const offReplay = views.answers.onReplay(drill.replay);
  const offNext = views.answers.onNext(ladder.nextRound);

  /** The number keys answer: 1 for the first button, and so on (not while typing in a field, nor with modifiers) */
  function onKey(e: KeyboardEvent) {
    if (e.repeat || isTypingOrModified(e)) return;
    const n = Number(e.key);
    const order = answerOrder(options().types);
    if (!Number.isInteger(n) || n < 1 || n > Math.min(9, order.length)) return;
    e.preventDefault();
    answer(order[n - 1]);
  }
  window.addEventListener("keydown", onKey);
  drill.start();

  // No replay here: the board's Replay is the only one
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
