// The transport: where the beats are. Pure data and functions, on the performance.now() clock the input events use.
// Whatever drives the clock keeps it up to date: the built-in metronome now (src/modes/metronome.ts), an external
// clock later (e.g. MIDI clock from Ableton). Everything else only reads it: the click, the beat light and the
// timing judgement never assume who is driving.

export interface Transport {
  bpm: number;
  beatsPerBar: number;
  /** Beat `beat` (counted from 0, may be fractional) falls at `time` (ms); beats come every 60000 / bpm ms from it */
  anchor: { time: number; beat: number };
}

/** A transport with beat 0 at `time`. */
export const startTransport = (bpm: number, beatsPerBar: number, time: number): Transport =>
  ({ bpm, beatsPerBar, anchor: { time, beat: 0 } });

/** The same transport at a new tempo from `time` on: the beat position at `time` is kept, so no beat jumps. */
export const retempo = (t: Transport, bpm: number, time: number): Transport =>
  bpm === t.bpm ? t : { ...t, bpm, anchor: { time, beat: beatAt(t, time) } };

/** Beat position at a time (fractional: 2.5 is halfway between beats 2 and 3). */
export const beatAt = (t: Transport, time: number): number => t.anchor.beat + (time - t.anchor.time) * t.bpm / 60000;

/** Time of a beat position. */
export const timeOfBeat = (t: Transport, beat: number): number => t.anchor.time + (beat - t.anchor.beat) * 60000 / t.bpm;

/** Milliseconds per beat. */
export const beatMs = (t: Transport): number => 60000 / t.bpm;
