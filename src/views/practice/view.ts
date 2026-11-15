// The practice panel: label, prompt, feedback and score. Each exercise has a presenter (drills.ts, sequence.ts,
// routine.ts) that turns its state into a PracticeDisplay; the view only renders that.

export interface PracticeDisplay {
  label: string;
  /** Prompt as HTML; empty hides it (ear training's degrees show on the circle instead) */
  promptHtml: string;
  /** Prompt font size: one big note, a chord symbol, a row of chords, a titled row of notes, or answer buttons */
  size: "note" | "chord" | "progression" | "sequence" | "answers";
  /** Line under the prompt, e.g. "D♭ major seventh" */
  sub: string;
  status: "waiting" | "wrong" | "correct";
  feedback: string;
  score: string;
  /** Text of the button under the prompt; defaults to "Skip" */
  skipLabel?: string;
  /** Text of the Stop/Start button, for exercises that make sound (ear training); hidden when absent */
  stopLabel?: string;
}

export interface PracticeView {
  render(d: PracticeDisplay): void;
  /** Called with a button's `data-answer` when one in the prompt is pressed (ear training's chord qualities);
   *  returns a function that stops it */
  onAnswer(listener: (answer: string) => void): () => void;
}

export function createPracticeView(els: {
  label: HTMLElement; prompt: HTMLElement; sub: HTMLElement; feedback: HTMLElement; score: HTMLElement; skip: HTMLElement;
  stop: HTMLElement;
}): PracticeView {
  const answerListeners = new Set<(answer: string) => void>();
  // Answer buttons come and go with each render, so one listener on the prompt catches them all
  els.prompt.addEventListener("click", e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-answer]");
    if (!button || button.disabled) return;
    button.blur();   // so Space stays the pedal
    for (const l of answerListeners) l(button.dataset.answer!);
  });
  return {
    onAnswer(listener) {
      answerListeners.add(listener);
      return () => { answerListeners.delete(listener); };
    },
    render(d) {
      els.label.textContent = d.label;
      els.prompt.innerHTML = d.promptHtml;
      els.prompt.hidden = !d.promptHtml;
      els.prompt.className = d.size;
      els.sub.textContent = d.sub;
      els.feedback.className = d.status;
      els.feedback.textContent = d.feedback;
      els.score.textContent = d.score;
      els.skip.textContent = d.skipLabel ?? "Skip";
      els.stop.hidden = !d.stopLabel;
      els.stop.textContent = d.stopLabel ?? "";
    },
  };
}
