// Wiring: input sources dispatch events into the store; views and the active mode subscribe to it.
import "./style.css";
import { CHORD_PRACTICE_GROUPS, type PromptStyle } from "./exercises/chordPractice";
import { PRESCRIPTIVE, type ExerciseOption, type ExerciseOptions, type PrescriptiveId } from "./exercises/prescriptive";
import type { MinorForm, ScaleOctaves } from "./exercises/scales";
import type { InputEvent } from "./input/events";
import { createKeyboardSource } from "./input/keyboard";
import { createMidiSource } from "./input/midi";
import { startChordPractice } from "./modes/chordPractice";
import { startFreePlay } from "./modes/freePlay";
import { startNotePractice } from "./modes/notePractice";
import type { Mode } from "./modes/performance";
import { startProgressionPractice } from "./modes/progressionPractice";
import { startSequencePractice } from "./modes/sequencePractice";
import { createAppState, reduceApp, type AppAction, type ModeId, type Settings } from "./state/app";
import { pedalDown } from "./state/performance";
import { createStore } from "./state/store";
import { analyze } from "./theory";
import { createChordNameView } from "./views/chordName";
import { createFilterView } from "./views/filter";
import { createHeaderView, fillKeySelect } from "./views/header";
import { createNoteListView } from "./views/noteList";
import { createPracticeView } from "./views/practice";
import { createStaffView } from "./views/staff";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/* ---------------------------------------------------------------
   Settings, saved between sessions in localStorage
   --------------------------------------------------------------- */
const STORAGE = {
  key: "chordDisplay.key", mode: "chordDisplay.mode", chordTypes: "chordDisplay.chordTypes",
  promptStyle: "chordDisplay.promptStyle", inversions: "chordDisplay.inversions", exercise: "chordDisplay.exercise",
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

/* ---------------------------------------------------------------
   Views
   --------------------------------------------------------------- */
const header = createHeaderView({
  statusDot: $("statusDot"), statusText: $("statusText"), inputs: $("inputs"), retry: $("retry"),
  pedal: $("pedal"), kbdOct: $("kbdOct"),
}, (id, on) => midi.setEnabled(id, on));
store.subscribe(s => header.setPedal(pedalDown(s.perf)));

const staff = createStaffView($("staff"));
const noteList = createNoteListView($("notes"));
const chordName = createChordNameView({ name: $("chordName"), sub: $("chordSub"), roman: $("roman"), alts: $("alts") });
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
const practiceViews = { staff, noteList, practice };
const startMode = (id: ModeId): Mode =>
  id === "free" ? startFreePlay(store, { staff, chordName, noteList })
  : id === "notes" ? startNotePractice(store, practiceViews)
  : id === "chords" ? startChordPractice(store, practiceViews)
  : id === "progressions" ? startProgressionPractice(store, practiceViews)
  : startSequencePractice(store, practiceViews, id);

/** Shows the controls the mode uses: each exercise lists its options; the minor form only matters in minor keys. */
function showControls(s: Settings) {
  const id = s.mode;
  // The header key is for free play only; exercises name their key or have their own selector
  $("keyPick").hidden = id !== "free";
  $("freeView").hidden = id !== "free";
  $("practice").hidden = id === "free";
  // Chord names vs Roman numerals matters wherever chords are prompted
  $("chordOptions").hidden = !(id === "chords" || id === "progressions" || id === "diatonic");
  $("inversionsOpt").hidden = $("chordFilters").hidden = id !== "chords";
  const used: readonly ExerciseOption[] = isPrescriptive(id) ? PRESCRIPTIVE[id].options : [];
  $("exerciseOptions").hidden = !used.length;
  for (const el of document.querySelectorAll<HTMLElement>("#exerciseOptions [data-option]")) {
    const option = el.dataset.option as ExerciseOption;
    el.hidden = !used.includes(option) || (option === "minorForm" && !s.exercise.key.endsWith(":minor"));
  }
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
