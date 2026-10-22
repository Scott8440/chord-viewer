// Idleness for page behaviours (the free play chord fade): no input for a while, with nothing sounding.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onIdle } from "../src/modes/performance";
import { createAppState, reduceApp } from "../src/state/app";
import { createStore } from "../src/state/store";

const note = (type: "noteOn" | "noteOff", n: number) =>
  ({ type: "input" as const, event: { type, note: n, velocity: type === "noteOn" ? 100 : 0, time: 0, source: "t", channel: 0 } });

describe("onIdle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const store = createStore(reduceApp, createAppState());
    const calls: string[] = [];
    const stop = onIdle(store, 1000, { idle: () => calls.push("idle"), active: () => calls.push("active") });
    return { store, calls, stop };
  }

  it("goes idle after the wait without input, and any input is activity", () => {
    const { store, calls } = setup();
    vi.advanceTimersByTime(999);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(["idle"]);
    store.dispatch(note("noteOn", 60));
    expect(calls).toEqual(["idle", "active"]);
  });

  it("input restarts the wait", () => {
    const { store, calls } = setup();
    vi.advanceTimersByTime(800);
    store.dispatch(note("noteOn", 60));
    store.dispatch(note("noteOff", 60));
    vi.advanceTimersByTime(800);
    expect(calls).toEqual(["active", "active"]);
    vi.advanceTimersByTime(200);
    expect(calls).toEqual(["active", "active", "idle"]);
  });

  it("isn't idle while notes sound; letting go starts the wait", () => {
    const { store, calls } = setup();
    store.dispatch(note("noteOn", 60));
    vi.advanceTimersByTime(5000);
    expect(calls).toEqual(["active"]);
    store.dispatch(note("noteOff", 60));
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual(["active", "active", "idle"]);
  });

  it("stops", () => {
    const { store, calls, stop } = setup();
    stop();
    store.dispatch(note("noteOn", 60));
    vi.advanceTimersByTime(5000);
    expect(calls).toEqual([]);
  });
});
