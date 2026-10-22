// Wiring: input sources dispatch events into the store; views and the active mode subscribe to it.
import "./style.css";
import type { InputEvent } from "./input/events";
import { createKeyboardSource } from "./input/keyboard";
import { createMidiSource } from "./input/midi";
import { CHORD_PRACTICE_GROUPS, PROMPT_STYLES, sanitizeChordTypes, type PromptStyle } from "./exercises/chordPractice";
import { startChordPractice } from "./modes/chordPractice";
import { startFreePlay } from "./modes/freePlay";
import { startProgressionPractice } from "./modes/progressionPractice";
import { startScalePractice } from "./modes/scalePractice";
import { MINOR_FORMS, SCALE_OCTAVES, type MinorForm, type ScaleOctaves } from "./exercises/scales";
import { startNotePractice } from "./modes/notePractice";
import type { Mode } from "./modes/performance";
import { createAppState, MODES, reduceApp, type ModeId } from "./state/app";
import { pedalDown } from "./state/performance";
import { createStore } from "./state/store";
import { analyze } from "./theory";
import { createChordNameView } from "./views/chordName";
import { createFilterView } from "./views/filter";
import { createHeaderView, initKeySelect } from "./views/header";
import { createNoteListView } from "./views/noteList";
import { createPracticeView } from "./views/practice";
import { createStaffView } from "./views/staff";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY_STORAGE = "chordDisplay.key";
const MODE_STORAGE = "chordDisplay.mode";
const CHORD_TYPES_STORAGE = "chordDisplay.chordTypes";
const PROMPT_STYLE_STORAGE = "chordDisplay.promptStyle";
const INVERSIONS_STORAGE = "chordDisplay.inversions";
const SCALE_STORAGE = "chordDisplay.scale";

// Settings
const keySel = $<HTMLSelectElement>("keySel");
let savedKey = "";
try { savedKey = localStorage.getItem(KEY_STORAGE) || ""; } catch {}
const optPedal = $<HTMLInputElement>("optPedal");
const modeSel = $<HTMLSelectElement>("modeSel");
let savedMode = "";
try { savedMode = localStorage.getItem(MODE_STORAGE) || ""; } catch {}
const initialMode: ModeId = (MODES as readonly string[]).includes(savedMode) ? savedMode as ModeId : "free";
modeSel.value = initialMode;
let savedChordTypes: string[] = [];
try { savedChordTypes = JSON.parse(localStorage.getItem(CHORD_TYPES_STORAGE) || "[]"); } catch {}
const promptStyleSel = $<HTMLSelectElement>("promptStyle");
let savedPromptStyle = "";
try { savedPromptStyle = localStorage.getItem(PROMPT_STYLE_STORAGE) || ""; } catch {}
const initialPromptStyle: PromptStyle = (PROMPT_STYLES as readonly string[]).includes(savedPromptStyle) ? savedPromptStyle as PromptStyle : "names";
promptStyleSel.value = initialPromptStyle;
const optInversions = $<HTMLInputElement>("optInversions");
try { optInversions.checked = localStorage.getItem(INVERSIONS_STORAGE) === "1"; } catch {}
const minorFormSel = $<HTMLSelectElement>("minorForm"), scaleOctavesSel = $<HTMLSelectElement>("scaleOctaves");
let savedScale: { key?: unknown; minorForm?: unknown; octaves?: unknown } = {};
try { savedScale = JSON.parse(localStorage.getItem(SCALE_STORAGE) || "{}") ?? {}; } catch {}
const initialMinorForm: MinorForm = (MINOR_FORMS as readonly unknown[]).includes(savedScale.minorForm) ? savedScale.minorForm as MinorForm : "natural";
const initialOctaves: ScaleOctaves = (SCALE_OCTAVES as readonly unknown[]).includes(savedScale.octaves) ? savedScale.octaves as ScaleOctaves : 1;
minorFormSel.value = initialMinorForm;
const scaleKeySel = $<HTMLSelectElement>("scaleKeySel");
const initialScaleKey = initKeySelect(scaleKeySel, typeof savedScale.key === "string" ? savedScale.key : "C:major", false);
scaleOctavesSel.value = String(initialOctaves);

const store = createStore(reduceApp, createAppState(initKeySelect(keySel, savedKey), optPedal.checked, initialMode,
                                                    sanitizeChordTypes(Array.isArray(savedChordTypes) ? savedChordTypes : []),
                                                    initialPromptStyle, optInversions.checked, initialMinorForm, initialOctaves,
                                                    initialScaleKey));
const input = (event: InputEvent) => store.dispatch({ type: "input", event });

// Views
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
const chordFilter = createFilterView({ summary: $("chordFilterSummary"), body: $("chordFilterBody") }, CHORD_PRACTICE_GROUPS, "Chord types", types => {
  store.dispatch({ type: "setChordTypes", types });
  try { localStorage.setItem(CHORD_TYPES_STORAGE, JSON.stringify(store.getState().settings.chordTypes)); } catch {}
});
chordFilter.render(store.getState().settings.chordTypes);
$("chordFilters").addEventListener("toggle", () => $("chordFilterSummary").blur());   // so Space stays the pedal
store.subscribe((s, prev) => { if (s.settings.chordTypes !== prev.settings.chordTypes) chordFilter.render(s.settings.chordTypes); });


// Modes: exactly one runs at a time and owns the right-hand card
const startMode: Record<ModeId, () => Mode> = {
  free: () => startFreePlay(store, { staff, chordName, noteList }),
  notes: () => startNotePractice(store, { staff, noteList, practice }),
  chords: () => startChordPractice(store, { staff, noteList, practice }),
  progressions: () => startProgressionPractice(store, { staff, noteList, practice }),
  scales: () => startScalePractice(store, { staff, noteList, practice }),
};
let mode: Mode;
function showMode(id: ModeId) {
  // The header key is for free play only; exercises name their key or have their own selector
  $("keyPick").hidden = id !== "free";
  $("freeView").hidden = id !== "free";
  $("practice").hidden = id === "free";
  // Chord and progression practice share the prompt style; inversions and the type filter are chord practice only
  $("chordOptions").hidden = id !== "chords" && id !== "progressions";
  $("inversionsOpt").hidden = id !== "chords";
  $("chordFilters").hidden = id !== "chords";
  $("scaleOptions").hidden = id !== "scales";
  mode = startMode[id]();
}
showMode(initialMode);
// Scale options: the minor form only matters for a minor scale
const showMinorForm = (s = store.getState()) => { $("minorFormPick").hidden = !s.settings.scaleKey.endsWith(":minor"); };
showMinorForm();
store.subscribe((s, prev) => { if (s.settings.scaleKey !== prev.settings.scaleKey) showMinorForm(s); });
store.subscribe((s, prev) => {
  if (s.settings.mode === prev.settings.mode) return;
  mode.stop();
  showMode(s.settings.mode);
});

// Input sources
const midi = createMidiSource(input, status => header.showMidiStatus(status));
const keyboard = createKeyboardSource(input, octave => header.setOctave(octave));

function panic() {
  input({ type: "panic", time: performance.now() });
  keyboard.reset();
}

function onKeyChange() {
  store.dispatch({ type: "setKey", value: keySel.value });
  try { localStorage.setItem(KEY_STORAGE, keySel.value); } catch {}
  keySel.blur();   // so computer-key note input keeps working
}

// Controls
keySel.onchange = onKeyChange;
optPedal.onchange = () => store.dispatch({ type: "setIncludeSustained", on: optPedal.checked });
optInversions.onchange = () => {
  store.dispatch({ type: "setInversions", on: optInversions.checked });
  try { localStorage.setItem(INVERSIONS_STORAGE, optInversions.checked ? "1" : "0"); } catch {}
  optInversions.blur();   // so computer-key note input keeps working
};
const saveScaleOptions = () => {
  const { scaleKey, minorForm, scaleOctaves } = store.getState().settings;
  try { localStorage.setItem(SCALE_STORAGE, JSON.stringify({ key: scaleKey, minorForm, octaves: scaleOctaves })); } catch {}
};
scaleKeySel.onchange = () => {
  store.dispatch({ type: "setScaleOptions", key: scaleKeySel.value });
  saveScaleOptions();
  scaleKeySel.blur();   // so computer-key note input keeps working
};
minorFormSel.onchange = () => {
  store.dispatch({ type: "setScaleOptions", minorForm: minorFormSel.value as MinorForm });
  saveScaleOptions();
  minorFormSel.blur();   // so computer-key note input keeps working
};
scaleOctavesSel.onchange = () => {
  store.dispatch({ type: "setScaleOptions", octaves: Number(scaleOctavesSel.value) as ScaleOctaves });
  saveScaleOptions();
  scaleOctavesSel.blur();
};
promptStyleSel.onchange = () => {
  store.dispatch({ type: "setPromptStyle", style: promptStyleSel.value as PromptStyle });
  try { localStorage.setItem(PROMPT_STYLE_STORAGE, promptStyleSel.value); } catch {}
  promptStyleSel.blur();   // so computer-key note input keeps working
};
modeSel.onchange = () => {
  store.dispatch({ type: "setMode", mode: modeSel.value as ModeId });
  try { localStorage.setItem(MODE_STORAGE, modeSel.value); } catch {}
  modeSel.blur();   // so computer-key note input keeps working
};
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
  setKey: (v: string) => { keySel.value = v; onKeyChange(); },
  analyze: (notes: number[]) => analyze(notes, store.getState().settings.key),
  noteOn: (note: number, source = "console", channel = 0) => input({ type: "noteOn", note, velocity: 100, time: now(), source, channel }),
  noteOff: (note: number, source = "console", channel = 0) => input({ type: "noteOff", note, velocity: 0, time: now(), source, channel }),
  setPedal: (source: string, down: boolean, channel = 0) => input({ type: "pedal", down, time: now(), source, channel }),
  allOff: (source?: string) => source ? input({ type: "allNotesOff", time: now(), source }) : panic(),
  getState: () => store.getState(),
};
