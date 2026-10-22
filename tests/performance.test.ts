// Performance reducer: held notes, pedal sustain, multiple sources, all-notes-off and panic.
import { describe, expect, it } from "vitest";
import type { InputEvent } from "../src/input/events";
import { initialPerformance, pedalDown, pedalOnlyNotes, reducePerformance, soundingNotes, type PerformanceState } from "../src/state/performance";

const on = (note: number, source = "a", channel = 0): InputEvent => ({ type: "noteOn", note, velocity: 100, time: 0, source, channel });
const off = (note: number, source = "a", channel = 0): InputEvent => ({ type: "noteOff", note, velocity: 0, time: 0, source, channel });
const pedal = (down: boolean, source = "a", channel = 0): InputEvent => ({ type: "pedal", down, time: 0, source, channel });
const run = (...events: InputEvent[]) => events.reduce(reducePerformance, initialPerformance);
const sounding = (s: PerformanceState, sus = true) => soundingNotes(s, sus);

describe("performance reducer", () => {
  it("tracks held notes, sorted low to high", () => {
    expect(sounding(run(on(67), on(60), on(64)))).toEqual([60, 64, 67]);
    expect(sounding(run(on(60), on(64), off(60)))).toEqual([64]);
  });

  it("does not mutate the previous state", () => {
    const s1 = run(on(60));
    const s2 = reducePerformance(s1, on(64));
    reducePerformance(s2, off(60));
    expect(sounding(s1)).toEqual([60]);
    expect(sounding(s2)).toEqual([60, 64]);
  });

  it("returns the same state for a note-off nobody holds", () => {
    const s = run(on(60));
    expect(reducePerformance(s, off(62))).toBe(s);
  });

  it("keeps a note held until every source holding it lets go", () => {
    const s = run(on(60, "a"), on(60, "b"), off(60, "a"));
    expect(sounding(s)).toEqual([60]);
    expect(sounding(reducePerformance(s, off(60, "b")))).toEqual([]);
  });

  it("treats channels of one source separately", () => {
    expect(sounding(run(on(60, "a", 0), on(60, "a", 1), off(60, "a", 0)))).toEqual([60]);
  });

  it("sustains released notes while the pedal is down", () => {
    const s = run(pedal(true), on(60), on(64), off(60));
    expect(sounding(s)).toEqual([60, 64]);
    expect(sounding(s, false)).toEqual([64]);
    expect([...pedalOnlyNotes(s)]).toEqual([60]);
    expect(sounding(reducePerformance(s, pedal(false)))).toEqual([64]);
  });

  it("does not sustain notes released before the pedal went down", () => {
    expect(sounding(run(on(60), off(60), pedal(true)))).toEqual([]);
  });

  it("stops treating a re-struck note as pedal-only", () => {
    const s = run(pedal(true), on(60), off(60), on(60));
    expect(pedalOnlyNotes(s).size).toBe(0);
    expect(sounding(reducePerformance(s, pedal(false)))).toEqual([60]);
  });

  it("keeps sustaining while any source's pedal is down", () => {
    const s = run(pedal(true, "a"), pedal(true, "b"), on(60), off(60), pedal(false, "a"));
    expect(pedalDown(s)).toBe(true);
    expect(sounding(s)).toEqual([60]);
    expect(sounding(reducePerformance(s, pedal(false, "b")))).toEqual([]);
  });

  it("all-notes-off releases one source on every channel, leaving others and the pedal alone", () => {
    const s = run(pedal(true, "a"), on(60, "a", 0), on(64, "a", 3), on(67, "b"), on(72, "a"), off(72, "a"),
                  { type: "allNotesOff", time: 0, source: "a" });
    expect([...s.held.keys()]).toEqual([67]);
    expect([...s.sustained]).toEqual([72]);
    expect(pedalDown(s)).toBe(true);
  });

  it("all-notes-off for one source does not match a source whose id merely starts the same", () => {
    const s = run(on(60, "in"), on(64, "in2"), { type: "allNotesOff", time: 0, source: "in" });
    expect(sounding(s)).toEqual([64]);
  });

  it("panic clears held, sustained and pedals", () => {
    const s = run(pedal(true), on(60), off(60), on(64), { type: "panic", time: 0 });
    expect(sounding(s)).toEqual([]);
    expect(pedalDown(s)).toBe(false);
  });
});
