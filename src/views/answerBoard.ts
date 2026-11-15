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
  /** The boxes; with `replay`, a wide Replay button above them (enabled or not) */
  render(boxes: readonly AnswerBox[], replay?: { enabled: boolean }): void;
  /** Called with a box's id when it's pressed; returns a function that stops it */
  onAnswer(listener: (id: string) => void): () => void;
  /** Called when the Replay button is pressed; returns a function that stops it */
  onReplay(listener: () => void): () => void;
}

export function createAnswerBoard(el: HTMLElement): AnswerBoard {
  const listeners = new Set<(id: string) => void>(), replayListeners = new Set<() => void>();
  // The buttons are redrawn with each render, so one listener on the board catches them all
  el.addEventListener("click", e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    button.blur();   // so Space stays the pedal
    if (button.dataset.answer) for (const l of listeners) l(button.dataset.answer);
    else if (button.classList.contains("replay")) for (const l of replayListeners) l();
  });
  let shown = "";
  return {
    render(boxes, replay) {
      const replayHtml = replay
        ? `<button class="replay" title="Play it again"${replay.enabled ? "" : " disabled"}><span aria-hidden="true">▶</span> Replay</button>` : "";
      const html = replayHtml + `<div class="boxes">` + boxes.map(b =>
        `<button class="box${b.state ? " " + b.state : ""}" data-answer="${esc(b.id)}"${b.disabled ? " disabled" : ""}>` +
        (b.key ? `<kbd>${b.key}</kbd>` : "") + `<span class="boxLabel">${esc(b.label)}</span>` +
        `<span class="boxDetail">${b.detail ? esc(b.detail) : "&nbsp;"}</span></button>`).join("") + `</div>`;
      // Redraw only on change, so a box isn't replaced under the pointer mid-click
      if (html !== shown) el.innerHTML = shown = html;
    },
    onAnswer(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    onReplay(listener) {
      replayListeners.add(listener);
      return () => { replayListeners.delete(listener); };
    },
  };
}
