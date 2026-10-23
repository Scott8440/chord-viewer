// Number keys as an input source, for answering by scale degree without a controller: 1–7 play that degree of the
// current key. Only on while a mode that asks for degrees turns it on; the mode says which note each digit is.
import type { Emit } from "./events";

export const DEGREE_KEYS_SOURCE = "deg";

/** Listens for 1–7 until the returned function is called. `noteOf` gives a digit's MIDI note, or null to ignore it. */
export function createDegreeKeys(emit: Emit, noteOf: (digit: string) => number | null): () => void {
  const src = { source: DEGREE_KEYS_SOURCE, channel: 0 };
  const down = new Map<string, number>();  // digit -> MIDI note it started

  function keydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey || target.tagName === "INPUT" || target.tagName === "SELECT") return;
    if (!/^[1-7]$/.test(e.key)) return;
    e.preventDefault();
    if (e.repeat || down.has(e.key)) return;
    const note = noteOf(e.key);
    if (note == null) return;
    down.set(e.key, note);
    emit({ type: "noteOn", note, velocity: 100, time: e.timeStamp, ...src });
  }
  function keyup(e: KeyboardEvent) {
    const note = down.get(e.key);
    if (note == null) return;
    down.delete(e.key);
    emit({ type: "noteOff", note, velocity: 0, time: e.timeStamp, ...src });
  }
  function releaseAll(time: number) {
    for (const note of down.values()) emit({ type: "noteOff", note, velocity: 0, time, ...src });
    down.clear();
  }
  // Losing focus means we will never see the key-ups
  const blur = (e: Event) => releaseAll(e.timeStamp);

  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    window.removeEventListener("blur", blur);
    releaseAll(performance.now());
  };
}
