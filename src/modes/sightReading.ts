// Sight reading mode (mode id "notes"): a passage from a song (its melody, or its piano part's right hand, left hand
// or both; at the chosen level, rhythm as written, transposed into the key) or a generated line of quarter notes,
// played back left to right at the exact pitch, a note or a chord at a time. A wrong note holds the step (drawn red)
// until the right one; the next passage comes after the last. With a random key, a new key every PROMPTS_PER_KEY
// passages. The songs are fetched the first time a level asks for them (the piano parts only when piano is chosen).
import type { ExcerptLibrary } from "../app/excerpts";
import { PROMPTS_PER_KEY } from "../exercises/earTraining";
import type { Excerpt, ExcerptFile } from "../exercises/excerpts";
import type { Rng } from "../exercises/notePractice";
import {
  excerptLevel, initialReading, makeExcerptPrompt, makeReadingPrompt, pickReadingKey, reduceReading,
  type ReadingAction, type ReadingOptions, type ReadingPrompt, type ReadingState,
} from "../exercises/sightReading";
import { noRecorder, type Recorder } from "../progress/recorder";
import { readingDrillBody } from "../progress/records";
import { buildKey } from "../theory";
import { readingLoadingDisplay, sightReadingDisplay, type PracticeView } from "../views/practice";
import type { StaffView } from "../views/staff";
import type { MusicStyle, StaffMusic } from "../views/staffMusic";
import { createPerformanceDrawer, onPlayerInput, type AppStore, type Mode } from "./performance";

/** How long the finished passage stays up before the next */
const NEXT_PROMPT_MS = 900;

function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The passage as drawn: played notes green (a tied note all through, a chord's notes as they're struck), and the
 *  current step's other notes red after a wrong note */
export function musicOf(s: ReadingState): StaffMusic {
  const m = s.prompt.music!;
  const styles = m.staves.map((st, si) => st.voices.map((voice, vi) => voice.map((bar, b) => bar.map((e, i) => {
    const step = m.stepOf[si][vi][b][i];
    return (e.n ?? []).map((n): MusicStyle | undefined =>
      step < 0 ? undefined : step < s.index ? "done" : step > s.index ? undefined
        : s.struck.includes(n.p) ? "done" : s.status === "wrong" ? "wrong" : undefined);
  }))));
  return { staves: m.staves, time: m.time, styles };
}

const libraryOf = (o: ReadingOptions): ExcerptLibrary => o.part === "voice" ? "melody" : "piano";

export function startSightReading(store: AppStore, views: {
  staff: StaffView; practice: PracticeView;
}, recorder: Recorder = noRecorder,
   library: (which: ExcerptLibrary) => Promise<ExcerptFile> = () => Promise.reject(new Error("no excerpts")),
   rng: Rng = Math.random): Mode {
  const options = () => store.getState().settings.reading;
  let keyValue = pickReadingKey(rng, options().key);
  let inKey = 0;
  const files = new Map<ExcerptLibrary, ExcerptFile>();
  const loading = new Set<ExcerptLibrary>();
  let failed = false, stopped = false;
  /** Each level's excerpts are dealt in a shuffled order, all of them before any comes round again */
  let deck: Excerpt[] = [], deckOf = "";
  /** Null only while a level waits for the songs to load (or they failed to) */
  let state: ReadingState | null = null;
  /** The last passage's state, for its score, while there's none */
  let carried: ReadingState | null = null;
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the current passage appeared, to time the answer */
  let shownAt = Date.now();

  /** A song's passage at the level, in the key; a generated line if none at the level can be written in it */
  function dealExcerpt(f: ExcerptFile, o: ReadingOptions, previous?: ReadingPrompt): ReadingPrompt {
    const which = `${o.part}:${o.level}`;
    for (let tries = 0; tries < 50; tries++) {
      if (deckOf !== which || !deck.length) {
        deck = shuffled(rng, f.excerpts.filter(e => excerptLevel(e, o.part) === o.level));
        deckOf = which;
        if (!deck.length) break;
      }
      const e = deck.pop()!;
      const p = makeExcerptPrompt(e, f.sources[e.source], o.part, o.level, keyValue);
      if (p) return p;
    }
    return makeReadingPrompt(rng, keyValue, o.range, o.length, previous);
  }

  /** A passage in the current key; null when the level's songs aren't loaded */
  function makePrompt(previous?: ReadingPrompt): ReadingPrompt | null {
    const o = options();
    if (!o.level) return makeReadingPrompt(rng, keyValue, o.range, o.length, previous);
    const f = files.get(libraryOf(o));
    return f ? dealExcerpt(f, o, previous) : null;
  }

  /** The next passage: in the same key, or a new one (when the key is random and this one has had its turn) */
  function nextPrompt(previous: ReadingPrompt): ReadingPrompt {
    if (options().key === "random" && inKey >= PROMPTS_PER_KEY) {
      keyValue = pickReadingKey(rng, "random", keyValue);
      inKey = 0;
    }
    inKey++;
    return makePrompt(previous)!;
  }

  /** Shows a new passage, keeping the score */
  function show(prompt: ReadingPrompt | null) {
    const before = state ?? carried;
    if (!prompt) carried = before;
    state = !prompt ? null : before ? reduceReading(before, { type: "next", prompt }) : initialReading(prompt);
    shownAt = Date.now();
    if (!prompt) load(libraryOf(options()));
    render();
  }

  function load(which: ExcerptLibrary) {
    if (loading.has(which) || files.has(which)) return;
    loading.add(which);
    failed = false;
    library(which).then(f => { files.set(which, f); }, () => { failed = true; }).finally(() => {
      loading.delete(which);
      if (stopped || state) return;
      if (files.has(libraryOf(options()))) { inKey++; show(makePrompt()); } else render();
    });
  }

  // The passage on the staff: a song's as written, or a generated line one quarter note per step (played notes
  // green, a wrong note red just after the step it was meant for). The held keys aren't drawn: they'd sit on top of
  // the notes to read.
  const drawer = createPerformanceDrawer(store, views, () => state && buildKey(state.prompt.keyValue), () => {
    if (!state) return { notes: [], slots: 1, heldAt: null };
    if (state.prompt.music) return musicOf(state);
    const s = state;
    return {
      notes: [
        ...s.prompt.steps.map((step, i) => ({ midi: step[0].note, style: i < s.index ? "done" as const : undefined })),
        ...(s.status === "wrong" && s.played != null ? [{ midi: s.played, style: "wrong" as const, at: s.index + 0.45 }] : []),
      ],
      slots: s.prompt.steps.length,
      heldAt: null,
      duration: "q",
    };
  });

  function render() {
    views.practice.render(state ? sightReadingDisplay(state) : readingLoadingDisplay(failed));
    // The drawer only redraws by itself on input; the passage changes here
    drawer.schedule();
  }

  function apply(action: ReadingAction) {
    if (!state) return;
    const prev = state;
    state = reduceReading(state, action);
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

  /** New options: a fresh passage (not a skip) */
  function restart(o: ReadingOptions, before: ReadingOptions) {
    clearTimeout(nextTimer);
    if (o.key !== before.key) { keyValue = pickReadingKey(rng, o.key, keyValue); inKey = 0; }
    inKey++;
    show(makePrompt(state?.prompt));
  }

  const offInput = onPlayerInput(store, { noteOn: (note, time) => apply({ type: "play", note, time }) });
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
