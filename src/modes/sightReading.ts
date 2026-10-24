// Sight reading mode (mode id "notes"): a line of notes on the staff, played back left to right at the exact pitch.
// A wrong note holds the step (drawn red beside it) until the right one; the next line comes after the last note.
// With a random key, a new key every PROMPTS_PER_KEY lines.
import { initialMelody, PROMPTS_PER_KEY, reduceMelody, type MelodyAction, type MelodyState } from "../exercises/earTraining";
import type { Rng } from "../exercises/notePractice";
import { makeReadingPrompt, pickReadingKey, type ReadingOptions, type ReadingPrompt } from "../exercises/sightReading";
import { noRecorder, type Recorder } from "../progress/recorder";
import { readingDrillBody } from "../progress/records";
import { buildKey } from "../theory";
import { sightReadingDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import { createPerformanceDrawer, onPlayerInput, type AppStore, type Mode } from "./performance";

/** How long the finished line stays up before the next */
const NEXT_PROMPT_MS = 900;

type ReadingState = MelodyState<ReadingPrompt>;

export function startSightReading(store: AppStore, views: {
  staff: StaffView; practice: PracticeView;
}, recorder: Recorder = noRecorder, rng: Rng = Math.random): Mode {
  const options = () => store.getState().settings.reading;
  let keyValue = pickReadingKey(rng, options().key);
  let inKey = 0;
  let state: ReadingState = initialMelody(newPrompt());
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the current line appeared, to time the answer */
  let shownAt = Date.now();

  /** The next line: in the same key, or a new one (when the key is random and this one has had its turn) */
  function newPrompt(previous?: ReadingPrompt): ReadingPrompt {
    if (previous && options().key === "random" && inKey >= PROMPTS_PER_KEY) {
      keyValue = pickReadingKey(rng, "random", keyValue);
      inKey = 0;
    }
    inKey++;
    return makeReadingPrompt(rng, keyValue, options().range, options().length, previous);
  }

  // The line across the staff: played notes green, a wrong note red just after the step it was meant for. The held
  // keys aren't drawn: they'd sit on top of the notes to read.
  const drawer = createPerformanceDrawer(store, views, () => buildKey(state.prompt.keyValue), () => ({
    notes: [
      ...state.prompt.notes.map((n, i) => ({ midi: n.note, style: i < state.index ? "done" as const : undefined })),
      ...(state.status === "wrong" && state.played != null
        ? [{ midi: state.played, style: "wrong" as const, at: state.index + 0.45 }] : []),
    ],
    slots: state.prompt.notes.length,
    heldAt: null,
    duration: "q",
  }));

  function render() {
    views.practice.render(sightReadingDisplay(state));
    // The drawer only redraws by itself on input; the line changes here
    drawer.schedule();
  }

  function apply(action: MelodyAction<ReadingPrompt>) {
    const prev = state;
    state = reduceMelody(state, action);
    if (state === prev) return;
    // Played through, or skipped before the end
    if (state.status === "correct" && prev.status !== "correct") {
      recorder.record(readingDrillBody(state.prompt, true, state.missed, Date.now() - shownAt));
    } else if (action.type === "skip" && prev.status !== "correct") {
      recorder.record(readingDrillBody(prev.prompt, false, prev.missed, Date.now() - shownAt));
    }
    if (state.prompt !== prev.prompt) shownAt = Date.now();
    render();
    clearTimeout(nextTimer);
    if (state.status === "correct") {
      nextTimer = setTimeout(() => apply({ type: "next", prompt: newPrompt(state.prompt) }), NEXT_PROMPT_MS);
    }
  }

  /** New options: a fresh line (not a skip) */
  function restart(o: ReadingOptions, before: ReadingOptions) {
    clearTimeout(nextTimer);
    if (o.key !== before.key) { keyValue = pickReadingKey(rng, o.key, keyValue); inKey = 0; }
    inKey++;
    state = { ...state, prompt: makeReadingPrompt(rng, keyValue, o.range, o.length, state.prompt),
              index: 0, status: "waiting", played: null, missed: false };
    shownAt = Date.now();
    render();
  }

  const offInput = onPlayerInput(store, { noteOn: note => apply({ type: "play", note }) });
  const offSettings = store.subscribe((s, p) => { if (s.settings.reading !== p.settings.reading) restart(s.settings.reading, p.settings.reading); });
  render();

  return {
    stop() {
      offInput();
      offSettings();
      drawer.stop();
      clearTimeout(nextTimer);
    },
    skip() {
      apply({ type: "skip", prompt: newPrompt(state.prompt) });
    },
  };
}
