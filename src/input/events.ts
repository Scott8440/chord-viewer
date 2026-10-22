// Normalized input events. Every input source (Web MIDI, computer keyboard, and later an
// on-screen piano or recorded-MIDI playback) emits these and nothing else.
//
// `time` is a DOMHighResTimeStamp on the performance.now() clock, taken from the
// originating event (MIDIMessageEvent.timeStamp, KeyboardEvent.timeStamp), not handler time.

export interface NoteEvent {
  type: "noteOn" | "noteOff";
  note: number;
  velocity: number;
  time: number;
  source: string;
  channel: number;
}

/** Sustain pedal (CC64) */
export interface PedalEvent {
  type: "pedal";
  down: boolean;
  time: number;
  source: string;
  channel: number;
}

/** Releases every note a source is holding, on all its channels (CC120/123, or the source was disabled). */
export interface AllNotesOffEvent {
  type: "allNotesOff";
  time: number;
  source: string;
}

/** Clears everything: held notes, sustained notes and pedals, from all sources. */
export interface PanicEvent {
  type: "panic";
  time: number;
}

export type InputEvent = NoteEvent | PedalEvent | AllNotesOffEvent | PanicEvent;

export type Emit = (event: InputEvent) => void;
