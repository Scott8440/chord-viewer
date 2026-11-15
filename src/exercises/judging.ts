// What every prompt-and-answer drill keeps: whether the prompt is waiting, wrong or answered, whether it was missed,
// and the answered and right-first-time counts; and how a right answer, a wrong one and moving on change them. Each
// drill's reducer says only how it judges an answer and what else it keeps per prompt. Pure.

export type PromptStatus = "waiting" | "wrong" | "correct";

export interface Judged<P> {
  prompt: P;
  /** waiting: not answered yet; wrong: the last answer was wrong; correct: answered, about to move on */
  status: PromptStatus;
  /** A wrong answer was given for this prompt */
  missed: boolean;
  /** Prompts finished (answered or skipped) */
  answered: number;
  /** Prompts answered with no wrong answer first */
  firstTry: number;
}

/** Moving on to a prompt: the next one after an answer, or skipping this one */
export type MoveOn<P> = { type: "next"; prompt: P } | { type: "skip"; prompt: P };

/** Answered: counted, and right first time unless it was missed; `changes` are the drill's own */
export const answeredRight = <S extends Judged<unknown>>(s: S, changes: Partial<S> = {}): S => ({
  ...s,
  ...changes,
  status: "correct",
  answered: s.answered + 1,
  firstTry: s.firstTry + (s.missed ? 0 : 1),
});

/** A wrong answer: the prompt waits, and is no longer right first time */
export const answeredWrong = <S extends Judged<unknown>>(s: S, changes: Partial<S> = {}): S => ({
  ...s,
  ...changes,
  status: "wrong",
  missed: true,
});

/** On to a new prompt, with the drill's per-prompt fields reset (`fresh`). A skipped prompt counts as answered, but
 *  not right first time; skipping one already answered doesn't count it again */
export const movedOn = <S extends Judged<P>, P>(s: S, a: MoveOn<P>, fresh: Partial<S> = {}): S => ({
  ...s,
  ...fresh,
  prompt: a.prompt,
  status: "waiting",
  missed: false,
  answered: a.type === "skip" && s.status !== "correct" ? s.answered + 1 : s.answered,
});
