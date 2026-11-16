// The footer's Piano sound toggle: while it's on, every note played (MIDI, computer keys, the ear modes' degree buttons)
// sounds on the sampled grand piano, the sustain pedal included. Notes a MIDI mapping turns into button presses never
// reach the store, so they don't sound. The samples load the first time it's turned on; the button says so.
import { createPianoSound, type PianoSound } from "../audio/piano";
import type { AppStore } from "../modes/performance";

export function bindPianoSound(
  store: AppStore,
  button: HTMLElement,
  piano: PianoSound = createPianoSound(),
): () => void {
  const label = button.textContent?.trim() || "Piano sound";
  function show(text: string) {
    button.textContent = text;
  }

  async function ensureLoaded() {
    if (piano.loaded()) return;
    show(`${label} (loading…)`);
    try {
      await piano.load();
      show(label);
    } catch (e) {
      console.error("Couldn't load the piano samples", e);
      show(`${label} (couldn't load)`);
    }
  }
  if (store.getState().settings.pianoSound) void ensureLoaded();

  return store.subscribe((s, prev) => {
    if (s.settings.pianoSound !== prev.settings.pianoSound) {
      if (s.settings.pianoSound) void ensureLoaded();
      else {
        piano.allOff();
        show(label);
      }
    }
    // One new event per input dispatch
    if (!s.settings.pianoSound || s.history === prev.history) return;
    const event = s.history[s.history.length - 1];
    switch (event.type) {
      case "noteOn":
        piano.noteOn(event.note, event.velocity);
        break;
      case "noteOff":
        piano.noteOff(event.note);
        break;
      case "pedal":
        piano.pedal(event.down);
        break;
      case "allNotesOff":
      case "panic":
        piano.allOff();
        break;
    }
  });
}
