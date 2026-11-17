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

/** One answer of several asked in order (progressions: one per chord), shown in a row above the boxes */
export interface AnswerSlot {
  /** "vi" once answered, "?" for the one being asked, empty for those still to come */
  label: string;
  /** A second line once answered, e.g. the chord's name ("Am") */
  detail?: string;
  state: "done" | "current" | "wrong" | "todo";
}

export interface AnswerBoard {
  /** The boxes; with `replay`, a wide Replay button above them (enabled or not); with `slots`, a row of the answers
   *  asked in order, between them */
  render(boxes: readonly AnswerBox[], replay?: { enabled: boolean }, slots?: readonly AnswerSlot[]): void;
  /** Called with a box's id when it's pressed; returns a function that stops it */
  onAnswer(listener: (id: string) => void): () => void;
  /** Called when the Replay button is pressed; returns a function that stops it */
  onReplay(listener: () => void): () => void;
  /** In place of everything else, one large button (between rounds: "Next round"); mapped like Skip */
  renderNext(label: string): void;
  /** Called when that button is pressed; returns a function that stops it */
  onNext(listener: () => void): () => void;
}

export function createAnswerBoard(el: HTMLElement): AnswerBoard {
  const listeners = new Set<(id: string) => void>(),
    replayListeners = new Set<() => void>(),
    nextListeners = new Set<() => void>();
  // The buttons are redrawn with each render, so one listener on the board catches them all
  el.addEventListener("click", e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    button.blur(); // so Space stays the pedal
    if (button.dataset.answer) for (const l of listeners) l(button.dataset.answer);
    else if (button.classList.contains("replay")) for (const l of replayListeners) l();
    else if (button.classList.contains("next")) for (const l of nextListeners) l();
  });
  let shown = "";
  /** What the board's buttons are (Replay or not, and which boxes in which order): while that stays the same, a
   *  render updates them in place rather than redrawing, since a redrawn button under the pointer loses its hover look
   *  (and a mapped key's badge) for a frame, a flicker on the box just pressed */
  let layout = "";
  return {
    render(boxes, replay, slots) {
      const slotsHtml = slots
        ? slots
            .map(
              x =>
                `<span class="slot ${x.state}"><span class="slotLabel">${esc(x.label) || "&nbsp;"}</span>` +
                `<span class="slotDetail">${x.detail ? esc(x.detail) : "&nbsp;"}</span></span>`,
            )
            .join("")
        : "";
      const nextLayout = `${replay ? "r" : ""}|${slots ? slots.length : "-"}|${boxes.map(b => b.id).join("\u0000")}`;
      if (nextLayout === layout) {
        // The slots aren't pressed, so they're simply redrawn
        const row = el.querySelector(".slots");
        if (row && row.innerHTML !== slotsHtml) row.innerHTML = slotsHtml;
        const replayButton = el.querySelector<HTMLButtonElement>("button.replay");
        if (replayButton && replay) replayButton.disabled = !replay.enabled;
        const buttons = el.querySelectorAll<HTMLButtonElement>("button.box");
        boxes.forEach((b, i) => {
          const button = buttons[i];
          button.className = `box${b.state ? " " + b.state : ""}`;
          button.disabled = b.disabled;
          button.querySelector(".boxLabel")!.textContent = b.label;
          // A non-breaking space keeps the line's height when there's no detail
          button.querySelector(".boxDetail")!.textContent = b.detail ?? "\u00a0";
        });
        return;
      }
      layout = nextLayout;
      const replayHtml = replay
        ? `<button class="replay" title="Play it again" data-midi-map="replay" data-midi-name="Replay"${replay.enabled ? "" : " disabled"}><span aria-hidden="true">▶</span> Replay</button>`
        : "";
      el.innerHTML = shown =
        replayHtml +
        (slots ? `<div class="slots" aria-label="Your answers so far">${slotsHtml}</div>` : "") +
        `<div class="boxes">` +
        boxes
          .map(
            b =>
              `<button class="box${b.state ? " " + b.state : ""}" data-answer="${esc(b.id)}" data-midi-map="answer:${esc(b.id)}" data-midi-name="${esc(b.label)}"${b.disabled ? " disabled" : ""}>` +
              (b.key ? `<kbd>${b.key}</kbd>` : "") +
              `<span class="boxLabel">${esc(b.label)}</span>` +
              `<span class="boxDetail">${b.detail ? esc(b.detail) : "&nbsp;"}</span></button>`,
          )
          .join("") +
        `</div>`;
    },
    onAnswer(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onReplay(listener) {
      replayListeners.add(listener);
      return () => {
        replayListeners.delete(listener);
      };
    },
    renderNext(label) {
      const html = `<button class="next" data-midi-map="nextRound" data-midi-name="Next round">${esc(label)} <span aria-hidden="true">→</span></button>`;
      layout = "next";
      if (html !== shown) el.innerHTML = shown = html;
    },
    onNext(listener) {
      nextListeners.add(listener);
      return () => {
        nextListeners.delete(listener);
      };
    },
  };
}
