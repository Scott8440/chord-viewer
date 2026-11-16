// A sampled grand piano (Salamander Grand Piano V3, CC BY 3.0, public/piano/README.txt): what's played (the footer's
// Piano sound) and, as an option, the chord-quality drill's prompts. One recording every three semitones from A0 to
// C8; a note between them plays the nearest one, re-pitched by at most a semitone. There's one velocity layer, so
// velocity sets the level and, through a low-pass filter, the brightness (a soft note on a real piano is duller as
// well as quieter). The samples (about 5 MB) load on first use, once, for every player.
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

/** The decoded samples, shared by every player: loaded once, on first use */
const buffers = new Map<number, AudioBuffer>();
let loading: Promise<void> | null = null;
function loadSamples(baseUrl: string): Promise<void> {
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
}

export interface PianoSound {
  /** Fetches and decodes the samples (once for every player); resolves when they're ready */
  load(): Promise<void>;
  loaded(): boolean;
  noteOn(note: number, velocity: number): void;
  noteOff(note: number): void;
  pedal(down: boolean): void;
  /** A note `delay` seconds from now, released after `duration` (it rings on through its release) */
  play(note: number, velocity: number, delay: number, duration: number): void;
  /** Everything stops, played and scheduled (quickly, without a click) */
  allOff(): void;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export function createPianoSound(baseUrl = "piano/"): PianoSound {
  let out: GainNode | null = null;
  /** Sounding notes by MIDI note (a repeated note stops the one before) */
  const voices = new Map<number, Voice>();
  /** Notes `play` scheduled, until they end */
  const scheduled = new Set<Voice>();
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

  /** A note starting at `when` (context time), or null before the samples are in */
  function voice(note: number, velocity: number, when: number): Voice | null {
    const sample = nearestSample(note);
    const buffer = buffers.get(sample);
    if (!buffer) return null;
    const ctx = audioContext();
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
    source.start(when);
    return { source, gain };
  }

  /** Lets a voice die away from `at` (context time), without a click */
  function fade(v: Voice, at: number) {
    holdAt(v.gain.gain, at);
    v.gain.gain.setTargetAtTime(0, at, RELEASE_S);
    v.source.stop(at + RELEASE_S * 8);
  }

  function release(note: number) {
    const v = voices.get(note);
    if (!v) return;
    voices.delete(note);
    fade(v, audioContext().currentTime);
  }

  return {
    load: () => loadSamples(baseUrl),
    loaded: () => buffers.size === SAMPLE_NOTES.length,
    noteOn(note, velocity) {
      release(note);
      sustained.delete(note);
      const v = voice(note, velocity, audioContext().currentTime);
      if (!v) return;
      held.add(note);
      v.source.onended = () => {
        if (voices.get(note) === v) voices.delete(note);
      };
      voices.set(note, v);
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
    play(note, velocity, delay, duration) {
      const start = audioContext().currentTime + Math.max(0, delay);
      const v = voice(note, velocity, start);
      if (!v) return;
      scheduled.add(v);
      v.source.onended = () => scheduled.delete(v);
      fade(v, start + duration);
    },
    allOff() {
      for (const note of [...voices.keys()]) release(note);
      const now = audioContext().currentTime;
      for (const v of scheduled) {
        // One not started yet just never starts; one sounding fades
        try {
          fade(v, now);
        } catch {
          v.source.stop();
        }
      }
      scheduled.clear();
      held.clear();
      sustained.clear();
    },
  };
}
