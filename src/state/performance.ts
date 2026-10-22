// Performance state: which notes are held, which are ringing on the pedal, and pedal state.
// A pure reducer over input events; states are never mutated.
import type { InputEvent } from "../input/events";

export interface PerformanceState {
  /** note -> "source:channel" keys holding it down */
  readonly held: ReadonlyMap<number, ReadonlySet<string>>;
  /** Notes released while the pedal was down */
  readonly sustained: ReadonlySet<number>;
  /** "source:channel" -> sustain pedal down */
  readonly pedals: ReadonlyMap<string, boolean>;
}

export const initialPerformance: PerformanceState = { held: new Map(), sustained: new Set(), pedals: new Map() };

const holderKey = (source: string, channel: number) => source + ":" + channel;

export function pedalDown(s: PerformanceState): boolean {
  for (const v of s.pedals.values()) if (v) return true;
  return false;
}

/**
 * Applies one input event. Returns the same state object when the event changes nothing
 * that matters (a note-off for a note nobody holds), so callers can skip redrawing.
 */
export function reducePerformance(s: PerformanceState, e: InputEvent): PerformanceState {
  switch (e.type) {
    case "noteOn": {
      const held = new Map(s.held);
      held.set(e.note, new Set(held.get(e.note)).add(holderKey(e.source, e.channel)));
      const sustained = new Set(s.sustained);
      sustained.delete(e.note);
      return { ...s, held, sustained };
    }
    case "noteOff": {
      const holders = s.held.get(e.note);
      if (!holders) return s;
      const rest = new Set(holders);
      rest.delete(holderKey(e.source, e.channel));
      const held = new Map(s.held);
      let sustained = s.sustained;
      if (rest.size === 0) {
        held.delete(e.note);
        if (pedalDown(s)) sustained = new Set(sustained).add(e.note);
      } else {
        held.set(e.note, rest);
      }
      return { ...s, held, sustained };
    }
    case "pedal": {
      const next = { ...s, pedals: new Map(s.pedals).set(holderKey(e.source, e.channel), e.down) };
      return pedalDown(next) ? next : { ...next, sustained: new Set() };
    }
    case "allNotesOff": {
      // Only releases this source's held notes; they don't move to sustained
      const prefix = e.source + ":";
      const held = new Map<number, ReadonlySet<string>>();
      for (const [note, holders] of s.held) {
        const rest = new Set([...holders].filter(k => !k.startsWith(prefix)));
        if (rest.size) held.set(note, rest);
      }
      return { ...s, held };
    }
    case "panic":
      return { held: new Map(), sustained: new Set(), pedals: new Map() };
  }
}

/** Notes that count toward the chord, low to high. */
export function soundingNotes(s: PerformanceState, includeSustained: boolean): number[] {
  const set = new Set(s.held.keys());
  if (includeSustained) for (const n of s.sustained) set.add(n);
  return [...set].sort((a, b) => a - b);
}

/** Notes ringing only because of the pedal. */
export function pedalOnlyNotes(s: PerformanceState): Set<number> {
  return new Set([...s.sustained].filter(n => !s.held.has(n)));
}
