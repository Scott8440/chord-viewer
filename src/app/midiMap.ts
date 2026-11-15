// MIDI mapping on the page: the footer's "MIDI map" button turns mapping on, outlining every control that can be
// mapped (anything with `data-midi-map`); click one and the next key pressed is mapped to it (Delete clears it, Esc
// cancels, Esc again or the button ends mapping). Then that key presses the control instead of playing a note, in the
// mode it was mapped in. One key can press several controls that are never on screen together (Replay, and Next
// round in its place): mapping a key takes it from any other control showing at the time, and leaves it on hidden
// ones. Mapped controls show their key in a corner badge. Saved in localStorage.
import type { InputEvent } from "../input/events";
import {
  assignNote,
  clearTarget,
  midiNoteName,
  noteFor,
  sanitizeMidiMap,
  targetsFor,
  type MidiMap,
} from "../input/midiMap";
import { loadJson, saveItem } from "./safeStorage";

const STORAGE = "chordDisplay.midiMap";

export interface MidiMapper {
  /** Each input event first: true when it pressed a mapped control (or was mapped), so it isn't played as a note */
  handle(event: InputEvent): boolean;
}

export function createMidiMapper(o: {
  button: HTMLButtonElement;
  /** Where to say what's happening while mapping */
  hint: HTMLElement;
  /** The mode mappings are kept for, or null when there's nothing to map (the Progress page) */
  scope(): string | null;
}): MidiMapper {
  let map: MidiMap = sanitizeMidiMap(loadJson(STORAGE));
  const save = () => saveItem(STORAGE, JSON.stringify(map));

  let mapping = false;
  /** The control waiting for a key */
  let waiting: string | null = null;
  /** Notes that pressed a control: their note-offs are kept out of the performance too */
  const pressed = new Set<string>();

  const controls = () => [...document.querySelectorAll<HTMLElement>("[data-midi-map]")];
  /** A control's name for the hint: its own label, else its text */
  const nameOf = (el: HTMLElement) => el.dataset.midiName ?? el.textContent?.replace(/\s+/g, " ").trim() ?? "";
  /** The control on screen for an id (several may exist; hidden ones have no offsetParent) */
  const visible = (id: string) => controls().find(el => el.dataset.midiMap === id && el.offsetParent !== null);

  /** Badges and the waiting outline, after any change (the page redraws its controls often) */
  function refresh() {
    const scope = o.scope();
    for (const el of controls()) {
      const note = scope ? noteFor(map, scope, el.dataset.midiMap!) : undefined;
      if (note == null) delete el.dataset.midiLabel;
      else el.dataset.midiLabel = midiNoteName(note);
      el.classList.toggle("midiWaiting", el.dataset.midiMap === waiting);
    }
  }
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      refresh();
    });
  }).observe(document.body, { childList: true, subtree: true });

  function say(text: string) {
    o.hint.textContent = text;
  }
  function setMapping(on: boolean) {
    mapping = on;
    waiting = null;
    document.body.classList.toggle("midiMapping", on);
    o.button.classList.toggle("on", on);
    o.button.setAttribute("aria-pressed", String(on));
    say(on ? "Click a highlighted control, then press a key on your keyboard to map it" : "");
    refresh();
  }

  o.button.onclick = () => {
    o.button.blur();
    setMapping(!mapping);
  };

  // While mapping, a click on a mappable control picks it instead of pressing it
  document.addEventListener(
    "click",
    e => {
      if (!mapping) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-midi-map]");
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      (el as HTMLButtonElement).blur?.();
      if (!o.scope()) return;
      waiting = el.dataset.midiMap!;
      say(`Press a key for “${nameOf(el)}” · Delete clears it · Esc cancels`);
      refresh();
    },
    { capture: true },
  );

  // Esc and Delete belong to mapping while it's on (not to Clear, or the computer-key notes)
  window.addEventListener(
    "keydown",
    e => {
      if (!mapping || !["Escape", "Delete", "Backspace"].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const scope = o.scope();
      if (e.key === "Escape") {
        if (waiting) {
          waiting = null;
          say("Click a highlighted control, then press a key on your keyboard to map it");
          refresh();
        } else setMapping(false);
      } else if (waiting && scope) {
        map = clearTarget(map, scope, waiting);
        save();
        const el = visible(waiting);
        say(`Cleared the key for “${el ? nameOf(el) : waiting}”`);
        waiting = null;
        refresh();
      }
    },
    { capture: true },
  );

  return {
    handle(event) {
      if (event.type !== "noteOn" && event.type !== "noteOff") return false;
      const key = `${event.source}:${event.channel}:${event.note}`;
      if (event.type === "noteOff") return pressed.delete(key);
      const scope = o.scope();
      if (!scope) return false;
      if (waiting) {
        const target = waiting;
        // Controls showing now would clash with this one; hidden ones keep the key for when they show instead
        map = assignNote(map, scope, target, event.note, other => other !== target && !visible(other));
        save();
        const el = visible(target);
        const others = targetsFor(map, scope, event.note).filter(t => t !== target);
        say(
          `${midiNoteName(event.note)} now presses “${el ? nameOf(el) : target}”` +
            (others.length
              ? ` (and ${others.length === 1 ? "one other control" : `${others.length} other controls`} when showing instead)`
              : "") +
            " · click another control, or MIDI map to finish",
        );
        waiting = null;
        refresh();
        pressed.add(key);
        return true;
      }
      // The one of its controls on screen (mapping keeps a key off controls showing together)
      const el = targetsFor(map, scope, event.note)
        .map(visible)
        .find(e => e != null);
      if (!el) return false;
      // A mapped key presses its control (a disabled one just does nothing) and isn't played
      el.click();
      pressed.add(key);
      return true;
    },
  };
}
