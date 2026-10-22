// Wiring: input sources dispatch events into the store; views and the active mode subscribe to it.
import "./style.css";
import { CHORD_PRACTICE_GROUPS, type PromptStyle } from "./exercises/chordPractice";
import { PRESCRIPTIVE, type ExerciseOption, type ExerciseOptions, type PrescriptiveId } from "./exercises/prescriptive";
import { ROUTINES, routineById, type CircleDirection } from "./exercises/routines";
import type { MinorForm, ScaleOctaves } from "./exercises/scales";
import type { Strictness, Subdivision } from "./timing/grid";
import type { InputEvent } from "./input/events";
import { createKeyboardSource } from "./input/keyboard";
import { createMidiSource } from "./input/midi";
import { startChordPractice } from "./modes/chordPractice";
import { startFreePlay } from "./modes/freePlay";
import { startNotePractice } from "./modes/notePractice";
import { IDLE_MS, PAGE_SETUP } from "./modes/page";
import { startMetronome } from "./modes/metronome";
import { onIdle, type Mode } from "./modes/performance";
import { startProgressionPractice } from "./modes/progressionPractice";
import { startRoutinePractice } from "./modes/routinePractice";
import { startSequencePractice } from "./modes/sequencePractice";
import { createAppState, reduceApp, type AppAction, type ModeId, type Settings } from "./state/app";
import { pedalDown } from "./state/performance";
import { createStore } from "./state/store";
import { analyze } from "./theory";
import { createClickPlayer } from "./audio/click";
import { createBeatView } from "./views/beat";
import { createChordNameView } from "./views/chordName";
import { createCircleView } from "./views/circleOfFifths";
import { createFilterView } from "./views/filter";
import { createHeaderView, fillKeySelect } from "./views/header";
import { createPracticeView } from "./views/practice";
import { createStaffView } from "./views/staff";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/* ---------------------------------------------------------------
   Settings, saved between sessions in localStorage
   --------------------------------------------------------------- */
const STORAGE = {
  key: "chordDisplay.key", mode: "chordDisplay.mode", chordTypes: "chordDisplay.chordTypes",
  promptStyle: "chordDisplay.promptStyle", inversions: "chordDisplay.inversions", exercise: "chordDisplay.exercise",
  routine: "chordDisplay.routine", latency: "chordDisplay.latency",
  /** Scale options saved by an earlier version ({key, minorForm, octaves}), read if there are no exercise options */
  legacyScale: "chordDisplay.scale",
};
const load = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const loadJson = (k: string): unknown => { try { return JSON.parse(load(k) ?? "null"); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

const store = createStore(reduceApp, createAppState({
  keyValue: load(STORAGE.key),
  includeSustained: $<HTMLInputElement>("optPedal").checked,
  mode: load(STORAGE.mode),
  chordTypes: loadJson(STORAGE.chordTypes),
  promptStyle: load(STORAGE.promptStyle),
  inversions: load(STORAGE.inversions) === "1",
  exercise: loadJson(STORAGE.exercise) ?? loadJson(STORAGE.legacyScale),
  routine: loadJson(STORAGE.routine),
  latencyMs: loadJson(STORAGE.latency),
}));
store.subscribe((s, prev) => {
  if (s.settings === prev.settings) return;
  const t = s.settings;
  save(STORAGE.key, t.keyValue);
  save(STORAGE.mode, t.mode);
  save(STORAGE.chordTypes, JSON.stringify(t.chordTypes));
  save(STORAGE.promptStyle, t.promptStyle);
  save(STORAGE.inversions, t.inversions ? "1" : "0");
  save(STORAGE.exercise, JSON.stringify(t.exercise));
  save(STORAGE.routine, JSON.stringify(t.routine));
  save(STORAGE.latency, JSON.stringify(t.latencyMs));
});
const input = (event: InputEvent) => store.dispatch({ type: "input", event });

/* ---------------------------------------------------------------
   Controls: each shows a setting and dispatches changes to it
   --------------------------------------------------------------- */
function bindSelect(el: HTMLSelectElement, get: (s: Settings) => string, set: (value: string) => AppAction) {
  el.value = get(store.getState().settings);
  el.onchange = () => {
    store.dispatch(set(el.value));
    el.blur();   // so computer-key note input keeps working
  };
  store.subscribe(s => { if (el.value !== get(s.settings)) el.value = get(s.settings); });
}

function bindCheckbox(el: HTMLInputElement, get: (s: Settings) => boolean, set: (on: boolean) => AppAction) {
  el.checked = get(store.getState().settings);
  el.onchange = () => {
    store.dispatch(set(el.checked));
    el.blur();
  };
  store.subscribe(s => { el.checked = get(s.settings); });
}

/** A number input: dispatches on change (Enter, the arrows, or leaving the field), showing the setting as clamped. */
function bindNumber(el: HTMLInputElement, get: (s: Settings) => number, set: (value: number) => AppAction) {
  el.value = String(get(store.getState().settings));
  el.onchange = () => {
    if (el.value !== "" && Number.isFinite(el.valueAsNumber)) store.dispatch(set(el.valueAsNumber));
    el.value = String(get(store.getState().settings));
  };
  el.onkeydown = e => { if (e.key === "Enter" || e.key === "Escape") el.blur(); };
  store.subscribe(s => { if (document.activeElement !== el) el.value = String(get(s.settings)); });
}

fillKeySelect($("keySel"), true);
fillKeySelect($("exKey"), false);
bindSelect($("keySel"), s => s.keyValue, value => ({ type: "setKey", value }));
bindSelect($("modeSel"), s => s.mode, mode => ({ type: "setMode", mode: mode as ModeId }));
bindCheckbox($("optPedal"), s => s.includeSustained, on => ({ type: "setIncludeSustained", on }));
bindSelect($("promptStyle"), s => s.promptStyle, style => ({ type: "setPromptStyle", style: style as PromptStyle }));
bindCheckbox($("optInversions"), s => s.inversions, on => ({ type: "setInversions", on }));
const setExercise = (options: Partial<ExerciseOptions>): AppAction => ({ type: "setExerciseOptions", options });
bindSelect($("exKey"), s => s.exercise.key, key => setExercise({ key }));
bindSelect($("exOctaves"), s => String(s.exercise.octaves), v => setExercise({ octaves: Number(v) as ScaleOctaves }));
bindSelect($("exMinorForm"), s => s.exercise.minorForm, v => setExercise({ minorForm: v as MinorForm }));
bindSelect($("exChords"), s => s.exercise.sevenths ? "sevenths" : "triads", v => setExercise({ sevenths: v === "sevenths" }));
bindCheckbox($("exRootPosition"), s => s.exercise.rootPosition, rootPosition => setExercise({ rootPosition }));
bindCheckbox($("exMetronome"), s => s.exercise.metronome, metronome => setExercise({ metronome }));
bindNumber($("exBpm"), s => s.exercise.bpm, bpm => setExercise({ bpm }));
bindSelect($("exSubdivision"), s => String(s.exercise.subdivision), v => setExercise({ subdivision: Number(v) as Subdivision }));
bindSelect($("exStrictness"), s => s.exercise.strictness, v => setExercise({ strictness: v as Strictness }));
bindNumber($("latency"), s => s.latencyMs, ms => ({ type: "setLatency", ms }));
for (const r of ROUTINES) $("routineSel").append(new Option(r.name, r.id));
bindSelect($("routineSel"), s => s.routine.id, id => ({ type: "setRoutineOptions", options: { id } }));
bindSelect($("routineDir"), s => s.routine.direction,
  direction => ({ type: "setRoutineOptions", options: { direction: direction as CircleDirection } }));

/* ---------------------------------------------------------------
   Views
   --------------------------------------------------------------- */
const header = createHeaderView({
  statusDot: $("statusDot"), statusText: $("statusText"), inputs: $("inputs"), retry: $("retry"),
  pedal: $("pedal"), kbdOct: $("kbdOct"),
}, (id, on) => midi.setEnabled(id, on));
store.subscribe(s => header.setPedal(pedalDown(s.perf)));

const staff = createStaffView($("staff"));
const circle = createCircleView($("circle"));
const beat = createBeatView($("beat"));
/** Output latency above this gets a note: likely Bluetooth headphones or speakers */
const HIGH_OUTPUT_LATENCY_MS = 60;
const metronomeViews = {
  click: createClickPlayer(({ blocked, outputLatencyMs }) => {
    beat.setSoundBlocked(blocked);
    const high = outputLatencyMs != null && outputLatencyMs > HIGH_OUTPUT_LATENCY_MS;
    $("outputLatencyNote").hidden = !high;
    if (high) $("outputLatencyNote").textContent =
      `Your audio output adds about ${outputLatencyMs} ms of delay (Bluetooth?). The click is sent early to make up ` +
      `for it, but wired headphones or speakers keep it tightest.`;
  }),
  beat,
};
const chordName = createChordNameView({ root: $("freeView"), name: $("chordName"), sub: $("chordSub"), roman: $("roman"), alts: $("alts") });
const practice = createPracticeView({
  label: $("practiceLabel"), prompt: $("practicePrompt"), sub: $("practiceSub"), feedback: $("practiceFeedback"), score: $("practiceScore"),
  skip: $("practiceSkip"),
});
const chordFilter = createFilterView({ summary: $("chordFilterSummary"), body: $("chordFilterBody") }, CHORD_PRACTICE_GROUPS, "Chord types",
  types => store.dispatch({ type: "setChordTypes", types }));
chordFilter.render(store.getState().settings.chordTypes);
$("chordFilters").addEventListener("toggle", () => $("chordFilterSummary").blur());   // so Space stays the pedal
store.subscribe((s, prev) => { if (s.settings.chordTypes !== prev.settings.chordTypes) chordFilter.render(s.settings.chordTypes); });

/* ---------------------------------------------------------------
   Modes: exactly one runs at a time and owns the right-hand card
   --------------------------------------------------------------- */
const isPrescriptive = (id: ModeId): id is ModeId & PrescriptiveId => id in PRESCRIPTIVE;
const practiceViews = { staff, practice, circle };
/**
 * Starts a mode and the page behaviours its `PAGE_SETUP` turns on. The circle of fifths starts hidden; modes where
 * it is relevant draw it.
 */
function startMode(id: ModeId): Mode {
  circle.render(null);
  const mode = startModeView(id);
  const offIdle = PAGE_SETUP[id].fadeChordWhenIdle
    ? onIdle(store, IDLE_MS, { idle: () => chordName.setIdle(true), active: () => chordName.setIdle(false) })
    : null;
  const offMetronome = PAGE_SETUP[id].metronome ? startMetronome(store, metronomeViews) : null;
  return {
    ...mode,
    stop() {
      offMetronome?.();
      offIdle?.();
      chordName.setIdle(false);
      mode.stop();
    },
  };
}
const startModeView = (id: ModeId): Mode =>
  id === "free" ? startFreePlay(store, { staff, chordName, circle })
  : id === "notes" ? startNotePractice(store, practiceViews)
  : id === "chords" ? startChordPractice(store, practiceViews)
  : id === "progressions" ? startProgressionPractice(store, practiceViews)
  : id === "routines" ? startRoutinePractice(store, practiceViews)
  : startSequencePractice(store, practiceViews, id);

/**
 * The exercises a mode runs (one, or a routine's), and the keys they are in: these decide which exercise options
 * apply. A routine sets each item's key itself, so its Key selector is hidden.
 */
function exercisesOf(s: Settings): { ids: PrescriptiveId[]; keys: string[]; ownKey: boolean } {
  if (isPrescriptive(s.mode)) return { ids: [s.mode], keys: [s.exercise.key], ownKey: true };
  if (s.mode !== "routines") return { ids: [], keys: [], ownKey: false };
  const items = routineById(s.routine.id)!.items(s.routine.direction);
  return { ids: [...new Set(items.map(i => i.exercise))], keys: items.map(i => i.options.key ?? s.exercise.key), ownKey: false };
}

/** Shows the controls the mode uses: each exercise lists its options; the minor form only matters in minor keys. */
function showControls(s: Settings) {
  const id = s.mode, page = PAGE_SETUP[id];
  $("keyPick").hidden = !page.headerKey;
  $("freeView").hidden = page.panel !== "chordName";
  $("practice").hidden = page.panel !== "practice";
  const ex = exercisesOf(s);
  // Chord names vs Roman numerals matters wherever chords are prompted
  $("chordOptions").hidden = !(id === "chords" || id === "progressions" || ex.ids.some(e => PRESCRIPTIVE[e].chords));
  $("inversionsOpt").hidden = $("chordFilters").hidden = id !== "chords";
  $("routineOptions").hidden = id !== "routines";
  const used = new Set<ExerciseOption>(ex.ids.flatMap(e => PRESCRIPTIVE[e].options));
  if (!ex.ownKey) used.delete("key");
  $("exerciseOptions").hidden = !used.size;
  for (const el of document.querySelectorAll<HTMLElement>("#exerciseOptions [data-option]")) {
    const option = el.dataset.option as ExerciseOption;
    el.hidden = !used.has(option) || (option === "minorForm" && !ex.keys.some(k => k.endsWith(":minor")));
  }
  $("metronomeDetails").hidden = !s.exercise.metronome;
}

let mode = startMode(store.getState().settings.mode);
showControls(store.getState().settings);
store.subscribe((s, prev) => {
  if (s.settings === prev.settings) return;
  showControls(s.settings);
  if (s.settings.mode !== prev.settings.mode) {
    mode.stop();
    mode = startMode(s.settings.mode);
  }
});

/* ---------------------------------------------------------------
   Input sources and buttons
   --------------------------------------------------------------- */
const midi = createMidiSource(input, status => header.showMidiStatus(status));
const keyboard = createKeyboardSource(input, octave => header.setOctave(octave));

function panic() {
  input({ type: "panic", time: performance.now() });
  keyboard.reset();
}

$("practiceSkip").onclick = () => {
  $("practiceSkip").blur();   // so Space (pedal) doesn't press it again
  mode.skip?.();
};
$("routineRestart").onclick = () => {
  $("routineRestart").blur();
  mode.restart?.();
};
$("panic").onclick = panic;
$("retry").onclick = () => { $("retry").hidden = true; header.showMidiStatus({ kind: "requesting" }); midi.start(); };

midi.start();

// Exposed for testing in the console: __chord.analyze([60,64,67])
declare global {
  interface Window { __chord: unknown }
}
const now = () => performance.now();
window.__chord = {
  setKey: (value: string) => store.dispatch({ type: "setKey", value }),
  analyze: (notes: number[]) => analyze(notes, store.getState().settings.key),
  noteOn: (note: number, source = "console", channel = 0) => input({ type: "noteOn", note, velocity: 100, time: now(), source, channel }),
  noteOff: (note: number, source = "console", channel = 0) => input({ type: "noteOff", note, velocity: 0, time: now(), source, channel }),
  setPedal: (source: string, down: boolean, channel = 0) => input({ type: "pedal", down, time: now(), source, channel }),
  allOff: (source?: string) => source ? input({ type: "allNotesOff", time: now(), source }) : panic(),
  getState: () => store.getState(),
};
