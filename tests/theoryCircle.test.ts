// Theory quiz, key relationships on the circle of fifths, run against fakes: answering on the circle and from the
// board, moving on, recording, skipping and stopping.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CircleAsks } from "../src/exercises/circleQuiz";
import { startTheoryCircle, CIRCLE_LONG_MS, CIRCLE_NEXT_MS } from "../src/modes/theoryCircle";
import { createAppState, reduceApp } from "../src/state/app";
import { createStore } from "../src/state/store";
import type { AnswerBoard, AnswerBox } from "../src/views/answerBoard";
import type { CircleQuizModel } from "../src/views/circleQuiz";
import type { PracticeDisplay } from "../src/views/practice";
import type { RecordBody } from "../src/progress/records";

const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function start(asks: CircleAsks) {
  const store = createStore(reduceApp, createAppState());
  store.dispatch({ type: "setCircleQuizOptions", options: { asks } });
  const displays: PracticeDisplay[] = [];
  const circles: CircleQuizModel[] = [];
  const boards: (readonly AnswerBox[])[] = [];
  const answer = new Set<(id: string) => void>(),
    spot = new Set<(id: string) => void>();
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
    rng: seeded(13),
  });
  const shown = () => displays[displays.length - 1];
  const circle = () => circles[circles.length - 1];
  const board = () => boards[boards.length - 1];
  /** Picks every open place in turn until the question is answered; returns how many were tried */
  const pickUntilDone = () => {
    let n = 0;
    for (const s of circle().spots.filter(x => x.state === "open")) {
      if (shown().status === "correct") break;
      if (circle().spots.find(x => x.id === s.id)!.state !== "open") continue;
      spot.forEach(l => l(s.id));
      n++;
    }
    return n;
  };
  return {
    store,
    mode,
    shown,
    circle,
    board,
    records,
    pickUntilDone,
    press: (id: string) => answer.forEach(l => l(id)),
    listeners: () => answer.size + spot.size,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("theory quiz: key relationships", () => {
  it("degree: picked on the circle, wrong picks marked, recorded, then a new question", async () => {
    const t = start("degree");
    expect(t.shown().label).toMatch(/^What's the .+ of .+ (major|minor)\?$/);
    expect(t.circle().spots.filter(s => s.state === "given")).toHaveLength(1);
    expect(t.circle()).toMatchObject({ pickable: true, signature: null, sigRow: false, board: false });
    expect(t.board()).toEqual([]);
    const tries = t.pickUntilDone();
    expect(t.shown().feedback).toMatch(/^✓ /);
    expect(t.circle().spots.filter(s => s.state === "wrong")).toHaveLength(tries - 1);
    expect(t.records).toEqual([
      expect.objectContaining({ drill: "circleFifths", detail: expect.objectContaining({ kind: "degree" }) }),
    ]);
    const first = t.shown().label;
    await vi.advanceTimersByTimeAsync(CIRCLE_NEXT_MS);
    expect(t.shown().status).toBe("waiting");
    expect(t.circle().spots.every(s => s.state === "open" || s.state === "given")).toBe(true); // nothing carried over
    expect(t.shown().label).not.toBe(first);
    t.mode.stop();
  });

  it("signature: a staff shows the signature, C major is given on the circle", () => {
    const t = start("signature");
    expect(t.circle().signature).toBeTruthy();
    expect(t.circle().sigRow).toBe(true);
    expect(t.circle().spots.find(s => s.state === "given")).toMatchObject({ ring: "major", label: "C" });
    t.pickUntilDone();
    expect(t.shown().feedback).toMatch(/^✓ .+: (no sharps or flats|\d (sharp|flat)s?)$/);
    t.mode.stop();
  });

  it("chain: named from the board in order; the circle marks the chord asked for, then a longer pause", async () => {
    const t = start("chain");
    expect(t.circle()).toMatchObject({ pickable: false, board: true });
    expect(t.board()).toHaveLength(12);
    expect(t.circle().spots.filter(s => s.state === "asked")).toHaveLength(1);
    // Try the chords in turn until each is found
    while (t.shown().status !== "correct") {
      const box = t.board().find(b => !b.disabled)!;
      t.press(box.id);
    }
    expect(t.shown().feedback).toMatch(/^✓ .+7 → .+7 → /);
    await vi.advanceTimersByTimeAsync(CIRCLE_NEXT_MS);
    expect(t.shown().status).toBe("correct");
    await vi.advanceTimersByTimeAsync(CIRCLE_LONG_MS - CIRCLE_NEXT_MS);
    expect(t.shown().status).toBe("waiting");
    t.mode.stop();
  });

  it("related: five to find; Skip records a skip; a new kind chosen gives a new question at once", () => {
    const t = start("related");
    expect(t.circle().center).toBe("0 / 5");
    t.mode.skip!();
    expect(t.records).toEqual([expect.objectContaining({ outcome: "skipped" })]);
    t.store.dispatch({ type: "setCircleQuizOptions", options: { asks: "chain" } });
    expect(t.shown().label).toMatch(/^Name the dominants/);
    expect(t.records).toHaveLength(1);
    t.mode.stop();
  });

  it("stops listening and doesn't move on once stopped", async () => {
    const t = start("degree");
    t.pickUntilDone();
    const before = t.shown();
    t.mode.stop();
    expect(t.listeners()).toBe(0);
    await vi.advanceTimersByTimeAsync(CIRCLE_LONG_MS);
    expect(t.shown()).toBe(before);
  });
});
