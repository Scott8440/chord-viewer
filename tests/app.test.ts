// App reducer: settings and the input history buffer.
import { describe, expect, it } from "vitest";
import type { InputEvent } from "../src/input/events";
import { createAppState, HISTORY_LIMIT, reduceApp } from "../src/state/app";

const noteOn = (note: number, time = 0): InputEvent => ({ type: "noteOn", note, velocity: 100, time, source: "a", channel: 0 });

describe("app reducer", () => {
  it("builds the key context from the selector value", () => {
    const s = reduceApp(createAppState(), { type: "setKey", value: "Bb:minor" });
    expect(s.settings.key?.label).toBe("Bb minor");
    expect(reduceApp(s, { type: "setKey", value: "" }).settings.key).toBeNull();
  });

  it("records input events in order and caps the history", () => {
    let s = createAppState();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s = reduceApp(s, { type: "input", event: noteOn(60, i) });
    expect(s.history).toHaveLength(HISTORY_LIMIT);
    expect(s.history[0].time).toBe(10);
    expect(s.history.at(-1)!.time).toBe(HISTORY_LIMIT + 9);
  });

  it("records events even when they change nothing else", () => {
    const s = reduceApp(createAppState(), { type: "input", event: { type: "noteOff", note: 60, velocity: 0, time: 1, source: "a", channel: 0 } });
    expect(s.history).toHaveLength(1);
    expect(s.perf).toBe(createAppState().perf);
  });
});

describe("store", () => {
  it("does not notify a listener that unsubscribed earlier in the same dispatch", async () => {
    const { createStore } = await import("../src/state/store");
    const store = createStore((s: number, a: number) => s + a, 0);
    const calls: string[] = [];
    let offB = () => {};
    store.subscribe(() => { calls.push("a"); offB(); });   // like the mode switcher stopping the old mode
    offB = store.subscribe(() => calls.push("b"));
    store.dispatch(1);
    expect(calls).toEqual(["a"]);
    store.dispatch(1);
    expect(calls).toEqual(["a", "a"]);
  });
});

describe("the Progress page", () => {
  it("opens and closes apart from the mode, and isn't saved", () => {
    const s = reduceApp(createAppState({ mode: "scales" }), { type: "setPage", page: "progress" });
    expect(s).toMatchObject({ page: "progress", settings: { mode: "scales" } });
    expect(reduceApp(s, { type: "setPage", page: "progress" })).toBe(s);
    expect(reduceApp(s, { type: "setPage", page: "practice" }).page).toBe("practice");
    expect(createAppState({ mode: "progress" })).toMatchObject({ page: "practice", settings: { mode: "free" } });
  });

  it("choosing a mode goes back to practising, the same mode included", () => {
    const s = reduceApp(createAppState({ mode: "scales" }), { type: "setPage", page: "progress" });
    expect(reduceApp(s, { type: "setMode", mode: "chords" })).toMatchObject({ page: "practice", settings: { mode: "chords" } });
    expect(reduceApp(s, { type: "setMode", mode: "scales" })).toMatchObject({ page: "practice", settings: { mode: "scales" } });
  });
});

