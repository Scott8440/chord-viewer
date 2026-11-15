// The ladder's level picker: every level, the ones not yet unlocked shown but not choosable.
import type { LadderLevel } from "../exercises/ladders";

export interface LadderPickView {
  /** The levels, those above `unlocked` locked, with `level` chosen */
  render(levels: readonly LadderLevel<unknown>[], unlocked: number, level: number): void;
  /** A level picked; returns unsubscribe */
  onPick(listener: (level: number) => void): () => void;
}

export function createLadderPick(select: HTMLSelectElement): LadderPickView {
  const listeners = new Set<(level: number) => void>();
  let shown = "";
  select.addEventListener("change", () => {
    select.blur(); // so Space stays the pedal
    for (const l of listeners) l(Number(select.value));
  });
  return {
    render(levels, unlocked, level) {
      const key = `${levels.length}:${unlocked}:${level}`;
      if (key === shown) return;
      shown = key;
      select.replaceChildren(
        ...levels.map((l, i) => {
          const o = new Option(`${i > unlocked ? "🔒 " : ""}${i + 1}. ${l.name}`, String(i));
          o.disabled = i > unlocked;
          return o;
        }),
      );
      select.value = String(level);
    },
    onPick(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
