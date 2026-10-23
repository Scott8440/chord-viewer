// Ear-training sounds, synthesised (no samples, so the build stays one small offline file): a soft sustained drone
// and a short piano-like note. Notes asked for while audio is blocked play as soon as it starts.
import { audioContext, unlockAudio } from "./context";

export interface TonePlayer {
  /** Sound a drone on this note (and an octave above), fading over from any drone already playing; null fades it out */
  drone(midi: number | null): void;
  /** Play one note, `delay` seconds from now */
  play(midi: number, delay?: number): void;
  /** Audio is waiting for a click or key press (browser autoplay rules) */
  blocked(): boolean;
  /** Called whenever `blocked()` may have changed; returns a function that stops it */
  onBlockedChange(listener: () => void): () => void;
}

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

const DRONE_GAIN = 0.07, DRONE_FADE_IN = 1.2, DRONE_FADE_OUT = 0.6;
const NOTE_GAIN = 0.3, NOTE_DECAY = 1.8;
/** Piano-ish: partials (multiple, level); higher ones die away faster */
const NOTE_PARTIALS = [[1, 1], [2, 0.45], [3, 0.2], [4, 0.1]] as const;

export function createTonePlayer(): TonePlayer {
  let ctx: AudioContext | null = null;
  let current: { stop(at: number): void } | null = null;
  const listeners = new Set<() => void>();

  function context(): AudioContext {
    if (!ctx) {
      ctx = audioContext();
      ctx.addEventListener("statechange", () => { for (const l of listeners) l(); });
    }
    unlockAudio();
    return ctx;
  }

  function startDrone(c: AudioContext, midi: number) {
    const t = c.currentTime;
    const out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(DRONE_GAIN, t + DRONE_FADE_IN);
    // A warm low tone: two slightly detuned saws, softened, plus a pure octave above
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(out).connect(c.destination);
    const oscs = [-4, 4].map(cents => {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq(midi);
      o.detune.value = cents;
      o.connect(filter);
      return o;
    });
    const octave = c.createOscillator(), octaveGain = c.createGain();
    octave.frequency.value = freq(midi + 12);
    octaveGain.gain.value = 0.6;
    octave.connect(octaveGain).connect(out);
    oscs.push(octave);
    for (const o of oscs) o.start(t);
    return {
      stop(at: number) {
        out.gain.cancelScheduledValues(at);
        out.gain.setValueAtTime(out.gain.value, at);
        out.gain.linearRampToValueAtTime(0, at + DRONE_FADE_OUT);
        for (const o of oscs) o.stop(at + DRONE_FADE_OUT + 0.05);
      },
    };
  }

  return {
    drone(midi) {
      const c = context();
      current?.stop(c.currentTime);
      current = midi == null ? null : startDrone(c, midi);
    },
    play(midi, delay = 0) {
      const c = context();
      const t = c.currentTime + delay;
      for (const [multiple, level] of NOTE_PARTIALS) {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = freq(midi) * multiple;
        const decay = NOTE_DECAY / multiple;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(NOTE_GAIN * level, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + decay + 0.05);
      }
    },
    blocked: () => !!ctx && ctx.state !== "running",
    onBlockedChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
