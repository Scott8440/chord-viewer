// Note practice panel: the prompt, right/wrong feedback and the score.
import type { NotePracticeState } from "../exercises/notePractice";
import { FLAT, prettyAcc, SHARP, type KeyContext } from "../theory";

export interface PracticeView {
  render(s: NotePracticeState, key: KeyContext | null): void;
}

export function createPracticeView(els: { prompt: HTMLElement; feedback: HTMLElement; score: HTMLElement }): PracticeView {
  return {
    render(s, key) {
      els.prompt.textContent = prettyAcc(s.prompt.name);
      els.feedback.className = s.status;
      if (s.status === "correct") {
        els.feedback.textContent = "✓ Correct";
      } else if (s.status === "wrong" && s.played != null) {
        // Spell the wrong note the same way the prompt is spelled
        const pc = s.played % 12;
        const name = key ? key.spell[pc] : (s.prompt.name.includes("b") ? FLAT : SHARP)[pc];
        els.feedback.textContent = `✗ That was ${prettyAcc(name)} — try again`;
      } else {
        els.feedback.textContent = "";
      }
      els.score.textContent = s.answered ? `${s.firstTry} / ${s.answered} right first time` : "";
    },
  };
}
