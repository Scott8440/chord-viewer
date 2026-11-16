// The sampled piano: which recording plays a note, how velocity shapes it, and the footer toggle routing what's played.
import { describe, expect, it } from "vitest";
import { bindPianoSound } from "../src/app/piano";
import { nearestSample, SAMPLE_NOTES, sampleFile, velocityShape, type PianoSound } from "../src/audio/piano";
import { createAppState, reduceApp } from "../src/state/app";
import { createStore } from "../src/state/store";

describe("samples", () => {
  it("one every three semitones from A0 to C8, named without #", () => {
    expect(SAMPLE_NOTES[0]).toBe(21);
    expect(SAMPLE_NOTES.at(-1)).toBe(108);
    expect(SAMPLE_NOTES.map(sampleFile).slice(0, 5)).toEqual(["A0.mp3", "C1.mp3", "Ds1.mp3", "Fs1.mp3", "A1.mp3"]);
    expect(sampleFile(60)).toBe("C4.mp3");
  });

  it("a note plays the nearest recording, never more than a semitone away, within the piano's range", () => {
    for (let note = 21; note <= 108; note++) expect(Math.abs(note - nearestSample(note))).toBeLessThanOrEqual(1);
    expect(nearestSample(61)).toBe(60);
    expect(nearestSample(62)).toBe(63);
    expect(nearestSample(5)).toBe(21);
    expect(nearestSample(127)).toBe(108);
  });

  it("softer notes are quieter and duller", () => {
    const soft = velocityShape(20),
      loud = velocityShape(120);
    expect(soft.gain).toBeLessThan(loud.gain);
    expect(soft.cutoff).toBeLessThan(loud.cutoff);
    expect(velocityShape(500)).toEqual(velocityShape(127));
  });
});

describe("the Piano sound toggle", () => {
  function setup(on = false) {
    const store = createStore(reduceApp, createAppState({ pianoSound: on }));
    const calls: string[] = [];
    let loaded = false;
    const piano: PianoSound = {
      load: async () => {
        calls.push("load");
        loaded = true;
      },
      loaded: () => loaded,
      noteOn: (n, v) => calls.push(`on ${n} ${v}`),
      noteOff: n => calls.push(`off ${n}`),
      pedal: d => calls.push(`pedal ${d}`),
      play: () => calls.push("play"),
      allOff: () => calls.push("allOff"),
    };
    const button = { textContent: "Piano sound" } as HTMLElement;
    bindPianoSound(store, button, piano);
    const input = (event: Record<string, unknown>) =>
      store.dispatch({ type: "input", event: { time: 0, source: "midi", channel: 0, ...event } as never });
    return { store, calls, button, input };
  }

  it("is silent while off", () => {
    const t = setup();
    t.input({ type: "noteOn", note: 60, velocity: 90 });
    expect(t.calls).toEqual([]);
  });

  it("loads the samples when turned on, then plays notes, releases and the pedal", async () => {
    const t = setup();
    t.store.dispatch({ type: "setPianoSound", on: true });
    await Promise.resolve();
    expect(t.calls).toEqual(["load"]);
    expect(t.button.textContent).toBe("Piano sound");
    t.input({ type: "noteOn", note: 60, velocity: 90 });
    t.input({ type: "pedal", down: true });
    t.input({ type: "noteOff", note: 60, velocity: 0 });
    t.input({ type: "pedal", down: false });
    expect(t.calls.slice(1)).toEqual(["on 60 90", "pedal true", "off 60", "pedal false"]);
  });

  it("silences everything when turned off, and on a panic", () => {
    const t = setup(true);
    t.input({ type: "noteOn", note: 64, velocity: 70 });
    t.input({ type: "panic" });
    t.store.dispatch({ type: "setPianoSound", on: false });
    expect(t.calls.filter(c => c === "allOff")).toHaveLength(2);
  });
});
