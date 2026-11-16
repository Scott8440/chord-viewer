// The ear-training modes run through the shared runner (earDrill.ts): rounds and their summary, replays after a miss,
// Skip, Stop/Start, stopping the mode, recording, and scale degrees pausing while the window is away. Fakes stand in
// for the views, the tone player and the recorder; `window` and `document` are bare event targets (no DOM here).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TonePlayer } from "../src/audio/tones";
import { ROUND_SIZE } from "../src/exercises/rounds";
import { startEarChords } from "../src/modes/earChords";
import { REPLAY_AFTER_MISS_MS } from "../src/modes/earDrill";
import { startEarMelody } from "../src/modes/earMelody";
import { startEarTraining } from "../src/modes/earTraining";
import type { Mode } from "../src/modes/performance";
import { SUMMARY_DELAY_MS } from "../src/modes/rounds";
import type { Recorder } from "../src/progress/recorder";
import type { DrillBody, RecordBody } from "../src/progress/records";
import { createAppState, reduceApp } from "../src/state/app";
import { createStore } from "../src/state/store";
import type { AnswerBoard, AnswerBox } from "../src/views/answerBoard";
import type { PracticeDisplay } from "../src/views/practice";

/** A seeded random number generator, so prompts differ but runs repeat */
function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function fakeTones(blocked = false) {
  const listeners = new Set<() => void>();
  const log: string[] = [];
  /** The notes of each `play`, in order, and when a cut-off came */
  const calls: ({ play: number; delay: number } | { stop: true } | { drone: number | null; fadeOut?: number })[] = [];
  const tones: TonePlayer & { log: string[]; calls: typeof calls; unblock(): void } = {
    log,
    calls,
    drone(midi, fadeOut) {
      calls.push({ drone: midi, fadeOut });
      log.push(`drone ${midi}`);
    },
    play(midi, delay = 0) {
      calls.push({ play: midi, delay });
      log.push(`play ${midi}`);
    },
    stopNotes() {
      calls.push({ stop: true });
      log.push("stop");
    },
    blocked: () => blocked,
    onBlockedChange(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    latency: () => 0,
    unblock() {
      blocked = false;
      listeners.forEach(l => l());
    },
  };
  return tones;
}

/** The notes played since the last cut-off (the prompt as last sounded) */
function lastSounded(tones: ReturnType<typeof fakeTones>): number[] {
  const out: number[] = [];
  for (const c of tones.calls) {
    if ("stop" in c) out.length = 0;
    else if ("play" in c) out.push(c.play);
  }
  return out;
}

function fakeBoard() {
  const answer = new Set<(id: string) => void>(),
    replay = new Set<() => void>(),
    next = new Set<() => void>();
  const shown: { boxes?: readonly AnswerBox[]; next?: string }[] = [];
  const on =
    <T>(set: Set<T>) =>
    (l: T) => {
      set.add(l);
      return () => {
        set.delete(l);
      };
    };
  const board: AnswerBoard = {
    render: boxes => {
      shown.push({ boxes });
    },
    renderNext: label => {
      shown.push({ next: label });
    },
    onAnswer: on(answer),
    onReplay: on(replay),
    onNext: on(next),
  };
  return {
    ...board,
    shown,
    press: (id: string) => answer.forEach(l => l(id)),
    replay: () => replay.forEach(l => l()),
    next: () => next.forEach(l => l()),
  };
}

function setup(blocked = false) {
  const store = createStore(reduceApp, createAppState());
  const tones = fakeTones(blocked);
  const displays: PracticeDisplay[] = [];
  const practice = {
    render: (d: PracticeDisplay) => {
      displays.push(d);
    },
  };
  const roundViz = { render: () => {} };
  const records: RecordBody[] = [];
  const recorder: Recorder = {
    record: b => {
      records.push(b);
    },
    onRecorded: () => () => {},
  };
  const shown = () => displays[displays.length - 1];
  const play = (note: number) => {
    store.dispatch({ type: "input", event: { type: "noteOn", note, velocity: 100, time: 0, source: "t", channel: 0 } });
    store.dispatch({ type: "input", event: { type: "noteOff", note, velocity: 0, time: 0, source: "t", channel: 0 } });
  };
  return { store, tones, displays, practice, roundViz, records, recorder, shown, play };
}

/** `window` and `document` with just what the modes listen to */
let win: EventTarget, doc: EventTarget & { hidden: boolean; focused: boolean; hasFocus(): boolean };
beforeEach(() => {
  vi.useFakeTimers();
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), {
    hidden: false,
    focused: true,
    hasFocus() {
      return doc.focused;
    },
  });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("requestAnimationFrame", (f: () => void) => setTimeout(f, 16));
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("chord qualities", () => {
  function start(blocked = false) {
    const t = setup(blocked);
    const answers = fakeBoard();
    const mode = startEarChords({
      store: t.store,
      views: { practice: t.practice, tones: t.tones, answers, roundViz: t.roundViz },
      recorder: t.recorder,
      rng: seeded(),
    });
    /** Major and minor triads in root position (the default options): the 3rd gives it away */
    const right = () => {
      const n = lastSounded(t.tones);
      return n[1] - n[0] === 4 ? "M" : "m";
    };
    const wrong = () => (right() === "M" ? "m" : "M");
    return { ...t, answers, mode, right, wrong };
  }

  it("plays a round of 20, holds the last answer a second, then shows the summary until Next round", async () => {
    const t = start();
    for (let i = 0; i < ROUND_SIZE; i++) {
      t.answers.press(t.right());
      expect(t.shown().status).toBe("correct");
      if (i < ROUND_SIZE - 1) await vi.advanceTimersByTimeAsync(1500);
    }
    expect(t.shown().score).toBe(`Round: ${ROUND_SIZE} / ${ROUND_SIZE} · ${ROUND_SIZE} right first time`);
    // The round is over: answers are ignored and nothing new plays, but the summary waits its second
    const plays = t.tones.calls.length;
    t.answers.press("M");
    await vi.advanceTimersByTimeAsync(SUMMARY_DELAY_MS - 1);
    expect(t.shown().status).toBe("correct");
    expect(t.tones.calls.length).toBe(plays);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.shown().label).toBe("Chord qualities: round complete");
    expect(t.shown().skipHidden).toBe(true);
    expect(t.answers.shown[t.answers.shown.length - 1]).toEqual({ next: "Next round" });
    expect(t.records.filter(r => r.kind === "drill")).toHaveLength(ROUND_SIZE);
    expect(t.records.filter(r => r.kind === "round")).toEqual([
      expect.objectContaining({ drill: "chordEar", size: ROUND_SIZE, firstTry: ROUND_SIZE }),
    ]);
    // Next round: a new chord, and the count starts again
    t.answers.next();
    expect(t.tones.calls.length).toBeGreaterThan(plays);
    expect(t.shown().score).toBe(`Round: 0 / ${ROUND_SIZE}`);
    expect(t.answers.shown[t.answers.shown.length - 1].boxes).toHaveLength(2);
  });

  it("climbs the ladder: two rounds at 85%+ unlock the next level, and Next round moves up to it", async () => {
    const t = start();
    /** A round all right first time, through to its summary */
    async function perfectRound() {
      for (let i = 0; i < ROUND_SIZE; i++) {
        t.answers.press(t.right());
        await vi.advanceTimersByTimeAsync(i < ROUND_SIZE - 1 ? 1500 : SUMMARY_DELAY_MS);
      }
    }
    expect(t.store.getState().settings.earChords).toMatchObject({ ladder: true, level: 0 });
    expect(t.shown().promptHtml).toContain("Level 1 of 12 · Major and minor · 0 of 2 rounds");
    await perfectRound();
    expect(t.shown().promptHtml).toContain("1 more round at 85% or better unlocks level 2: Add diminished.");
    expect(t.answers.shown[t.answers.shown.length - 1]).toEqual({ next: "Next round" });
    t.answers.next();
    expect(t.shown().promptHtml).toContain("1 of 2 rounds");
    await perfectRound();
    expect(t.shown().promptHtml).toContain("Unlocked level 2: Add diminished. Next round moves you up.");
    expect(t.answers.shown[t.answers.shown.length - 1]).toEqual({ next: "Next round: level 2" });
    // Both rounds were recorded as played on the ladder, at its first level
    expect(t.records.filter(r => r.kind === "round").map(r => r.kind === "round" && r.ladder)).toEqual([
      { id: "chordEar.1", level: 0 },
      { id: "chordEar.1", level: 0 },
    ]);
    t.answers.next();
    expect(t.store.getState().settings.earChords.level).toBe(1);
    expect(t.shown().score).toBe(`Round: 0 / ${ROUND_SIZE}`);
    expect(t.answers.shown[t.answers.shown.length - 1].boxes?.map(b => b.id)).toEqual(["M", "m", "dim"]);
    expect(t.shown().promptHtml).toContain("Level 2 of 12 · Add diminished");
  });

  it("with the Piano sound, plays each chord on the piano, voiced with a bass note low down; Simple uses the tone", async () => {
    const t = setup();
    const answers = fakeBoard();
    const plays: { note: number; delay: number }[] = [];
    let loaded = false;
    const piano = {
      load: async () => {
        loaded = true;
      },
      loaded: () => loaded,
      noteOn() {},
      noteOff() {},
      pedal() {},
      play: (note: number, _v: number, delay: number) => plays.push({ note, delay }),
      allOff() {},
    };
    t.store.dispatch({ type: "setEarChordOptions", options: { sound: "piano" } });
    const mode = startEarChords({
      store: t.store,
      views: { practice: t.practice, tones: t.tones, answers, roundViz: t.roundViz, piano },
      recorder: t.recorder,
      rng: seeded(),
    });
    // The first chord waits for the samples, then plays: the bass first, the rest just after, all on the piano
    await vi.advanceTimersByTimeAsync(0);
    expect(plays.length).toBeGreaterThanOrEqual(4);
    expect(plays[0].delay).toBe(0);
    expect(plays[0].note).toBeLessThan(52);
    expect(lastSounded(t.tones)).toEqual([]);
    // Simple again: a fresh chord, on the tone, in close position
    plays.length = 0;
    t.store.dispatch({ type: "setEarChordOptions", options: { sound: "simple" } });
    expect(plays).toEqual([]);
    expect(lastSounded(t.tones).length).toBe(3);
    mode.stop();
  });

  it("keeps the level to those unlocked, and doesn't count broken rounds", async () => {
    const t = start();
    t.store.dispatch({ type: "setEarChordOptions", options: { level: 5 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.store.getState().settings.earChords.level).toBe(0);
    t.store.dispatch({ type: "setEarChordOptions", options: { broken: true } });
    for (let i = 0; i < ROUND_SIZE; i++) t.mode.skip!();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.records.filter(r => r.kind === "round")).toEqual([
      expect.not.objectContaining({ ladder: expect.anything() }),
    ]);
    expect(t.shown().promptHtml).toContain("Played broken");
  });

  it("shows the summary at once when the round ends on a skip", async () => {
    const t = start();
    for (let i = 0; i < ROUND_SIZE; i++) t.mode.skip!();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.shown().skipHidden).toBe(true);
    expect(t.shown().score).not.toMatch(/^Round:/);
    // Skip is Next round here
    t.mode.skip!();
    expect(t.shown().score).toBe(`Round: 0 / ${ROUND_SIZE}`);
  });

  it("Next pressed during the second's hold shows the summary straight away", async () => {
    const t = start();
    for (let i = 0; i < ROUND_SIZE - 1; i++) t.mode.skip!();
    t.answers.press(t.right());
    t.answers.next(); // not showing yet: nothing
    expect(t.shown().status).toBe("correct");
    t.mode.skip!(); // Skip reveals it
    expect(t.shown().skipHidden).toBe(true);
  });

  it("plays the chord again a second after a wrong answer; another wrong answer pushes it back", async () => {
    const t = start();
    const chord = lastSounded(t.tones);
    t.answers.press(t.wrong());
    expect(t.shown().status).toBe("wrong");
    const before = t.tones.calls.length;
    await vi.advanceTimersByTimeAsync(REPLAY_AFTER_MISS_MS - 1);
    expect(t.tones.calls.length).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(lastSounded(t.tones)).toEqual(chord);
    expect(t.tones.calls.length).toBeGreaterThan(before);
  });

  it("number keys answer; Replay plays the chord again", () => {
    const t = start();
    const chord = lastSounded(t.tones);
    t.answers.replay();
    expect(lastSounded(t.tones)).toEqual(chord);
    win.dispatchEvent(Object.assign(new Event("keydown"), { key: t.right() === "M" ? "1" : "2" }));
    expect(t.shown().status).toBe("correct");
    expect(t.mode.replay).toBeUndefined(); // the board's Replay is the only one
  });

  it("Stop silences it and ignores answers; Start plays the chord again; Skip while stopped starts on a new one", () => {
    const t = start();
    const chord = lastSounded(t.tones);
    t.mode.toggleRunning!();
    expect(t.shown()).toMatchObject({ label: "Stopped", stopLabel: "Start" });
    expect(t.tones.calls[t.tones.calls.length - 1]).toEqual({ stop: true });
    t.answers.press(t.right());
    expect(t.shown().label).toBe("Stopped");
    t.mode.toggleRunning!();
    expect(t.shown().stopLabel).toBe("Stop");
    expect(lastSounded(t.tones)).toEqual(chord);
    t.mode.toggleRunning!();
    t.mode.skip!();
    expect(t.shown().stopLabel).toBe("Stop");
    expect(t.shown().score).toBe(`Round: 1 / ${ROUND_SIZE} · 0 right first time`);
  });

  it("records each chord when named and when skipped, timed from when it played", () => {
    const t = start();
    vi.advanceTimersByTime(700);
    t.answers.press(t.wrong());
    vi.advanceTimersByTime(300);
    t.answers.press(t.right());
    expect(t.records).toHaveLength(1);
    expect(t.records[0]).toMatchObject({ kind: "drill", drill: "chordEar", outcome: "corrected", ms: 1000 });
    expect((t.records[0] as DrillBody).detail.guesses).not.toBe("");
    vi.advanceTimersByTime(1500);
    vi.advanceTimersByTime(250);
    t.mode.skip!();
    expect(t.records[1]).toMatchObject({ drill: "chordEar", outcome: "skipped", ms: 250 });
    // Skipping again at once: the next chord, also skipped
    t.mode.skip!();
    expect(t.records).toHaveLength(3);
  });

  it("stopping the mode with timers pending: no more renders, sounds or records", async () => {
    const t = start();
    t.answers.press(t.wrong()); // a replay pending
    t.answers.press(t.right()); // the next chord pending
    t.mode.stop();
    const counts = [t.displays.length, t.tones.calls.length, t.records.length, t.answers.shown.length];
    await vi.advanceTimersByTimeAsync(10_000);
    t.answers.press("M");
    win.dispatchEvent(Object.assign(new Event("keydown"), { key: "1" }));
    expect([t.displays.length, t.tones.calls.length, t.records.length, t.answers.shown.length]).toEqual(counts);
  });

  it("opened before audio may start, waits stopped and begins once it can", () => {
    const t = start(true);
    expect(t.tones.calls).toEqual([]);
    expect(t.shown()).toMatchObject({ label: "Ready", stopLabel: "Start" });
    t.tones.unblock();
    expect(lastSounded(t.tones)).toHaveLength(3);
    expect(t.shown().stopLabel).toBe("Stop");
  });

  it("new options start a new round with a fresh chord", () => {
    const t = start();
    t.mode.skip!();
    t.store.dispatch({ type: "setEarChordOptions", options: { broken: true } });
    expect(t.shown().score).toBe(`Round: 0 / ${ROUND_SIZE}`);
    expect(t.records).toHaveLength(1); // the skip only
  });
});

describe("scale degrees", () => {
  function start(o: { tonic?: string } = {}) {
    const t = setup();
    if (o.tonic) t.store.dispatch({ type: "setEarOptions", options: { tonic: o.tonic } });
    const pings: string[] = [];
    const degrees = {
      render: () => {},
      ping: (semitones: number, kind: string) => {
        pings.push(`${semitones} ${kind}`);
      },
    };
    const mode = startEarTraining({
      store: t.store,
      views: { practice: t.practice, tones: t.tones, degrees, roundViz: t.roundViz },
      recorder: t.recorder,
      rng: seeded(7),
    });
    /** The note to find: the last one played */
    const target = () => {
      const n = lastSounded(t.tones);
      return n[n.length - 1];
    };
    return { ...t, pings, mode, target };
  }

  it("introduces the key over the drone, then the note; a right note pings green and moves on after a second", async () => {
    const t = start({ tonic: "C" });
    expect(t.tones.calls[0]).toEqual({ drone: 48 });
    // Root, 5 and the octave, then the note
    expect(lastSounded(t.tones).slice(0, 3)).toEqual([60, 67, 72]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.pings).toEqual(["0 hear", "7 hear", "12 hear"]);
    const note = t.target();
    t.play(note);
    expect(t.pings[t.pings.length - 1]).toBe(`${note - 60} correct`);
    const before = t.tones.calls.length;
    await vi.advanceTimersByTimeAsync(999);
    expect(t.tones.calls.length).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    // The same key: no introduction, just the next note
    expect(t.tones.calls.slice(before)).toEqual([{ play: t.target(), delay: 0 }]);
  });

  it("after a wrong note plays the note again (not the introduction), pushed back by another miss", async () => {
    const t = start({ tonic: "C" });
    await vi.advanceTimersByTimeAsync(5000);
    const note = t.target();
    t.play(note + 1);
    expect(t.pings[t.pings.length - 1]).toBe(`${note + 1 - 60} wrong`);
    await vi.advanceTimersByTimeAsync(600);
    t.play(note + 2);
    const before = t.tones.calls.length;
    await vi.advanceTimersByTimeAsync(600);
    expect(t.tones.calls.length).toBe(before);
    await vi.advanceTimersByTimeAsync(400);
    expect(t.tones.calls.slice(before)).toEqual([{ play: note, delay: 0 }]);
    t.mode.replay!();
    expect(t.tones.calls[t.tones.calls.length - 1]).toEqual({ play: note, delay: 0 });
  });

  it("the number keys answer by degree", async () => {
    const t = start({ tonic: "C" });
    await vi.advanceTimersByTimeAsync(5000);
    const degree = { 0: "1", 7: "5" }[(t.target() - 60) % 12]!;
    win.dispatchEvent(Object.assign(new Event("keydown"), { key: degree }));
    expect(t.shown().score).toBe(`Round: 1 / ${ROUND_SIZE} · 1 right first time`);
  });

  it("a round's end fades the drone; Next round introduces the key again", async () => {
    const t = start({ tonic: "C" });
    for (let i = 0; i < ROUND_SIZE - 1; i++) t.mode.skip!();
    t.play(t.target());
    expect(t.tones.calls[t.tones.calls.length - 1]).toEqual({ drone: null, fadeOut: 2.5 });
    await vi.advanceTimersByTimeAsync(SUMMARY_DELAY_MS);
    expect(t.shown().skipLabel).toBe("Next round");
    t.mode.skip!();
    expect(t.tones.calls.slice(-5).map(c => ("play" in c ? c.play : c))).toEqual([
      { drone: 48 },
      60,
      67,
      72,
      t.target(),
    ]);
    expect(t.records.filter(r => r.kind === "drill")).toHaveLength(ROUND_SIZE);
  });

  it("leaving the window pauses it (the drone fading) and coming back resumes, but not between rounds", async () => {
    const t = start({ tonic: "C" });
    win.dispatchEvent(new Event("blur"));
    expect(t.tones.calls[t.tones.calls.length - 1]).toEqual({ drone: null, fadeOut: 3 });
    expect(t.shown().label).toBe("Stopped");
    win.dispatchEvent(new Event("focus"));
    expect(t.shown().stopLabel).toBe("Stop");
    expect(t.tones.calls.some((c, i) => i > 0 && "drone" in c && c.drone === 48)).toBe(true);
    // Clicking Start just after coming back doesn't stop it again
    t.mode.toggleRunning!();
    expect(t.shown().stopLabel).toBe("Stop");
    // Between rounds: nothing to pause, and coming back starts nothing
    for (let i = 0; i < ROUND_SIZE; i++) t.mode.skip!();
    await vi.advanceTimersByTimeAsync(0);
    const summary = t.shown(),
      calls = t.tones.calls.length;
    win.dispatchEvent(new Event("blur"));
    win.dispatchEvent(new Event("focus"));
    doc.hidden = true;
    doc.dispatchEvent(new Event("visibilitychange"));
    doc.hidden = false;
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(t.tones.calls.length).toBe(calls);
    expect(t.shown()).toBe(summary);
  });

  it("Stop silences the drone and Start brings it back with its introduction", async () => {
    const t = start({ tonic: "C" });
    await vi.advanceTimersByTimeAsync(5000);
    const note = t.target();
    t.mode.toggleRunning!();
    expect(t.tones.calls[t.tones.calls.length - 1]).toEqual({ drone: null, fadeOut: undefined });
    t.play(note);
    expect(t.shown().label).toBe("Stopped");
    t.mode.toggleRunning!();
    expect(t.tones.calls.slice(-5).map(c => ("play" in c ? c.play : c))).toEqual([{ drone: 48 }, 60, 67, 72, note]);
  });

  it("with a random tonic, moves to a new key after PROMPTS_PER_KEY prompts", () => {
    const t = start();
    const drones = () => t.tones.calls.filter(c => "drone" in c && c.drone != null).length;
    for (let i = 0; i < 9; i++) t.mode.skip!();
    expect(drones()).toBe(1);
    t.mode.skip!();
    expect(drones()).toBe(2);
  });

  it("stopping the mode mid-introduction: no more pings, sounds or renders", async () => {
    const t = start({ tonic: "C" });
    t.play(t.target() + 1); // a replay pending too
    t.mode.stop();
    const counts = [t.displays.length, t.tones.calls.length, t.records.length, t.pings.length];
    await vi.advanceTimersByTimeAsync(10_000);
    t.play(60);
    win.dispatchEvent(new Event("blur"));
    win.dispatchEvent(new Event("focus"));
    expect([t.displays.length, t.tones.calls.length, t.records.length, t.pings.length]).toEqual(counts);
  });
});

describe("melodies", () => {
  function start() {
    const t = setup();
    t.store.dispatch({ type: "setEarOptions", options: { tonic: "C" } });
    const staff = { render: vi.fn() };
    const mode: Mode = startEarMelody({
      store: t.store,
      views: { staff, practice: t.practice, tones: t.tones, roundViz: t.roundViz } as never,
      recorder: t.recorder,
      rng: seeded(3),
    });
    return { ...t, staff, mode };
  }

  it("is played back note by note; a wrong note plays the melody again a second later", async () => {
    const t = start();
    const melody = lastSounded(t.tones);
    expect(melody).toHaveLength(4); // the root and 3 notes
    t.play(melody[0]);
    t.play(melody[1] + 12);
    expect(t.shown().feedback).toMatch(/wrong octave/);
    await vi.advanceTimersByTimeAsync(REPLAY_AFTER_MISS_MS);
    expect(lastSounded(t.tones)).toEqual(melody);
    for (const n of melody.slice(1)) t.play(n);
    expect(t.shown().status).toBe("correct");
    expect(t.records).toEqual([expect.objectContaining({ drill: "melody", outcome: "corrected" })]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(lastSounded(t.tones)).not.toEqual(melody);
    // The staff is drawn as it's played
    expect(t.staff.render).toHaveBeenCalled();
  });

  it("a round of skips ends with the summary at once; Stop/Start cuts the melody off and plays it again", async () => {
    const t = start();
    const melody = lastSounded(t.tones);
    t.mode.toggleRunning!();
    expect(t.tones.calls[t.tones.calls.length - 1]).toEqual({ stop: true });
    t.mode.toggleRunning!();
    expect(lastSounded(t.tones)).toEqual(melody);
    for (let i = 0; i < ROUND_SIZE; i++) t.mode.skip!();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.shown().label).toBe("Melodies: round complete");
    expect(t.records.filter(r => r.kind === "round")).toEqual([
      expect.objectContaining({ drill: "melody", firstTry: 0 }),
    ]);
    t.mode.stop();
    const n = t.displays.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.displays.length).toBe(n);
  });
});

describe("recording prompts", () => {
  it("records once when answered or skipped unanswered, timed from when the prompt was shown", async () => {
    const { createPromptRecords } = await import("../src/modes/promptRecords");
    const out: RecordBody[] = [];
    const records = createPromptRecords<{
      prompt: string;
      status: "waiting" | "wrong" | "correct";
      missed: boolean;
      answered: number;
      firstTry: number;
    }>(
      {
        record: b => {
          out.push(b);
        },
        onRecorded: () => () => {},
      },
      (s, answered, ms) => ({
        kind: "drill",
        drill: "ear",
        prompt: s.prompt,
        detail: {},
        outcome: answered ? "firstTry" : "skipped",
        ms,
      }),
    );
    const waiting = { prompt: "a", status: "waiting" as const, missed: false, answered: 0, firstTry: 0 };
    vi.advanceTimersByTime(400);
    records.changed(waiting, { ...waiting, status: "correct" }, false);
    expect(out).toEqual([expect.objectContaining({ prompt: "a", outcome: "firstTry", ms: 400 })]);
    // A skip after answering isn't recorded again; the next prompt is timed afresh
    records.changed({ ...waiting, status: "correct" }, { ...waiting, prompt: "b" }, true);
    expect(out).toHaveLength(1);
    vi.advanceTimersByTime(300);
    records.shown();
    vi.advanceTimersByTime(200);
    records.changed({ ...waiting, prompt: "b" }, { ...waiting, prompt: "c" }, true);
    expect(out[1]).toMatchObject({ prompt: "b", outcome: "skipped", ms: 200 });
  });
});
