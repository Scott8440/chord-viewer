// Ear training, chord qualities: the app plays a chord (optionally its notes one by one first) and the player picks
// which kind it is from the types they've chosen, by clicking or with the number keys. A wrong answer plays the chord
// again a second later; a right one names it on its box and moves on. The answers are a board of large boxes in the
// staff's place (no staff: the chord isn't for reading). Played notes are ignored (answering by playing comes later).
// Stop silences it; Start plays the chord again. Rounds, replays and Stop/Start are the shared ear-drill runner's
// (earDrill.ts); this sounds the chord and runs the answer board.
import type { TonePlayer } from "../audio/tones";
import {
  answerOrder, initialChordEar, makeChordEarPrompt, qualityLabel, reduceChordEar,
  type ChordEarAction, type ChordEarOptions, type ChordEarPrompt, type ChordEarState,
} from "../exercises/chordEar";
import type { Rng } from "../exercises/notePractice";
import { noRecorder, type Recorder } from "../progress/recorder";
import { chordEarDrillBody } from "../progress/records";
import type { AnswerBoard } from "../views/answerBoard";
import type { ProgressStore } from "../progress/store";
import { chordEarAnswers, chordEarDisplay, roundSummaryDisplay, type PracticeView } from "../views/practice";
import { createEarDrill } from "./earDrill";
import type { AppStore, Mode } from "./performance";
import type { RoundVizView } from "../views/roundViz";

/** How long the chord rings; with Broken, the gap between its notes and the pause before them together */
const CHORD_RING_S = 2.4, BROKEN_GAP_S = 0.45, BROKEN_PAUSE_S = 0.35;
/** How long "✓ D♭ minor" stays up before the next chord */
const NEXT_PROMPT_MS = 1500;

export function startEarChords(store: AppStore, views: {
  practice: PracticeView; tones: TonePlayer; answers: AnswerBoard; roundViz: RoundVizView;
}, recorder: Recorder = noRecorder, history: Promise<ProgressStore> | null = null, rng: Rng = Math.random): Mode {
  const options = () => store.getState().settings.earChords;

  const drill = createEarDrill<ChordEarPrompt, ChordEarState, ChordEarAction, ChordEarOptions>(store, views, {
    drill: "chordEar",
    options: s => s.settings.earChords,
    setup: () => { const o = options(); return `types:${answerOrder(o.types).join(",")};inversions:${o.inversions};broken:${o.broken}`; },
    initial: initialChordEar(makeChordEarPrompt(rng, options())),
    reduce: reduceChordEar,
    nextPrompt: previous => makeChordEarPrompt(rng, options(), previous),
    freshPrompt: (o, _before, previous) => makeChordEarPrompt(rng, o, previous),
    nextPromptMs: NEXT_PROMPT_MS,
    record: (s, answered, ms) =>
      chordEarDrillBody(s.prompt, qualityLabel(s.prompt.type), options().types, answered, s.missed, ms, s.wrong),
    // The chord (its notes one by one first, with Broken), cutting off anything still sounding
    sound(s) {
      views.tones.stopNotes();
      const notes = s.prompt.notes, level = 1 / Math.sqrt(notes.length);
      const together = options().broken ? notes.length * BROKEN_GAP_S + BROKEN_PAUSE_S : 0;
      if (options().broken) notes.forEach((n, i) => views.tones.play(n, i * BROKEN_GAP_S, 1.2, 0.8));
      for (const n of notes) views.tones.play(n, together, CHORD_RING_S, level);
    },
    // At a round's end the chord just named rings out rather than being cut off
    silence: () => views.tones.stopNotes(),
    display: (s, blocked, running) => chordEarDisplay(s, options().types, blocked, running),
    // Between rounds the board holds just the way on: one large Next round, so the panel's button is hidden
    summaryDisplay: summary => ({ ...roundSummaryDisplay(summary, "Chord qualities"), skipHidden: true }),
    rendered(s, { summary, running, over }) {
      if (summary) views.answers.renderNext("Next round");
      else views.answers.render(chordEarAnswers(s, options().types, running), { enabled: running && !over });
    },
  }, recorder, history);

  const answer = (quality: string) => drill.answer({ type: "answer", quality });
  const offAnswer = views.answers.onAnswer(answer);
  const offReplay = views.answers.onReplay(drill.replay);
  const offNext = views.answers.onNext(drill.nextRound);

  /** The number keys answer: 1 for the first button, and so on (not while typing in a field, nor with modifiers) */
  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || target.tagName === "INPUT" || target.tagName === "SELECT") return;
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
      offAnswer();
      offReplay();
      offNext();
      window.removeEventListener("keydown", onKey);
      drill.stop();
    },
    skip: drill.skip,
    toggleRunning: drill.toggleRunning,
  };
}
