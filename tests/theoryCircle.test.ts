// Theory quiz, the circle of fifths, run against fakes: answering where and which questions, filling the circle in,
// skips revealing a place, recording, and stopping.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keyAt } from "../src/exercises/circleQuiz";
import { startTheoryCircle, CIRCLE_NEXT_MS, CIRCLE_ROUND_MS } from "../src/modes/theoryCircle";
import { createAppState, reduceApp } from "../src/state/app";
import { createStore } from "../src/state/store";
import type { AnswerBoard, AnswerBox } from "../src/views/answerBoard";
import type { CircleQuizModel } from "../src/views/circleQuiz";
import type { PracticeDisplay } from "../src/views/practice";
import type { RecordBody } from "../src/progress/records";
import { circlePosition, chromaOf, CIRCLE_OF_FIFTHS_MAJOR } from "../src/theory";

const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function start(options: { asks: "where" | "which" | "mixed" } = { asks: "mixed" }) {
  const store = createStore(reduceApp, createAppState());
  store.dispatch({ type: "setCircleQuizOptions", options });
  const displays: PracticeDisplay[] = [];
  const circles: CircleQuizModel[] = [];
  const boards: (readonly AnswerBox[])[] = [];
  const answer = new Set<(id: string) => void>(),
    spot = new Set<(n: number) => void>();
  const answers = {
    render: (boxes: readonly AnswerBox[]) => boards.push(boxes),
    onAnswer: (l: (id: string) => void) => (answer.add(l), () => answer.delete(l)),
  } as unknown as AnswerBoard;
  const records: RecordBody[] = [];
  const mode = startTheoryCircle({
    store,
    views: {
      practice: { render: d => displays.push(d) },
      answers,
      circleQuiz: { render: m => circles.push(m), onSpot: l => (spot.add(l), () => spot.delete(l)) },
    },
    recorder: { record: b => records.push(b), onRecorded: () => () => {} },
    rng: seeded(11),
  });
  const shown = () => displays[displays.length - 1];
  const circle = () => circles[circles.length - 1];
  const board = () => boards[boards.length - 1];
  /** The given key's place and name, from the circle drawn */
  const given = () => {
    const i = circle().spots.findIndex(s => s.state === "given");
    return {
      spot: i,
      key: CIRCLE_OF_FIFTHS_MAJOR.indexOf(circle().spots[i].label.replace("♭", "b").replace("♯", "#")),
    };
  };
  /** The right place for the key a where question names */
  const whereAnswer = () => {
    const name = shown()
      .label.match(/^Where does (.+) major go\?$/)![1]
      .split("/")[0]
      .replace("♭", "b")
      .replace("♯", "#");
    const g = given();
    return (((g.spot + circlePosition(`${name}:major`) - g.key) % 12) + 12) % 12;
  };
  /** The right key for the marked place */
  const whichAnswer = () => {
    const g = given();
    const asked = circle().spots.findIndex(s => s.state === "asked");
    return keyAt({ ring: "major", anchorSpot: g.spot, anchorKey: g.key }, asked);
  };
  return {
    store,
    mode,
    shown,
    circle,
    board,
    records,
    whereAnswer,
    whichAnswer,
    pickSpot: (n: number) => spot.forEach(l => l(n)),
    press: (id: string) => answer.forEach(l => l(id)),
    play: (note: number) => {
      store.dispatch({
        type: "input",
        event: { type: "noteOn", note, velocity: 100, time: 0, source: "t", channel: 0 },
      });
      store.dispatch({
        type: "input",
        event: { type: "noteOff", note, velocity: 0, time: 0, source: "t", channel: 0 },
      });
    },
    listeners: () => answer.size + spot.size,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("theory quiz: circle of fifths", () => {
  it("where: one key given, a wrong place marked, the right one filled in, then the next question", async () => {
    const t = start({ asks: "where" });
    expect(t.circle()).toMatchObject({ center: "1 / 12", pickable: true });
    expect(t.board()).toEqual([]);
    const right = t.whereAnswer();
    const wrong = t.circle().spots.findIndex((s, i) => s.state === "open" && i !== right);
    t.pickSpot(wrong);
    expect(t.shown().feedback).toMatch(/^✗ That's where .+ goes$/);
    expect(t.circle().spots[wrong].state).toBe("wrong");
    t.pickSpot(right);
    expect(t.shown().feedback).toMatch(/^✓ /);
    expect(t.circle()).toMatchObject({ center: "2 / 12", pickable: false });
    expect(t.circle().spots[right].state).toBe("found");
    expect(t.records).toEqual([expect.objectContaining({ drill: "circleFifths", outcome: "corrected" })]);
    await vi.advanceTimersByTimeAsync(CIRCLE_NEXT_MS);
    expect(t.shown().feedback).toBe("");
    t.mode.stop();
  });

  it("which: answered from the board or by playing the tonic; the whole circle filled starts a new round", async () => {
    const t = start({ asks: "which" });
    expect(t.board()).toHaveLength(12);
    for (let n = 0; n < 11; n++) {
      const key = t.whichAnswer();
      if (n % 2) t.press(String(key));
      else t.play(48 + chromaOf(CIRCLE_OF_FIFTHS_MAJOR[key]));
      expect(t.shown().status).toBe("correct");
      await vi.advanceTimersByTimeAsync(n === 10 ? CIRCLE_NEXT_MS : CIRCLE_NEXT_MS + 10);
    }
    // All twelve in: the next round waits a little longer
    expect(t.circle().center).toBe("12 / 12");
    await vi.advanceTimersByTimeAsync(CIRCLE_ROUND_MS - CIRCLE_NEXT_MS + 10);
    expect(t.circle().center).toBe("1 / 12");
    expect(t.records).toHaveLength(11);
    expect(t.records.every(r => r.kind === "drill" && r.outcome === "firstTry")).toBe(true);
    t.mode.stop();
  });

  it("Skip reveals the place and records a skip; a new ring starts a new round", () => {
    const t = start({ asks: "where" });
    const right = t.whereAnswer();
    t.mode.skip!();
    expect(t.circle().spots[right].state).toBe("revealed");
    expect(t.records).toEqual([expect.objectContaining({ outcome: "skipped" })]);
    t.store.dispatch({ type: "setCircleQuizOptions", options: { ring: "minor" } });
    expect(t.circle().center).toBe("1 / 12");
    expect(t.shown().label).toMatch(/minor go\?$/);
    expect(t.records).toHaveLength(1); // a settings change isn't a skip
    t.mode.stop();
  });

  it("stops listening and doesn't move on once stopped", async () => {
    const t = start({ asks: "where" });
    t.pickSpot(t.whereAnswer());
    const before = t.shown();
    t.mode.stop();
    expect(t.listeners()).toBe(0);
    await vi.advanceTimersByTimeAsync(CIRCLE_ROUND_MS);
    expect(t.shown()).toBe(before);
  });
});
