// Wiring: input sources dispatch events into the store; views and the active mode subscribe to it.
import "./style.css";
import type { InputEvent } from "./input/events";
import { createKeyboardSource } from "./input/keyboard";
import { createMidiSource } from "./input/midi";
import { startFreePlay } from "./modes/freePlay";
import { startNotePractice } from "./modes/notePractice";
import type { Mode } from "./modes/performance";
import { createAppState, MODES, reduceApp, type ModeId } from "./state/app";
import { pedalDown } from "./state/performance";
import { createStore } from "./state/store";
import { analyze } from "./theory";
import { createChordNameView } from "./views/chordName";
import { createHeaderView, initKeySelect } from "./views/header";
import { createNoteListView } from "./views/noteList";
import { createPracticeView } from "./views/practice";
import { createStaffView } from "./views/staff";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY_STORAGE = "chordDisplay.key";
const MODE_STORAGE = "chordDisplay.mode";

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

const store = createStore(reduceApp, createAppState(initKeySelect(keySel, savedKey), optPedal.checked, initialMode));
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
const practice = createPracticeView({ prompt: $("practicePrompt"), feedback: $("practiceFeedback"), score: $("practiceScore") });

// Modes: exactly one runs at a time and owns the right-hand card
const startMode: Record<ModeId, () => Mode> = {
  free: () => startFreePlay(store, { staff, chordName, noteList }),
  notes: () => startNotePractice(store, { staff, noteList, practice }),
};
let mode: Mode;
function showMode(id: ModeId) {
  $("freeView").hidden = id !== "free";
  $("practice").hidden = id !== "notes";
  mode = startMode[id]();
}
showMode(initialMode);
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
