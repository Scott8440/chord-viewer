// Web MIDI input source: every connected input, each with an on/off switch.
import type { Emit, InputEvent } from "./events";

/** Turns one raw MIDI message into an input event, or null for messages we ignore. */
export function parseMidiMessage(data: ArrayLike<number>, time: number, source: string): InputEvent | null {
  const status = data[0], d1 = data[1], d2 = data[2];
  const type = status & 0xf0, channel = status & 0x0f;
  // Note-on with velocity 0 counts as a note-off
  if (type === 0x90 && d2 > 0) return { type: "noteOn", note: d1, velocity: d2, time, source, channel };
  if (type === 0x80 || (type === 0x90 && d2 === 0)) return { type: "noteOff", note: d1, velocity: d2, time, source, channel };
  if (type === 0xb0) {
    if (d1 === 64) return { type: "pedal", down: d2 >= 64, time, source, channel };
    if (d1 === 120 || d1 === 123) return { type: "allNotesOff", time, source };
  }
  return null;
}

export interface MidiInputInfo {
  id: string;
  name: string;
  enabled: boolean;
}

export type MidiStatus =
  | { kind: "requesting" }
  | { kind: "unsupported" }
  | { kind: "denied"; framed: boolean }
  | { kind: "ready"; inputs: MidiInputInfo[] };

export interface MidiSource {
  /** Asks for MIDI access (again, after a denial) and starts listening. */
  start(): Promise<void>;
  /** Turns an input on or off; turning it off releases its notes. */
  setEnabled(id: string, on: boolean): void;
}

export function createMidiSource(emit: Emit, onStatus: (status: MidiStatus) => void): MidiSource {
  const enabled = new Map<string, boolean>();  // input.id -> on

  function refresh(access: MIDIAccess) {
    const inputs: MidiInputInfo[] = [];
    for (const input of access.inputs.values()) {
      if (input.state !== "connected") continue;
      if (!enabled.has(input.id)) enabled.set(input.id, true);
      input.onmidimessage = (e) => {
        if (enabled.get(input.id) === false || !e.data) return;
        const event = parseMidiMessage(e.data, e.timeStamp, input.id);
        if (event) emit(event);
      };
      inputs.push({ id: input.id, name: input.name || "MIDI input", enabled: enabled.get(input.id)! });
    }
    onStatus({ kind: "ready", inputs });
  }

  return {
    async start() {
      if (!navigator.requestMIDIAccess) {
        onStatus({ kind: "unsupported" });
        return;
      }
      try {
        const access = await navigator.requestMIDIAccess({ sysex: false });
        refresh(access);
        access.onstatechange = () => refresh(access);
      } catch {
        onStatus({ kind: "denied", framed: window.top !== window });
      }
    },
    setEnabled(id, on) {
      enabled.set(id, on);
      if (!on) emit({ type: "allNotesOff", time: performance.now(), source: id });
    },
  };
}
