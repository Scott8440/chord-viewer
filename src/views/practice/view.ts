// The practice panel: label, prompt, feedback and score. Each exercise has a presenter (drills.ts, sequence.ts,
// routine.ts) that turns its state into a PracticeDisplay; the view only renders that.

export interface PracticeDisplay {
  label: string;
  /** Prompt as HTML */
  promptHtml: string;
  /** Prompt font size: one big note, a chord symbol, a row of chords, or a titled row of notes */
  size: "note" | "chord" | "progression" | "sequence";
  /** Line under the prompt, e.g. "D♭ major seventh" */
  sub: string;
  status: "waiting" | "wrong" | "correct";
  feedback: string;
  score: string;
  /** Text of the button under the prompt; defaults to "Skip" */
  skipLabel?: string;
}

export interface PracticeView {
  render(d: PracticeDisplay): void;
}

export function createPracticeView(els: {
  label: HTMLElement; prompt: HTMLElement; sub: HTMLElement; feedback: HTMLElement; score: HTMLElement; skip: HTMLElement;
}): PracticeView {
  return {
    render(d) {
      els.label.textContent = d.label;
      els.prompt.innerHTML = d.promptHtml;
      els.prompt.className = d.size;
      els.sub.textContent = d.sub;
      els.feedback.className = d.status;
      els.feedback.textContent = d.feedback;
      els.score.textContent = d.score;
      els.skip.textContent = d.skipLabel ?? "Skip";
    },
  };
}
