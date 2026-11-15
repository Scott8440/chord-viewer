// Settings saved between sessions in localStorage: loaded into the initial state, and each saved when it changes.
// Where and how each is kept is in the settings table (`SETTINGS`, src/state/settings.ts).
import type { AppStore } from "../modes/performance";
import { uuid } from "../progress/recorder";
import {
  SETTING_NAMES,
  SETTINGS,
  type SavedSettings,
  type SettingName,
  type SettingSpec,
  type Settings,
} from "../state/settings";
import { loadItem, loadJson, saveItem } from "./safeStorage";

/** This browser's random id for practice history records */
const DEVICE = "chordDisplay.device";

type Stored = NonNullable<SettingSpec<unknown>["storage"]>;
const storageOf = (name: SettingName): Stored | undefined => SETTINGS[name].storage;

function loadValue(key: string, format: Stored["format"]): unknown {
  switch (format) {
    case "string":
      return loadItem(key);
    case "json":
      return loadJson(key);
    case "flag":
      return loadItem(key) === "1";
  }
}

function saveValue({ key, format }: Stored, value: unknown) {
  saveItem(key, format === "json" ? JSON.stringify(value) : format === "flag" ? (value ? "1" : "0") : String(value));
}

/** The saved settings, for `createAppState` to validate. The pedal option isn't saved: it comes from the page. */
export function loadSettings(includeSustained: boolean): SavedSettings {
  const saved: SavedSettings = { includeSustained };
  for (const name of SETTING_NAMES) {
    const storage = storageOf(name);
    if (!storage) continue;
    let value = loadValue(storage.key, storage.format);
    for (const key of storage.legacy ?? []) value ??= loadValue(key, storage.format);
    saved[name] = value;
  }
  return saved;
}

/** Writes the settings that differ between `prev` and `next`, and only those. */
export function saveChangedSettings(next: Settings, prev: Settings) {
  for (const name of SETTING_NAMES) {
    const storage = storageOf(name);
    // The reducer keeps an unchanged setting's value as it was, so a new value is a changed one
    if (storage && next[name] !== prev[name]) saveValue(storage, next[name]);
  }
}

/** Saves each setting whenever it changes. */
export const saveSettingsOnChange = (store: AppStore) =>
  store.subscribe((s, prev) => {
    if (s.settings !== prev.settings) saveChangedSettings(s.settings, prev.settings);
  });

/** This browser's id, stamped on every history record so histories from several devices can be merged later */
export function deviceId(): string {
  const saved = loadItem(DEVICE);
  if (saved) return saved;
  const id = uuid();
  saveItem(DEVICE, id);
  return id;
}
