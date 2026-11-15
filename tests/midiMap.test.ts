// MIDI mapping: keys pressing controls, per mode.
import { describe, expect, it } from "vitest";
import { assignNote, clearTarget, midiNoteName, noteFor, sanitizeMidiMap, targetFor } from "../src/input/midiMap";

describe("MIDI map", () => {
  it("maps a key to a control in one mode only", () => {
    const map = assignNote({}, "earChords", "answer:M", 48);
    expect(targetFor(map, "earChords", 48)).toBe("answer:M");
    expect(targetFor(map, "scales", 48)).toBeUndefined();
    expect(noteFor(map, "earChords", "answer:M")).toBe(48);
  });

  it("a key presses one control: mapping it again moves it; a control has one key", () => {
    let map = assignNote({}, "earChords", "answer:M", 48);
    map = assignNote(map, "earChords", "answer:m", 48);
    expect(map.earChords).toEqual({ "answer:m": 48 });
    map = assignNote(map, "earChords", "answer:m", 50);
    expect(map.earChords).toEqual({ "answer:m": 50 });
    map = assignNote(map, "earChords", "skip", 60);
    expect(clearTarget(map, "earChords", "answer:m").earChords).toEqual({ skip: 60 });
  });

  it("reads back only whole MIDI notes", () => {
    expect(sanitizeMidiMap({ earChords: { "answer:M": 48, skip: 200, x: "C4", y: 1.5 }, bad: 3, empty: {} }))
      .toEqual({ earChords: { "answer:M": 48 } });
    expect(sanitizeMidiMap("nonsense")).toEqual({});
  });

  it("labels keys by name and octave", () => {
    expect(midiNoteName(60)).toBe("C4");
    expect(midiNoteName(61)).toBe("C♯4");
    expect(midiNoteName(21)).toBe("A0");
  });
});
