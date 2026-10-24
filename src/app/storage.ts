// Settings saved between sessions in localStorage: loaded into the initial state, and saved on every change.
// Every read and write tolerates storage being unavailable (private windows, blocked site data).
import type { SavedSettings, Settings } from "../state/app";
import type { AppStore } from "../modes/performance";
import { uuid } from "../progress/recorder";

const STORAGE = {
  key: "chordDisplay.key", mode: "chordDisplay.mode", chordTypes: "chordDisplay.chordTypes",
  promptStyle: "chordDisplay.promptStyle", inversions: "chordDisplay.inversions", chordKey: "chordDisplay.chordKey", exercise: "chordDisplay.exercise",
  routine: "chordDisplay.routine", ear: "chordDisplay.ear", reading: "chordDisplay.reading",latency: "chordDisplay.latency", latencyCalibrated: "chordDisplay.latencyCalibrated",
  /** This browser's random id for practice history records */
  device: "chordDisplay.device",
  /** Scale options saved by an earlier version ({key, minorForm, octaves}), read if there are no exercise options */
  legacyScale: "chordDisplay.scale",
};
const load = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const loadJson = (k: string): unknown => { try { return JSON.parse(load(k) ?? "null"); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

/** The saved settings, for `createAppState` to validate. The pedal option isn't saved: it comes from the page. */
export function loadSettings(includeSustained: boolean): SavedSettings {
  return {
    keyValue: load(STORAGE.key),
    includeSustained,
    mode: load(STORAGE.mode),
    chordTypes: loadJson(STORAGE.chordTypes),
    promptStyle: load(STORAGE.promptStyle),
    inversions: load(STORAGE.inversions) === "1",
    chordKey: load(STORAGE.chordKey),
    exercise: loadJson(STORAGE.exercise) ?? loadJson(STORAGE.legacyScale),
    routine: loadJson(STORAGE.routine),
    ear: loadJson(STORAGE.ear),
    reading: loadJson(STORAGE.reading),
    latencyMs: loadJson(STORAGE.latency),
    latencyCalibrated: loadJson(STORAGE.latencyCalibrated),
  };
}

function saveSettings(t: Settings) {
  save(STORAGE.key, t.keyValue);
  save(STORAGE.mode, t.mode);
  save(STORAGE.chordTypes, JSON.stringify(t.chordTypes));
  save(STORAGE.promptStyle, t.promptStyle);
  save(STORAGE.inversions, t.inversions ? "1" : "0");
  save(STORAGE.chordKey, t.chordKey);
  save(STORAGE.exercise, JSON.stringify(t.exercise));
  save(STORAGE.routine, JSON.stringify(t.routine));
  save(STORAGE.ear, JSON.stringify(t.ear));
  save(STORAGE.reading, JSON.stringify(t.reading));
  save(STORAGE.latency, JSON.stringify(t.latencyMs));
  save(STORAGE.latencyCalibrated, JSON.stringify(t.latencyCalibrated));
}

/** Saves the settings whenever they change. */
export const saveSettingsOnChange = (store: AppStore) =>
  store.subscribe((s, prev) => { if (s.settings !== prev.settings) saveSettings(s.settings); });

/** This browser's id, stamped on every history record so histories from several devices can be merged later */
export function deviceId(): string {
  const saved = load(STORAGE.device);
  if (saved) return saved;
  const id = uuid();
  save(STORAGE.device, id);
  return id;
}
