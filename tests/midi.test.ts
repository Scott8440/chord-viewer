// Raw MIDI bytes -> normalized input events.
import { describe, expect, it } from "vitest";
import { parseMidiMessage } from "../src/input/midi";

const parse = (...bytes: number[]) => parseMidiMessage(bytes, 12.5, "in1");

describe("parseMidiMessage", () => {
  it("parses note-on with channel, velocity and the event's timestamp", () => {
    expect(parse(0x93, 60, 90)).toEqual({ type: "noteOn", note: 60, velocity: 90, time: 12.5, source: "in1", channel: 3 });
  });

  it("treats note-off and note-on with velocity 0 as note-off", () => {
    expect(parse(0x80, 60, 40)).toMatchObject({ type: "noteOff", note: 60, channel: 0 });
    expect(parse(0x91, 60, 0)).toMatchObject({ type: "noteOff", note: 60, channel: 1 });
  });

  it("reads the sustain pedal with a threshold of 64", () => {
    expect(parse(0xb0, 64, 127)).toMatchObject({ type: "pedal", down: true });
    expect(parse(0xb0, 64, 64)).toMatchObject({ type: "pedal", down: true });
    expect(parse(0xb0, 64, 63)).toMatchObject({ type: "pedal", down: false });
  });

  it("turns CC 120 and 123 into all-notes-off for the source", () => {
    expect(parse(0xb2, 120, 0)).toEqual({ type: "allNotesOff", time: 12.5, source: "in1" });
    expect(parse(0xb0, 123, 0)).toEqual({ type: "allNotesOff", time: 12.5, source: "in1" });
  });

  it("ignores other messages", () => {
    expect(parse(0xb0, 1, 50)).toBeNull();   // mod wheel
    expect(parse(0xe0, 0, 64)).toBeNull();   // pitch bend
    expect(parse(0xf8)).toBeNull();          // clock
  });
});
