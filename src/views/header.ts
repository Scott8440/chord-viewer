// Header and footer controls: MIDI status and input chips, pedal light, key selector, keyboard octave.
import type { MidiInputInfo, MidiStatus } from "../input/midi";
import { KEY_MAJORS, KEY_MINORS, prettyAcc } from "../theory";

export interface HeaderView {
  showMidiStatus(status: MidiStatus): void;
  setPedal(down: boolean): void;
  setOctave(octave: number): void;
}

export function createHeaderView(els: {
  statusDot: HTMLElement; statusText: HTMLElement; inputs: HTMLElement; retry: HTMLElement;
  pedal: HTMLElement; kbdOct: HTMLElement;
}, onToggleInput: (id: string, on: boolean) => void): HeaderView {
  const setStatus = (kind: string, text: string) => {
    els.statusDot.className = "dot " + kind;
    els.statusText.textContent = text;
  };

  const renderInputs = (inputs: MidiInputInfo[]) => {
    els.inputs.innerHTML = "";
    for (const input of inputs) {
      const label = document.createElement("label");
      label.className = "chip" + (input.enabled ? "" : " off");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = input.enabled;
      cb.onchange = () => {
        label.classList.toggle("off", !cb.checked);
        onToggleInput(input.id, cb.checked);
      };
      label.append(cb, document.createTextNode(input.name));
      els.inputs.append(label);
    }
  };

  return {
    showMidiStatus(status) {
      switch (status.kind) {
        case "requesting":
          setStatus("", "Requesting MIDI access…");
          break;
        case "unsupported":
          setStatus("err", "This browser has no Web MIDI — use Chrome or Edge");
          break;
        case "denied":
          setStatus("err", status.framed
            ? "MIDI blocked: this page is inside a preview. Open the file directly in Chrome or Edge."
            : "MIDI access denied. Allow MIDI in the address bar's site settings, then click Retry.");
          els.retry.hidden = false;
          break;
        case "ready": {
          renderInputs(status.inputs);
          const count = status.inputs.length;
          setStatus(count ? "ok" : "", count ? `${count} input${count > 1 ? "s" : ""}` : "No MIDI inputs found — plug one in");
          break;
        }
      }
    },
    setPedal(down) { els.pedal.classList.toggle("down", down); },
    setOctave(octave) { els.kbdOct.textContent = "Keyboard octave: C" + octave; },
  };
}

/** Fills the key <select> and selects `saved` if it is a valid option. Returns the value actually selected. */
export function initKeySelect(sel: HTMLSelectElement, saved: string): string {
  const opt = (value: string, text: string) => { const o = document.createElement("option"); o.value = value; o.textContent = text; return o; };
  sel.append(opt("", "None"));
  const gMaj = document.createElement("optgroup"); gMaj.label = "Major";
  KEY_MAJORS.forEach(t => gMaj.append(opt(t + ":major", prettyAcc(t) + " major")));
  const gMin = document.createElement("optgroup"); gMin.label = "Minor";
  KEY_MINORS.forEach(t => gMin.append(opt(t + ":minor", prettyAcc(t) + " minor")));
  sel.append(gMaj, gMin);
  sel.value = saved;
  if (sel.value !== saved) sel.value = "";
  return sel.value;
}
