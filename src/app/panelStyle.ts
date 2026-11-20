// The practice panel's look, new or old, from the footer's toggle: a class on the body that the stylesheet keys on.
// Kept only in this browser (a comparison switch, not a practice setting), and new unless switched off.
import { loadItem, saveItem } from "./safeStorage";

const KEY = "chordDisplay.panelStyle";

export function bindPanelStyle(button: HTMLElement) {
  const apply = (polished: boolean) => {
    document.body.classList.toggle("polished", polished);
    button.classList.toggle("on", polished);
    button.setAttribute("aria-pressed", String(polished));
  };
  apply(loadItem(KEY) !== "old");
  button.onclick = () => {
    button.blur(); // so Space stays the pedal
    const polished = !document.body.classList.contains("polished");
    saveItem(KEY, polished ? "new" : "old");
    apply(polished);
  };
}
