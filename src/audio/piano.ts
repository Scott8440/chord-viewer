// A sampled grand piano (Salamander Grand Piano V3, CC BY 3.0, public/piano/README.txt) for hearing what's played.
// One recording every three semitones from A0 to C8; a note between them plays the nearest one, re-pitched by at most
// a semitone. There's one velocity layer, so velocity sets the level and, through a low-pass filter, the brightness
// (a soft note on a real piano is duller as well as quieter). The sustain pedal holds released notes until it lifts.
// Samples load on first use (about 5 MB).
import { audioContext } from "./context";
import { holdAt } from "./tones";

/** The recorded notes: A0 (21) and every third semitone up to C8 (108) */
export const SAMPLE_NOTES: readonly number[] = Array.from({ length: 30 }, (_, i) => 21 + 3 * i);
const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];

/** A sample's file name: "C4.mp3", "Ds4.mp3" (no "#", which URLs don't like) */
export const sampleFile = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}.mp3`;

/** The recorded note to play a note from: the nearest, within the piano's range */
export function nearestSample(note: number): number {
  const i = Math.round((note - SAMPLE_NOTES[0]) / 3);
  return SAMPLE_NOTES[Math.min(SAMPLE_NOTES.length - 1, Math.max(0, i))];
}

/** Level and low-pass cutoff for a velocity (1–127): soft notes quieter and duller */
export function velocityShape(velocity: number): { gain: number; cutoff: number } {
  const v = Math.min(127, Math.max(1, velocity)) / 127;
  return { gain: 0.08 + 0.72 * v ** 1.6, cutoff: 1200 + 16000 * v ** 2 };
}

/** How long a released note takes to die away (time constant, s) */
const RELEASE_S = 0.12;

export interface PianoSound {
  /** Fetches and decodes the samples (once); resolves when they're ready */
  load(): Promise<void>;
  loaded(): boolean;
  noteOn(note: number, velocity: number): void;
  noteOff(note: number): void;
  pedal(down: boolean): void;
  /** Everything stops (quickly, without a click) */
  allOff(): void;
}

export function createPianoSound(baseUrl = "piano/"): PianoSound {
  const buffers = new Map<number, AudioBuffer>();
  let loading: Promise<void> | null = null;
  let out: GainNode | null = null;

  interface Voice {
    source: AudioBufferSourceNode;
    gain: GainNode;
  }
  /** Sounding notes by MIDI note (a repeated note stops the one before) */
  const voices = new Map<number, Voice>();
  /** Released while the pedal was down: they stop when it lifts */
  const sustained = new Set<number>();
  const held = new Set<number>();
  let pedalDown = false;

  function output(ctx: AudioContext): GainNode {
    if (!out) {
      out = ctx.createGain();
      out.gain.value = 0.9;
      out.connect(ctx.destination);
    }
    return out;
  }

  function release(note: number) {
    const v = voices.get(note);
    if (!v) return;
    voices.delete(note);
    const t = audioContext().currentTime;
    holdAt(v.gain.gain, t);
    v.gain.gain.setTargetAtTime(0, t, RELEASE_S);
    v.source.stop(t + RELEASE_S * 8);
  }

  return {
    load() {
      loading ??= (async () => {
        const ctx = audioContext();
        await Promise.all(
          SAMPLE_NOTES.map(async midi => {
            const res = await fetch(baseUrl + sampleFile(midi));
            if (!res.ok) throw new Error(`Couldn't load ${sampleFile(midi)}: ${res.status}`);
            buffers.set(midi, await ctx.decodeAudioData(await res.arrayBuffer()));
          }),
        );
      })().catch(e => {
        loading = null; // try again next time
        throw e;
      });
      return loading;
    },
    loaded: () => buffers.size === SAMPLE_NOTES.length,
    noteOn(note, velocity) {
      const sample = nearestSample(note);
      const buffer = buffers.get(sample);
      if (!buffer) return;
      const ctx = audioContext();
      release(note);
      sustained.delete(note);
      held.add(note);
      const { gain: level, cutoff } = velocityShape(velocity);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 2 ** ((note - sample) / 12);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      gain.gain.value = level;
      source.connect(filter).connect(gain).connect(output(ctx));
      source.start();
      source.onended = () => {
        if (voices.get(note)?.source === source) voices.delete(note);
      };
      voices.set(note, { source, gain });
    },
    noteOff(note) {
      held.delete(note);
      if (pedalDown) sustained.add(note);
      else release(note);
    },
    pedal(down) {
      pedalDown = down;
      if (down) return;
      for (const note of sustained) if (!held.has(note)) release(note);
      sustained.clear();
    },
    allOff() {
      for (const note of [...voices.keys()]) release(note);
      held.clear();
      sustained.clear();
    },
  };
}
