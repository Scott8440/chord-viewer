// The prescriptive exercise mode: a finished run moves the exercise on to the next key, but not once the mode has
// stopped. Fakes stand in for the views; requestAnimationFrame is stubbed (no DOM here).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESCRIPTIVE } from "../src/exercises/prescriptive";
import { startSequencePractice } from "../src/modes/sequencePractice";
import { createAppState, reduceApp, type AppAction } from "../src/state/app";
import { createStore } from "../src/state/store";
import type { CircleView } from "../src/views/circleOfFifths";
import type { PracticeView } from "../src/views/practice";
import type { StaffView } from "../src/views/staff";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const store = createStore(reduceApp, reduceApp(createAppState(), { type: "setMode", mode: "scales" }));
  const dispatched: AppAction[] = [];
  const dispatch = store.dispatch;
  store.dispatch = a => { dispatched.push(a); dispatch(a); };
  const views = {
    staff: { render() {} } as unknown as StaffView,
    practice: { render() {} } as unknown as PracticeView,
    circle: { render() {} } as unknown as CircleView,
  };
  const mode = startSequencePractice({ store, views, id: "scales" });
  /** Plays the current exercise once through from middle C, a note at a time */
  const playRun = () => {
    const steps = PRESCRIPTIVE.scales.build(store.getState().settings.exercise).steps;
    let time = 0;
    for (const step of steps) {
      if (step.kind !== "note") throw new Error("a scale has only note steps");
      const note = 60 + step.offset, src = { velocity: 100, source: "kbd", channel: 0 };
      dispatch({ type: "input", event: { type: "noteOn", note, time: time += 250, ...src } });
      dispatch({ type: "input", event: { type: "noteOff", note, time: time += 100, ...src } });
    }
  };
  return { store, mode, dispatched, playRun };
}

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe("sequence practice", () => {
  it("moves on to the next key round the circle after a run", async () => {
    const { store, mode, playRun } = setup();
    expect(store.getState().settings.exercise).toMatchObject({ key: "C:major", progression: "circle-sharps" });
    playRun();
    await settle();
    expect(store.getState().settings.exercise.key).toBe("G:major");
    mode.stop();
  });

  it("doesn't move the key on when stopped straight after finishing a run", async () => {
    const { store, mode, dispatched, playRun } = setup();
    playRun();
    mode.stop();
    await settle();
    expect(store.getState().settings.exercise.key).toBe("C:major");
    expect(dispatched).toEqual([]);
  });
});
