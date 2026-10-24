// Sight reading mode (mode id "notes"): a phrase from a song (at the chosen level, rhythm as written, transposed into
// the key) or a generated line of quarter notes, played back left to right at the exact pitch. A wrong note holds the
// step (drawn red) until the right one; the next line comes after the last note. With a random key, a new key every
// PROMPTS_PER_KEY lines. The songs are fetched the first time a level asks for them.
import { initialMelody, PROMPTS_PER_KEY, reduceMelody, type MelodyAction, type MelodyState } from "../exercises/earTraining";
import { readingLevel, type Excerpt, type ExcerptFile } from "../exercises/excerpts";
import type { Rng } from "../exercises/notePractice";
import {
  makeExcerptPrompt, makeReadingPrompt, pickReadingKey, type ReadingOptions, type ReadingPrompt,
} from "../exercises/sightReading";
import { noRecorder, type Recorder } from "../progress/recorder";
import { readingDrillBody } from "../progress/records";
import { buildKey } from "../theory";
import { readingLoadingDisplay, sightReadingDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import type { MusicStyle, StaffMusic } from "../views/staffMusic";
import { createPerformanceDrawer, onPlayerInput, type AppStore, type Mode } from "./performance";

/** How long the finished line stays up before the next */
const NEXT_PROMPT_MS = 900;

type ReadingState = MelodyState<ReadingPrompt>;

function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The phrase as drawn: played notes green (a tied note all through), the one a wrong note was meant for red */
function musicOf(s: ReadingState): StaffMusic {
  const m = s.prompt.music!;
  const styles: (MusicStyle | undefined)[][] = m.excerpt.bars.map(bar => bar.map(() => undefined));
  m.events.forEach((events, k) => {
    const style = k < s.index ? "done" : k === s.index && s.status === "wrong" ? "wrong" : undefined;
    if (style) for (const [b, i] of events) styles[b][i] = style;
  });
  return { clef: m.excerpt.clef, time: m.excerpt.time, bars: m.excerpt.bars, styles };
}

export function startSightReading(store: AppStore, views: {
  staff: StaffView; practice: PracticeView;
}, recorder: Recorder = noRecorder, library: () => Promise<ExcerptFile> = () => Promise.reject(new Error("no excerpts")),
   rng: Rng = Math.random): Mode {
  const options = () => store.getState().settings.reading;
  let keyValue = pickReadingKey(rng, options().key);
  let inKey = 0;
  let file: ExcerptFile | null = null;
  let loading = false, failed = false, stopped = false;
  /** Each level's excerpts are dealt in a shuffled order, all of them before any comes round again */
  let deck: Excerpt[] = [], deckLevel = -1;
  /** Null only while a level waits for the songs to load (or they failed to) */
  let state: ReadingState | null = null;
  /** The last line's state, for its score, while there's none */
  let carried: ReadingState | null = null;
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the current line appeared, to time the answer */
  let shownAt = Date.now();

  /** A song's phrase at the level, in the key; a generated line if none at the level can be written in it */
  function dealExcerpt(f: ExcerptFile, level: number, previous?: ReadingPrompt): ReadingPrompt {
    for (let tries = 0; tries < 50; tries++) {
      if (deckLevel !== level || !deck.length) {
        deck = shuffled(rng, f.excerpts.filter(e => readingLevel(e.features) === level));
        deckLevel = level;
        if (!deck.length) break;
      }
      const e = deck.pop()!;
      const p = makeExcerptPrompt(e, f.sources[e.source], level, keyValue);
      if (p) return p;
    }
    return makeReadingPrompt(rng, keyValue, options().range, options().length, previous);
  }

  /** A line in the current key; null when the level's songs aren't loaded */
  function makePrompt(previous?: ReadingPrompt): ReadingPrompt | null {
    const o = options();
    if (!o.level) return makeReadingPrompt(rng, keyValue, o.range, o.length, previous);
    return file ? dealExcerpt(file, o.level, previous) : null;
  }

  /** The next line: in the same key, or a new one (when the key is random and this one has had its turn) */
  function nextPrompt(previous: ReadingPrompt): ReadingPrompt {
    if (options().key === "random" && inKey >= PROMPTS_PER_KEY) {
      keyValue = pickReadingKey(rng, "random", keyValue);
      inKey = 0;
    }
    inKey++;
    return makePrompt(previous)!;
  }

  /** Shows a new line, keeping the score */
  function show(prompt: ReadingPrompt | null) {
    const before = state ?? carried;
    if (!prompt) carried = before;
    state = !prompt ? null : before
      ? { ...before, prompt, index: 0, status: "waiting", played: null, missed: false }
      : initialMelody(prompt);
    shownAt = Date.now();
    if (!prompt) load();
    render();
  }

  function load() {
    if (loading || file) return;
    loading = true;
    failed = false;
    library().then(f => { file = f; }, () => { failed = true; }).finally(() => {
      loading = false;
      if (stopped || state) return;
      if (file) { inKey++; show(makePrompt()); } else render();
    });
  }

  // The line across the staff: a song's phrase as written, or a generated line one quarter note per step (played
  // notes green, a wrong note red just after the step it was meant for). The held keys aren't drawn: they'd sit on
  // top of the notes to read.
  const drawer = createPerformanceDrawer(store, views, () => state && buildKey(state.prompt.keyValue), () => {
    if (!state) return { notes: [], slots: 1, heldAt: null };
    if (state.prompt.music) return musicOf(state);
    const s = state;
    return {
      notes: [
        ...s.prompt.notes.map((n, i) => ({ midi: n.note, style: i < s.index ? "done" as const : undefined })),
        ...(s.status === "wrong" && s.played != null ? [{ midi: s.played, style: "wrong" as const, at: s.index + 0.45 }] : []),
      ],
      slots: s.prompt.notes.length,
      heldAt: null,
      duration: "q",
    };
  });

  function render() {
    views.practice.render(state ? sightReadingDisplay(state) : readingLoadingDisplay(failed));
    // The drawer only redraws by itself on input; the line changes here
    drawer.schedule();
  }

  function apply(action: MelodyAction<ReadingPrompt>) {
    if (!state) return;
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
      nextTimer = setTimeout(() => apply({ type: "next", prompt: nextPrompt(state!.prompt) }), NEXT_PROMPT_MS);
    }
  }

  /** New options: a fresh line (not a skip) */
  function restart(o: ReadingOptions, before: ReadingOptions) {
    clearTimeout(nextTimer);
    if (o.key !== before.key) { keyValue = pickReadingKey(rng, o.key, keyValue); inKey = 0; }
    inKey++;
    show(makePrompt(state?.prompt));
  }

  const offInput = onPlayerInput(store, { noteOn: note => apply({ type: "play", note }) });
  const offSettings = store.subscribe((s, p) => { if (s.settings.reading !== p.settings.reading) restart(s.settings.reading, p.settings.reading); });
  inKey++;
  show(makePrompt());

  return {
    stop() {
      stopped = true;
      offInput();
      offSettings();
      drawer.stop();
      clearTimeout(nextTimer);
    },
    skip() {
      if (state) apply({ type: "skip", prompt: nextPrompt(state.prompt) });
    },
  };
}
