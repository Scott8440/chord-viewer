// Theory quiz, key signatures, run against fakes: answering from the board or by playing the tonic, moving on,
// recording, and stopping.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startTheoryKeySigs, KEY_SIG_NEXT_MS } from "../src/modes/theoryKeySigs";
import { createAppState, reduceApp } from "../src/state/app";
import { createStore } from "../src/state/store";
import { chromaOf } from "../src/theory";
import type { AnswerBoard, AnswerBox } from "../src/views/answerBoard";
import type { PracticeDisplay } from "../src/views/practice";
import type { RecordBody } from "../src/progress/records";

const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function start() {
  const store = createStore(reduceApp, createAppState());
  const displays: PracticeDisplay[] = [];
  const boards: (readonly AnswerBox[])[] = [];
  const answer = new Set<(id: string) => void>();
  const answers = {
    render: (boxes: readonly AnswerBox[]) => {
      boards.push(boxes);
    },
    onAnswer: (l: (id: string) => void) => {
      answer.add(l);
      return () => {
        answer.delete(l);
      };
    },
  } as unknown as AnswerBoard;
  const records: RecordBody[] = [];
  const staffKeys: (string | undefined)[] = [];
  const mode = startTheoryKeySigs({
    store,
    views: {
      staff: { render: (_n, _r, key) => staffKeys.push(key?.label) },
      practice: { render: d => displays.push(d) },
      answers,
    },
    recorder: { record: b => records.push(b), onRecorded: () => () => {} },
    rng: seeded(7),
  });
  const shown = () => displays[displays.length - 1];
  const board = () => boards[boards.length - 1];
  const press = (id: string) => [...answer].forEach(l => l(id));
  const play = (note: number) => {
    store.dispatch({ type: "input", event: { type: "noteOn", note, velocity: 100, time: 0, source: "t", channel: 0 } });
    store.dispatch({ type: "input", event: { type: "noteOff", note, velocity: 0, time: 0, source: "t", channel: 0 } });
  };
  /** The key asked, from the right box's id once the board marks it: found by elimination here */
  const right = () => board().find(b => b.state === "right")?.id;
  return { store, mode, shown, board, press, play, records, staffKeys, right, answerCount: () => answer.size };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (f: () => void) => setTimeout(f, 16));
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("theory quiz: key signatures", () => {
  it("shows the signature, takes a wrong key then the right one, records it, and moves on", async () => {
    const t = start();
    await vi.advanceTimersByTimeAsync(20);
    const asked = t.staffKeys[t.staffKeys.length - 1]!; // e.g. "Eb major"
    expect(t.shown().label).toBe("Which major key has this key signature?");
    expect(t.board()).toHaveLength(15);
    const id = `${asked.split(" ")[0]}:major`;
    const wrong = t.board().find(b => b.id !== id)!.id;
    t.press(wrong);
    expect(t.shown().feedback).toMatch(/^✗ .* has /);
    expect(t.board().find(b => b.id === wrong)).toMatchObject({ state: "wrong", disabled: true });
    t.press(id);
    expect(t.shown().status).toBe("correct");
    expect(t.right()).toBe(id);
    expect(t.records).toEqual([
      expect.objectContaining({
        drill: "keySig",
        outcome: "corrected",
        detail: expect.objectContaining({ key: id, guesses: wrong }),
      }),
    ]);
    await vi.advanceTimersByTimeAsync(KEY_SIG_NEXT_MS + 20);
    expect(t.shown().status).toBe("waiting");
    expect(t.staffKeys[t.staffKeys.length - 1]).not.toBe(asked);
    t.mode.stop();
  });

  it("takes the tonic played in any octave; Skip records a skip", async () => {
    const t = start();
    await vi.advanceTimersByTimeAsync(20);
    const tonic = t.staffKeys[t.staffKeys.length - 1]!.split(" ")[0];
    t.play(36 + chromaOf(tonic));
    expect(t.shown().status).toBe("correct");
    expect(t.records[0]).toMatchObject({ outcome: "firstTry" });
    await vi.advanceTimersByTimeAsync(KEY_SIG_NEXT_MS + 20);
    t.mode.skip!();
    expect(t.records[1]).toMatchObject({ outcome: "skipped" });
    t.mode.stop();
  });

  it("asks for minor keys, up to the number of accidentals chosen, as soon as that's set", () => {
    const t = start();
    t.store.dispatch({ type: "setKeySigOptions", options: { keys: "minor", most: 3 } });
    expect(t.shown().label).toBe("Which minor key has this key signature?");
    expect(t.board().map(b => b.label)).toEqual(["Am", "Em", "Bm", "F♯m", "Dm", "Gm", "Cm"]);
    expect(t.records).toEqual([]); // a new signature from a settings change isn't a skip
    t.mode.stop();
  });

  it("stops listening and doesn't move on once stopped", async () => {
    const t = start();
    await vi.advanceTimersByTimeAsync(20);
    const tonic = t.staffKeys[t.staffKeys.length - 1]!.split(" ")[0];
    t.play(60 + chromaOf(tonic));
    const shownBefore = t.shown();
    t.mode.stop();
    expect(t.answerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(KEY_SIG_NEXT_MS + 20);
    expect(t.shown()).toBe(shownBefore);
  });
});
