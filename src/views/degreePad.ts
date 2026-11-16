// Degree buttons: large tap targets for the ear-training modes that are answered by playing a note (scale degrees,
// melodies), so they work on a phone or without a keyboard. Each button plays its note like a key: note-on when
// pressed, note-off when let go, through the same input path as the MIDI keyboard (source "pad").
import type { Emit } from "../input/events";
import { esc } from "./html";

export const DEGREE_PAD_SOURCE = "pad";

export interface PadButton {
  label: string;
  /** The MIDI note it plays */
  note: number;
}

export interface DegreePadView {
  /** The buttons to show, in order; null hides the pad */
  show(buttons: readonly PadButton[] | null): void;
}

export function createDegreePad(el: HTMLElement, emit: Emit): DegreePadView {
  const src = { source: DEGREE_PAD_SOURCE, channel: 0 };
  /** Pointer id → the note it started */
  const down = new Map<number, number>();
  let shown = "";

  function release(pointer: number, time: number) {
    const note = down.get(pointer);
    if (note == null) return;
    down.delete(pointer);
    emit({ type: "noteOff", note, velocity: 0, time, ...src });
  }

  el.addEventListener("pointerdown", e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-note]");
    if (!b || e.button !== 0) return;
    e.preventDefault(); // no focus (Space stays the pedal), no text selection or double-tap zoom
    release(e.pointerId, e.timeStamp);
    const note = Number(b.dataset.note);
    down.set(e.pointerId, note);
    emit({ type: "noteOn", note, velocity: 100, time: e.timeStamp, ...src });
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"] as const)
    el.addEventListener(type, e => release(e.pointerId, e.timeStamp));

  return {
    show(buttons) {
      const html = buttons
        ? buttons
            .map(
              b =>
                `<button type="button" data-note="${b.note}" aria-label="Degree ${esc(b.label)}">${esc(b.label)}</button>`,
            )
            .join("")
        : "";
      el.hidden = !buttons;
      if (html === shown) return;
      shown = html;
      for (const pointer of [...down.keys()]) release(pointer, performance.now());
      el.innerHTML = html;
    },
  };
}
