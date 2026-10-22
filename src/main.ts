// Wiring: input sources dispatch events into the store; views and the active mode subscribe to it.
import "./style.css";
import type { InputEvent } from "./input/events";
import { createKeyboardSource } from "./input/keyboard";
import { createMidiSource } from "./input/midi";
import { startFreePlay } from "./modes/freePlay";
import { createAppState, reduceApp } from "./state/app";
import { pedalDown } from "./state/performance";
import { createStore } from "./state/store";
import { analyze } from "./theory";
import { createChordNameView } from "./views/chordName";
import { createHeaderView, initKeySelect } from "./views/header";
import { createNoteListView } from "./views/noteList";
import { createStaffView } from "./views/staff";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY_STORAGE = "chordDisplay.key";

// Settings
const keySel = $<HTMLSelectElement>("keySel");
let savedKey = "";
try { savedKey = localStorage.getItem(KEY_STORAGE) || ""; } catch {}
const optPedal = $<HTMLInputElement>("optPedal");

const store = createStore(reduceApp, createAppState(initKeySelect(keySel, savedKey), optPedal.checked));
const input = (event: InputEvent) => store.dispatch({ type: "input", event });

// Views
const header = createHeaderView({
  statusDot: $("statusDot"), statusText: $("statusText"), inputs: $("inputs"), retry: $("retry"),
  pedal: $("pedal"), kbdOct: $("kbdOct"),
}, (id, on) => midi.setEnabled(id, on));
store.subscribe(s => header.setPedal(pedalDown(s.perf)));

startFreePlay(store, {
  staff: createStaffView($("staff")),
  chordName: createChordNameView({ name: $("chordName"), sub: $("chordSub"), roman: $("roman"), alts: $("alts") }),
  noteList: createNoteListView($("notes")),
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
