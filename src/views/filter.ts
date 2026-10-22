// Filter for practice modes (chord types, progressions): grouped checkboxes, with a summary of what is selected.
import { prettyAcc } from "../theory";

export interface FilterGroup {
  label: string;
  types: readonly { id: string; label: string }[];
}

export interface FilterView {
  render(selected: readonly string[]): void;
}

/** `onChange` gets the new selection; the last selected item cannot be turned off. */
export function createFilterView(els: { summary: HTMLElement; body: HTMLElement }, groups: readonly FilterGroup[],
                                 summaryLabel: string, onChange: (selected: string[]) => void): FilterView {
  const boxes = new Map<string, { cb: HTMLInputElement; label: HTMLLabelElement }>();
  const labelOf = new Map<string, string>();
  for (const group of groups) {
    const row = document.createElement("div");
    row.className = "filterGroup";
    const title = document.createElement("span");
    title.className = "filterTitle";
    title.textContent = group.label;
    row.append(title);
    for (const t of group.types) {
      const label = document.createElement("label");
      label.className = "chip";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.onchange = () => {
        cb.blur();   // so computer-key note input keeps working
        const selected = [...boxes].filter(([, b]) => b.cb.checked).map(([id]) => id);
        if (!selected.length) { cb.checked = true; return; }   // keep at least one
        onChange(selected);
      };
      label.append(cb, document.createTextNode(prettyAcc(t.label)));
      row.append(label);
      boxes.set(t.id, { cb, label });
      labelOf.set(t.id, prettyAcc(t.label));
    }
    els.body.append(row);
  }

  return {
    render(selected) {
      for (const [id, b] of boxes) {
        b.cb.checked = selected.includes(id);
        b.label.classList.toggle("off", !b.cb.checked);
      }
      els.summary.textContent = summaryLabel + ": " + selected.map(id => labelOf.get(id)).join(", ");
    },
  };
}
