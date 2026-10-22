// Computer keyboard input source (for testing without a controller).
// A–K white keys, W/E/T/Y/U black keys, Z/X octave, Space pedal, Esc panic.
import type { Emit } from "./events";

export const KEYBOARD_SOURCE = "kbd";

export const KEYMAP: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16 };

export interface KeyboardSource {
  /** Forgets which keys are down, after a panic from elsewhere. */
  reset(): void;
  readonly octave: number;
}

export function createKeyboardSource(emit: Emit, onOctave: (octave: number) => void): KeyboardSource {
  const src = { source: KEYBOARD_SOURCE, channel: 0 };
  let octave = 4;
  const down = new Map<string, number>();  // key -> MIDI note it started

  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey || target.tagName === "INPUT" || target.tagName === "SELECT") return;
    const k = e.key.toLowerCase();
    if (e.key === "Escape") { emit({ type: "panic", time: e.timeStamp }); down.clear(); return; }
    if (e.repeat) { if (k in KEYMAP || k === " ") e.preventDefault(); return; }
    if (k === " ") { e.preventDefault(); emit({ type: "pedal", down: true, time: e.timeStamp, ...src }); return; }
    if (k === "z") { octave = Math.max(0, octave - 1); onOctave(octave); return; }
    if (k === "x") { octave = Math.min(8, octave + 1); onOctave(octave); return; }
    if (k in KEYMAP) {
      const note = 12 * (octave + 1) + KEYMAP[k];
      down.set(k, note);
      emit({ type: "noteOn", note, velocity: 100, time: e.timeStamp, ...src });
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === " ") { emit({ type: "pedal", down: false, time: e.timeStamp, ...src }); return; }
    if (down.has(k)) { emit({ type: "noteOff", note: down.get(k)!, velocity: 0, time: e.timeStamp, ...src }); down.delete(k); }
  });
  // Losing focus means we will never see the key-ups, so release everything now
  window.addEventListener("blur", (e) => {
    for (const note of down.values()) emit({ type: "noteOff", note, velocity: 0, time: e.timeStamp, ...src });
    down.clear();
    emit({ type: "pedal", down: false, time: e.timeStamp, ...src });
  });

  onOctave(octave);
  return {
    reset() { down.clear(); },
    get octave() { return octave; },
  };
}
