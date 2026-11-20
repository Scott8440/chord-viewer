// Segmented buttons for short choices: each `select[data-seg]` gets a row of buttons after it, one per option (its
// `data-short` text, else its own), the selected one marked. The select stays the control that's bound to the
// setting: a button sets its value and fires its change event; `sync` marks the buttons again after the select
// changed (or rebuilds them if its options did). Which of the two shows is up to the stylesheet (the panel look).
import { esc } from "./html";

export interface Segments {
  /** Marks each row's selected button from its select */
  sync(): void;
}

export function createSegments(root: ParentNode): Segments {
  const rows = [...root.querySelectorAll<HTMLSelectElement>("select[data-seg]")].map(select => {
    const row = document.createElement("div");
    row.className = "seg";
    row.setAttribute("role", "radiogroup");
    select.after(row);
    let built = "";
    const sync = () => {
      const options = [...select.options];
      const shape = options.map(o => `${o.value}\u0000${o.dataset.short ?? o.text}`).join("\u0001");
      if (shape !== built) {
        built = shape;
        row.innerHTML = options
          .map(
            o =>
              `<button type="button" role="radio" data-value="${esc(o.value)}" title="${esc(o.text)}">` +
              `${esc(o.dataset.short ?? o.text)}</button>`,
          )
          .join("");
      }
      for (const b of row.querySelectorAll<HTMLButtonElement>("button")) {
        const on = b.dataset.value === select.value;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
      }
    };
    row.addEventListener("click", e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b) return;
      e.preventDefault(); // inside a label: don't pass the click on to the select
      b.blur(); // so Space stays the pedal
      if (select.value === b.dataset.value) return;
      select.value = b.dataset.value!;
      select.dispatchEvent(new Event("change"));
      sync();
    });
    sync();
    return sync;
  });
  return {
    sync() {
      for (const sync of rows) sync();
    },
  };
}
