// Wiring: input sources dispatch events into the store; views and the active mode subscribe to it.
// The larger pieces live in src/app/: saved settings, the controls, practice history and calibration.
import "./style.css";
import { setUpCalibration } from "./app/calibration";
import { bindControls, showControls } from "./app/controls";
import { loadExcerpts } from "./app/excerpts";
import { $, onPress } from "./app/dom";
import { openHistory } from "./app/history";
import { createMidiMapper } from "./app/midiMap";
import { deviceId, loadSettings, saveSettingsOnChange } from "./app/storage";
import { createClickPlayer } from "./audio/click";
import { createTonePlayer } from "./audio/tones";
import type { InputEvent } from "./input/events";
import { createKeyboardSource } from "./input/keyboard";
import { createMidiSource } from "./input/midi";
import { startMetronome } from "./modes/metronome";
import { IDLE_MS, pageSetup, viewOf, type View } from "./modes/page";
import { onIdle, type Mode } from "./modes/performance";
import { selectProgress } from "./modes/progress";
import { MODE_REGISTRY, type ModeDeps } from "./modes/registry";
import { createAppState, reduceApp } from "./state/app";
import { pedalDown } from "./state/performance";
import { createStore } from "./state/store";
import { analyze } from "./theory";
import { createBeatView } from "./views/beat";
import { createChordNameView } from "./views/chordName";
import { createCircleView } from "./views/circleOfFifths";
import { createAnswerBoard } from "./views/answerBoard";
import { createRoundVizView } from "./views/roundViz";
import { createDegreeCircle } from "./views/degreeCircle";
import { createHeaderView } from "./views/header";
import { createPracticeView } from "./views/practice";
import { createProgressView } from "./views/progressView";
import { createStaffView } from "./views/staff";
import { fitToStaffCorner } from "./views/staffCorner";

/* ---------------------------------------------------------------
   State: saved settings in, each change saved
   --------------------------------------------------------------- */
const store = createStore(reduceApp, createAppState(loadSettings($<HTMLInputElement>("optPedal").checked)));
saveSettingsOnChange(store);
// MIDI mapping: a mapped key presses its control (in the mode it was mapped in) instead of being played
const midiMapper = createMidiMapper({
  button: $<HTMLButtonElement>("midiMapBtn"),
  hint: $("midiMapHint"),
  scope: () => (store.getState().page === "progress" ? null : store.getState().settings.mode),
});
const input = (event: InputEvent) => {
  if (!midiMapper.handle(event)) store.dispatch({ type: "input", event });
};
bindControls(store);
const history = openHistory(deviceId(), () => mode.refresh?.());

/* ---------------------------------------------------------------
   Views
   --------------------------------------------------------------- */
const header = createHeaderView(
  {
    statusDot: $("statusDot"),
    statusText: $("statusText"),
    inputs: $("inputs"),
    retry: $("retry"),
    pedal: $("pedal"),
    kbdOct: $("kbdOct"),
  },
  (id, on) => midi.setEnabled(id, on),
);
store.subscribe(s => header.setPedal(pedalDown(s.perf)));

const staff = createStaffView($("staff"));
const circle = createCircleView($("circle"));
const degreeCircle = createDegreeCircle($("degreeCircle"));
const answerBoard = createAnswerBoard($("answerBoard"));
// TEMPORARY switcher between the round score views (see roundViz.ts)
const roundViz = createRoundVizView($("roundViz"), $<HTMLSelectElement>("roundVizStyle"));
const progressView = createProgressView($("progressView"), {
  change(selection) {
    selectProgress(selection);
    mode.refresh?.();
  },
  back: () => store.dispatch({ type: "setPage", page: "practice" }),
});
// The circle fills the staff's free top-right corner, growing and shrinking with the window
fitToStaffCorner($("circle"), $("staffCard"), $("staff"));
const beat = createBeatView($("beat"));
const calibrationDialog = setUpCalibration(store);
/** Output latency above this gets a note: likely Bluetooth headphones or speakers */
const HIGH_OUTPUT_LATENCY_MS = 60;
const metronomeViews = {
  click: createClickPlayer(({ blocked, outputLatencyMs }) => {
    beat.setSoundBlocked(blocked);
    calibrationDialog.setSoundBlocked(blocked);
    const high = outputLatencyMs != null && outputLatencyMs > HIGH_OUTPUT_LATENCY_MS;
    $("outputLatencyNote").hidden = !high;
    if (high)
      $("outputLatencyNote").textContent =
        `Your audio output adds about ${outputLatencyMs} ms of delay (Bluetooth?). The click is sent early to make up ` +
        `for it, but wired headphones or speakers keep it tightest.`;
  }),
  beat,
};
const chordName = createChordNameView({
  root: $("freeView"),
  name: $("chordName"),
  sub: $("chordSub"),
  roman: $("roman"),
  alts: $("alts"),
});
const practice = createPracticeView({
  label: $("practiceLabel"),
  prompt: $("practicePrompt"),
  sub: $("practiceSub"),
  feedback: $("practiceFeedback"),
  score: $("practiceScore"),
  skip: $("practiceSkip"),
  stop: $("practiceStop"),
});
const tones = createTonePlayer();

/* ---------------------------------------------------------------
   Modes: exactly one runs at a time and owns the right-hand card
   --------------------------------------------------------------- */
const modeDeps: ModeDeps = {
  store,
  views: {
    staff,
    practice,
    circle,
    chordName,
    tones,
    degrees: degreeCircle,
    answers: answerBoard,
    roundViz,
    progress: progressView,
  },
  recorder: history.recorder,
  history: history.store,
  saved: history.saved,
  excerpts: loadExcerpts,
};
/**
 * Starts a mode and the page behaviours its `PAGE_SETUP` turns on. The circle of fifths starts hidden; modes where
 * it is relevant draw it.
 */
function startMode(id: View): Mode {
  circle.render(null);
  roundViz.render(null); // the ear modes draw it
  const mode = MODE_REGISTRY[id](modeDeps);
  const offIdle = pageSetup(id).fadeChordWhenIdle
    ? onIdle(store, IDLE_MS, { idle: () => chordName.setIdle(true), active: () => chordName.setIdle(false) })
    : null;
  const offMetronome = pageSetup(id).metronome ? startMetronome(store, metronomeViews) : null;
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
let mode = startMode(viewOf(store.getState()));
showControls(store.getState());
store.subscribe((s, prev) => {
  if (s.settings === prev.settings && s.page === prev.page) return;
  showControls(s);
  if (viewOf(s) !== viewOf(prev)) {
    mode.stop();
    mode = startMode(viewOf(s));
  }
});
// Progress: a page of its own, opened and closed from the header (choosing a mode also goes back to practising)
onPress("progressBtn", () =>
  store.dispatch({ type: "setPage", page: store.getState().page === "progress" ? "practice" : "progress" }),
);

/* ---------------------------------------------------------------
   Input sources and buttons
   --------------------------------------------------------------- */
const midi = createMidiSource(input, status => header.showMidiStatus(status));
const keyboard = createKeyboardSource(input, octave => header.setOctave(octave));

function panic() {
  input({ type: "panic", time: performance.now() });
  keyboard.reset();
}

onPress("practiceSkip", () => mode.skip?.());
onPress("practiceReplay", () => mode.replay?.());
onPress("practiceStop", () => mode.toggleRunning?.());
onPress("routineRestart", () => mode.restart?.());
$("panic").onclick = panic;
$("retry").onclick = () => {
  $("retry").hidden = true;
  header.showMidiStatus({ kind: "requesting" });
  midi.start();
};

midi.start();

// Exposed for testing in the console: __chord.analyze([60,64,67])
declare global {
  interface Window {
    __chord: unknown;
  }
}
const now = () => performance.now();
window.__chord = {
  setKey: (value: string) => store.dispatch({ type: "setKey", value }),
  analyze: (notes: number[]) => analyze(notes, store.getState().settings.key),
  noteOn: (note: number, source = "console", channel = 0) =>
    input({ type: "noteOn", note, velocity: 100, time: now(), source, channel }),
  noteOff: (note: number, source = "console", channel = 0) =>
    input({ type: "noteOff", note, velocity: 0, time: now(), source, channel }),
  setPedal: (source: string, down: boolean, channel = 0) =>
    input({ type: "pedal", down, time: now(), source, channel }),
  allOff: (source?: string) => (source ? input({ type: "allNotesOff", time: now(), source }) : panic()),
  getState: () => store.getState(),
};
