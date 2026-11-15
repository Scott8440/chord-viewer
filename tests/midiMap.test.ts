// MIDI mapping: keys pressing controls, per mode.
import { describe, expect, it } from "vitest";
import { assignNote, clearTarget, midiNoteName, noteFor, sanitizeMidiMap, targetsFor } from "../src/input/midiMap";

describe("MIDI map", () => {
  it("maps a key to a control in one mode only", () => {
    const map = assignNote({}, "earChords", "answer:M", 48);
    expect(targetsFor(map, "earChords", 48)).toEqual(["answer:M"]);
    expect(targetsFor(map, "scales", 48)).toEqual([]);
    expect(noteFor(map, "earChords", "answer:M")).toBe(48);
  });

  it("a key can stay on controls that aren't showing together; the rest lose it", () => {
    let map = assignNote({}, "earChords", "replay", 60);
    map = assignNote(map, "earChords", "answer:M", 62);
    // Next round shows in Replay's place: Replay keeps the key
    map = assignNote(map, "earChords", "skip", 60, other => other === "replay");
    expect(targetsFor(map, "earChords", 60).sort()).toEqual(["replay", "skip"]);
    // A major-chord box showing alongside Skip takes 60 from it, but not from the hidden Replay
    map = assignNote(map, "earChords", "answer:M", 60, other => other === "replay");
    expect(map.earChords).toEqual({ replay: 60, "answer:M": 60 });
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
    expect(sanitizeMidiMap({ earChords: { "answer:M": 48, skip: 200, x: "C4", y: 1.5 }, bad: 3, empty: {} })).toEqual({
      earChords: { "answer:M": 48 },
    });
    expect(sanitizeMidiMap("nonsense")).toEqual({});
  });

  it("reads sight reading's mappings saved under its old mode id as its new one", () => {
    expect(sanitizeMidiMap({ notes: { skip: 60 } })).toEqual({ reading: { skip: 60 } });
    expect(sanitizeMidiMap({ notes: { skip: 60 }, reading: { skip: 62 } })).toEqual({ reading: { skip: 62 } });
  });

  it("labels keys by name and octave", () => {
    expect(midiNoteName(60)).toBe("C4");
    expect(midiNoteName(61)).toBe("C♯4");
    expect(midiNoteName(21)).toBe("A0");
  });
});
