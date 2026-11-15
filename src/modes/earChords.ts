// Ear training, chord qualities: the app plays a chord (optionally its notes one by one first) and the player picks
// which kind it is from the types they've chosen, by clicking or with the number keys. A wrong answer plays the chord
// again a second later; a right one names it on its box and moves on. The answers are a board of large boxes in the
// staff's place (no staff: the chord isn't for reading). Played notes are ignored (answering by playing comes later).
// Stop silences it; Start plays the chord again.
import type { TonePlayer } from "../audio/tones";
import {
  answerOrder, initialChordEar, makeChordEarPrompt, qualityLabel, reduceChordEar,
  type ChordEarAction, type ChordEarOptions, type ChordEarState,
} from "../exercises/chordEar";
import type { Rng } from "../exercises/notePractice";
import { noRecorder, type Recorder } from "../progress/recorder";
import { chordEarDrillBody } from "../progress/records";
import type { AnswerBoard } from "../views/answerBoard";
import type { ProgressStore } from "../progress/store";
import { chordEarAnswers, chordEarDisplay, roundScore, roundSummaryDisplay, type PracticeView } from "../views/practice";
import type { AppStore, Mode } from "./performance";
import type { RoundVizView } from "../views/roundViz";
import { createRoundKeeper } from "./rounds";

/** How long the chord rings; with Broken, the gap between its notes and the pause before them together */
const CHORD_RING_S = 2.4, BROKEN_GAP_S = 0.45, BROKEN_PAUSE_S = 0.35;
/** How long "✓ D♭ minor" stays up before the next chord */
const NEXT_PROMPT_MS = 1500;
/** After a wrong answer, the chord plays again this long after it */
const REPLAY_AFTER_MISS_MS = 1000;

export function startEarChords(store: AppStore, views: {
  practice: PracticeView; tones: TonePlayer; answers: AnswerBoard; roundViz: RoundVizView;
}, recorder: Recorder = noRecorder, history: Promise<ProgressStore> | null = null, rng: Rng = Math.random): Mode {
  const options = () => store.getState().settings.earChords;
  // In rounds of ROUND_SIZE chords, compared at the end with earlier rounds played with the same options
  const rounds = createRoundKeeper({
    drill: "chordEar", recorder, history, changed: () => render(),
    setup: () => { const o = options(); return `types:${answerOrder(o.types).join(",")};inversions:${o.inversions};broken:${o.broken}`; },
  });
  let state: ChordEarState = initialChordEar(makeChordEarPrompt(rng, options()));
  let nextTimer: ReturnType<typeof setTimeout> | undefined, replayTimer: ReturnType<typeof setTimeout> | undefined;
  let shownAt = Date.now();
  let running = !views.tones.blocked();
  /** Opened before any click or key press: wait for audio, then begin, rather than burst out on the first click */
  let awaitingSound = !running;

  /** Plays the chord (its notes one by one first, with Broken), cutting off anything still sounding */
  function sound() {
    if (!running) return;
    views.tones.stopNotes();
    const notes = state.prompt.notes, level = 1 / Math.sqrt(notes.length);
    const together = options().broken ? notes.length * BROKEN_GAP_S + BROKEN_PAUSE_S : 0;
    if (options().broken) notes.forEach((n, i) => views.tones.play(n, i * BROKEN_GAP_S, 1.2, 0.8));
    for (const n of notes) views.tones.play(n, together, CHORD_RING_S, level);
  }

  function clearTimers() {
    clearTimeout(nextTimer);
    clearTimeout(replayTimer);
  }

  function render() {
    const summary = rounds.summary();
    views.roundViz.render({ outcomes: rounds.outcomes(), average: rounds.average() });
    if (summary) {
      // Between rounds the board holds just the way on: one large Next round
      views.practice.render({ ...roundSummaryDisplay(summary, "Chord qualities"), skipHidden: true });
      views.answers.renderNext("Next round");
      return;
    }
    views.practice.render({ ...chordEarDisplay(state, options().types, views.tones.blocked(), running), score: roundScore(rounds.progress(state)) });
    views.answers.render(chordEarAnswers(state, options().types, running), { enabled: running });
  }

  function apply(action: ChordEarAction) {
    const prev = state;
    state = reduceChordEar(state, action);
    if (state === prev) return;
    const types = options().types;
    // Named, or skipped before being named
    if (state.status === "correct" && prev.status !== "correct") {
      recorder.record(chordEarDrillBody(state.prompt, qualityLabel(state.prompt.type), types, true, state.missed, Date.now() - shownAt, state.wrong));
    } else if (action.type === "skip" && prev.status !== "correct") {
      recorder.record(chordEarDrillBody(prev.prompt, qualityLabel(prev.prompt.type), types, false, prev.missed, Date.now() - shownAt, prev.wrong));
    }
    // The round's last chord: stop, and show how the round went until Next round
    if (state.answered !== prev.answered && rounds.check(state, action.type === "skip")) {
      clearTimers();
      views.tones.stopNotes();
      render();
      return;
    }
    if (state.prompt !== prev.prompt) {
      shownAt = Date.now();
      sound();
    }
    render();
    clearTimers();
    if (state.status === "wrong") replayTimer = setTimeout(sound, REPLAY_AFTER_MISS_MS);
    if (state.status === "correct") {
      nextTimer = setTimeout(() => apply({ type: "next", prompt: makeChordEarPrompt(rng, options(), state.prompt) }), NEXT_PROMPT_MS);
    }
  }

  const answer = (quality: string) => { if (running && !rounds.summary()) apply({ type: "answer", quality }); };
  const offAnswer = views.answers.onAnswer(answer);
  const offReplay = views.answers.onReplay(() => { if (running && !rounds.summary()) sound(); });
  const offNext = views.answers.onNext(() => { if (rounds.summary()) nextRound(); });

  /** Next round: on to a new chord (the last round's last one was answered, or skipped onto a new one) */
  function nextRound() {
    rounds.next(state);
    running = true;
    if (state.status === "correct") apply({ type: "next", prompt: makeChordEarPrompt(rng, options(), state.prompt) });
    else { shownAt = Date.now(); sound(); render(); }
  }

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

  /** New options: a fresh chord from them (not a skip) */
  function restart(o: ChordEarOptions) {
    clearTimers();
    // Other options: a new round, compared with rounds played that way
    rounds.next(state);
    state = { ...state, prompt: makeChordEarPrompt(rng, o, state.prompt), status: "waiting", wrong: [], missed: false };
    shownAt = Date.now();
    sound();
    render();
  }

  const offSettings = store.subscribe((s, p) => { if (s.settings.earChords !== p.settings.earChords) restart(s.settings.earChords); });
  const offBlocked = views.tones.onBlockedChange(() => {
    if (awaitingSound && !views.tones.blocked()) {
      awaitingSound = false;
      if (!running) {
        running = true;
        shownAt = Date.now();
        sound();
      }
    }
    render();
  });
  sound();
  render();

  return {
    stop() {
      offAnswer();
      offReplay();
      offNext();
      offSettings();
      offBlocked();
      window.removeEventListener("keydown", onKey);
      clearTimers();
      views.tones.stopNotes();
    },
    skip() {
      awaitingSound = false;
      if (rounds.summary()) { nextRound(); return; }
      running = true;
      apply({ type: "skip", prompt: makeChordEarPrompt(rng, options(), state.prompt) });
    },
    toggleRunning() {
      if (rounds.summary()) return;
      awaitingSound = false;
      clearTimers();
      running = !running;
      if (!running) {
        views.tones.stopNotes();
        render();
      } else if (state.status === "correct") {
        apply({ type: "next", prompt: makeChordEarPrompt(rng, options(), state.prompt) });
      } else {
        shownAt = Date.now();
        sound();
        render();
      }
    },
  };
}
