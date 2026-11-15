// A board of large answer boxes in the left card, in place of the staff (ear training's chord qualities: one box per
// chord type on offer). DOM only: the presenter (practice/drills.ts, `chordEarAnswers`) says what the boxes show.
import { esc } from "./html";

export interface AnswerBox {
  /** Passed to `onAnswer` when the box is pressed */
  id: string;
  label: string;
  /** Its number key, shown in the corner */
  key?: number;
  /** right: the answer (shown once found); wrong: already tried */
  state: "" | "right" | "wrong";
  /** A second line, e.g. the chord once it's named ("D♭ minor") */
  detail?: string;
  disabled: boolean;
}

export interface AnswerBoard {
  render(boxes: readonly AnswerBox[]): void;
  /** Called with a box's id when it's pressed; returns a function that stops it */
  onAnswer(listener: (id: string) => void): () => void;
}

export function createAnswerBoard(el: HTMLElement): AnswerBoard {
  const listeners = new Set<(id: string) => void>();
  // The boxes are redrawn with each render, so one listener on the board catches them all
  el.addEventListener("click", e => {
    const box = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-answer]");
    if (!box || box.disabled) return;
    box.blur();   // so Space stays the pedal
    for (const l of listeners) l(box.dataset.answer!);
  });
  let shown = "";
  return {
    render(boxes) {
      const html = boxes.map(b =>
        `<button class="box${b.state ? " " + b.state : ""}" data-answer="${esc(b.id)}"${b.disabled ? " disabled" : ""}>` +
        (b.key ? `<kbd>${b.key}</kbd>` : "") + `<span class="boxLabel">${esc(b.label)}</span>` +
        `<span class="boxDetail">${b.detail ? esc(b.detail) : "&nbsp;"}</span></button>`).join("");
      // Redraw only on change, so a box isn't replaced under the pointer mid-click
      if (html !== shown) el.innerHTML = shown = html;
    },
    onAnswer(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
