// The settings table: loading and saving in localStorage (a fake one here), legacy values, saving only what changed,
// and setters that change nothing returning the same state.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSettings, saveSettingsOnChange } from "../src/app/storage";
import { createAppState, MODES, reduceApp, type AppAction, type AppState } from "../src/state/app";
import { sameSetting, SETTINGS } from "../src/state/settings";
import { createStore } from "../src/state/store";

let items: Map<string, string>, writes: string[];
beforeEach(() => {
  items = new Map();
  writes = [];
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes.push(k);
      items.set(k, v);
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const savingStore = () => {
  const store = createStore(reduceApp, createAppState(loadSettings(true)));
  saveSettingsOnChange(store);
  return store;
};
/** Every saved setting away from its default */
const changes: AppAction[] = [
  { type: "setKey", value: "Bb:minor" },
  { type: "setMode", mode: "earChords" },
  { type: "setChordTypes", types: ["M", "m", "7"] },
  { type: "setPromptStyle", style: "roman" },
  { type: "setInversions", on: true },
  { type: "setChordKey", value: "random" },
  { type: "setExerciseOptions", options: { key: "E:minor", octaves: 2, metronome: true, bpm: 92 } },
  { type: "setRoutineOptions", options: { direction: "flats" } },
  { type: "setEarOptions", options: { tonic: "D", degrees: ["1", "3", "5"], melodyLength: 5 } },
  { type: "setEarChordOptions", options: { types: ["M", "m", "dim"], broken: true } },
  { type: "setReadingOptions", options: { level: 0, length: 6, range: "bass" } },
  { type: "setLatency", ms: 35 },
  { type: "setPianoSound", on: true },
];

describe("saved settings", () => {
  it("load back as they were saved", () => {
    const store = savingStore();
    for (const a of changes) store.dispatch(a);
    const before = store.getState().settings;
    expect(before).not.toEqual(createAppState().settings);
    expect(createAppState(loadSettings(true)).settings).toEqual(before);
  });

  it("are kept in the same keys and formats as before the table", () => {
    const store = savingStore();
    for (const a of changes) store.dispatch(a);
    expect(Object.fromEntries(items)).toMatchObject({
      "chordDisplay.key": "Bb:minor",
      "chordDisplay.mode": "earChords",
      "chordDisplay.chordTypes": JSON.stringify(store.getState().settings.chordTypes),
      "chordDisplay.promptStyle": "roman",
      "chordDisplay.inversions": "1",
      "chordDisplay.chordKey": "random",
      "chordDisplay.exercise": JSON.stringify(store.getState().settings.exercise),
      "chordDisplay.routine": JSON.stringify(store.getState().settings.routine),
      "chordDisplay.ear": JSON.stringify(store.getState().settings.ear),
      "chordDisplay.earChords": JSON.stringify(store.getState().settings.earChords),
      "chordDisplay.reading": JSON.stringify(store.getState().settings.reading),
      "chordDisplay.latency": "35",
      "chordDisplay.latencyCalibrated": "true",
    });
    store.dispatch({ type: "setInversions", on: false });
    expect(items.get("chordDisplay.inversions")).toBe("0");
  });

  it("start at their defaults when nothing (or nonsense) is saved, and the pedal option comes from the page", () => {
    expect(createAppState(loadSettings(true)).settings).toEqual(createAppState().settings);
    items.set("chordDisplay.mode", "nonsense");
    items.set("chordDisplay.chordTypes", "{not json");
    items.set("chordDisplay.key", "H:major");
    const s = createAppState(loadSettings(false)).settings;
    expect(s).toMatchObject({ mode: "free", keyValue: "", key: null, includeSustained: false });
    expect(s.chordTypes).toEqual(createAppState().settings.chordTypes);
  });

  it("survive storage being unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    const store = savingStore();
    expect(store.getState().settings).toEqual(createAppState().settings);
    expect(() => store.dispatch({ type: "setMode", mode: "scales" })).not.toThrow();
  });
});

describe("legacy saved settings", () => {
  it("reads an earlier version's scale options when there are no exercise options", () => {
    items.set("chordDisplay.scale", JSON.stringify({ key: "Eb:minor", minorForm: "harmonic", octaves: 2 }));
    expect(createAppState(loadSettings(true)).settings.exercise).toMatchObject({
      key: "Eb:minor",
      minorForm: "harmonic",
      octaves: 2,
    });
    items.set("chordDisplay.exercise", JSON.stringify({ key: "G:major" }));
    expect(createAppState(loadSettings(true)).settings.exercise.key).toBe("G:major");
  });

  it("counts a latency saved before the calibrated flag existed as calibrated, unless it's 0", () => {
    const calibrated = () => createAppState(loadSettings(true)).settings.latencyCalibrated;
    expect(calibrated()).toBe(false);
    items.set("chordDisplay.latency", "0");
    expect(calibrated()).toBe(false);
    items.set("chordDisplay.latency", "25");
    expect(calibrated()).toBe(true);
    items.set("chordDisplay.latency", "0");
    items.set("chordDisplay.latencyCalibrated", "true");
    expect(calibrated()).toBe(true);
  });
});

describe("renamed modes", () => {
  it('opens sight reading for a mode saved under its old id, "notes"', () => {
    items.set("chordDisplay.mode", "notes");
    expect(createAppState(loadSettings(true)).settings.mode).toBe("reading");
    expect(createAppState({ mode: "notes" }).settings.mode).toBe("reading");
  });

  it("saves the new id once the mode changes", () => {
    items.set("chordDisplay.mode", "notes");
    const store = savingStore();
    store.dispatch({ type: "setMode", mode: "scales" });
    store.dispatch({ type: "setMode", mode: "reading" });
    expect(items.get("chordDisplay.mode")).toBe("reading");
  });
});

describe("saving", () => {
  it("writes only the settings that changed", () => {
    const store = savingStore();
    store.dispatch({ type: "setExerciseOptions", options: { bpm: 100 } });
    expect(writes).toEqual(["chordDisplay.exercise"]);
    writes.length = 0;
    store.dispatch({ type: "setLatency", ms: 20 });
    expect(writes.sort()).toEqual(["chordDisplay.latency", "chordDisplay.latencyCalibrated"]);
    writes.length = 0;
    store.dispatch({
      type: "input",
      event: { type: "noteOn", note: 60, velocity: 100, time: 0, source: "a", channel: 0 },
    });
    store.dispatch({ type: "setExerciseOptions", options: { bpm: 100 } });
    store.dispatch({ type: "setPage", page: "progress" });
    expect(writes).toEqual([]);
  });

  it("never writes the pedal option", () => {
    const store = savingStore();
    store.dispatch({ type: "setIncludeSustained", on: false });
    expect(writes).toEqual([]);
  });
});

describe("setters", () => {
  /** For each setter, an action that sets what's already there (TypeScript makes sure every setter is here) */
  const unchanged: Record<Exclude<AppAction["type"], "input">, (s: AppState) => AppAction> = {
    setKey: s => ({ type: "setKey", value: s.settings.keyValue }),
    setIncludeSustained: s => ({ type: "setIncludeSustained", on: s.settings.includeSustained }),
    setMode: s => ({ type: "setMode", mode: s.settings.mode }),
    setChordTypes: s => ({ type: "setChordTypes", types: [...s.settings.chordTypes] }),
    setPromptStyle: s => ({ type: "setPromptStyle", style: s.settings.promptStyle }),
    setInversions: s => ({ type: "setInversions", on: s.settings.inversions }),
    setPianoSound: s => ({ type: "setPianoSound", on: s.settings.pianoSound }),
    setChordKey: s => ({ type: "setChordKey", value: s.settings.chordKey }),
    setExerciseOptions: s => ({ type: "setExerciseOptions", options: { ...s.settings.exercise } }),
    setRoutineOptions: s => ({ type: "setRoutineOptions", options: { id: s.settings.routine.id } }),
    setEarOptions: s => ({ type: "setEarOptions", options: { degrees: [...s.settings.ear.degrees] } }),
    setEarChordOptions: s => ({ type: "setEarChordOptions", options: { types: [...s.settings.earChords.types] } }),
    setReadingOptions: s => ({ type: "setReadingOptions", options: { ...s.settings.reading } }),
    setLatency: s => ({ type: "setLatency", ms: s.settings.latencyMs }),
    setLatencyCalibrated: () => ({ type: "setLatencyCalibrated" }),
    setTransport: s => ({ type: "setTransport", transport: s.transport }),
    setCalibrating: s => ({ type: "setCalibrating", on: s.calibrating }),
    setPage: s => ({ type: "setPage", page: s.page }),
  };

  it("return the same state when the value is what's already set", () => {
    // Calibrated, so setting the same latency changes nothing either
    for (const s of [
      createAppState({ latencyMs: 30, latencyCalibrated: true }),
      createAppState({ keyValue: "D:major", mode: "routines", latencyMs: 30, inversions: true }),
    ]) {
      for (const [type, action] of Object.entries(unchanged)) expect(reduceApp(s, action(s)), type).toBe(s);
    }
  });

  it("return a new state when the value differs", () => {
    let s = createAppState();
    for (const a of changes) {
      const next = reduceApp(s, a);
      expect(next, a.type).not.toBe(s);
      s = next;
    }
  });
});

describe("sameSetting", () => {
  it("compares values, arrays by their items, and option objects field by field", () => {
    expect(sameSetting("a", "a")).toBe(true);
    expect(sameSetting(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameSetting(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameSetting({ t: ["M"], on: true }, { t: ["M"], on: true })).toBe(true);
    expect(sameSetting({ t: ["M"], on: true }, { t: ["M"], on: false })).toBe(false);
    expect(sameSetting({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameSetting({ a: 1 }, ["a"])).toBe(false);
    expect(sameSetting(null, {})).toBe(false);
  });

  it("covers every setting: none holds anything deeper than an array", () => {
    const flat = (v: unknown) =>
      v === null ||
      typeof v !== "object" ||
      Object.values(v).every(
        x => x === null || typeof x !== "object" || (Array.isArray(x) && x.every(y => typeof y !== "object")),
      );
    for (const [name, value] of Object.entries(createAppState().settings)) {
      if (name !== "key" && name in SETTINGS) expect(flat(value), name).toBe(true);
    }
  });
});

describe("modes", () => {
  it("has a start function for every mode and the Progress and Reference pages", async () => {
    const { MODE_REGISTRY } = await import("../src/modes/registry");
    expect(Object.keys(MODE_REGISTRY).sort()).toEqual([...MODES, "progress", "reference"].sort());
    for (const start of Object.values(MODE_REGISTRY)) expect(typeof start).toBe("function");
  });
});
