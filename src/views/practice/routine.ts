// Presenter for routines: the overview of its items, the item in progress, and the summary at the end.

import type { PromptStyle } from "../../exercises/chordPrompt";
import { itemExercise, itemLabel, keyProgress, mixesExercises, routineSummary, type RoutineState } from "../../exercises/routines";
import { prettyAcc } from "../../theory";
import { esc } from "../html";
import { runText, sequenceDisplay, steadinessText } from "./sequence";
import { stepHtml } from "./steps";
import { prettyNames } from "./text";
import type { PracticeDisplay } from "./view";

/** A routine: the overview of its items, then the item in progress (shown as on its own), or a summary at the end. */
export function routineDisplay(r: RoutineState, style: PromptStyle): PracticeDisplay {
  // One entry per key: a routine that plays several exercises in a key groups them
  const mixed = mixesExercises(r);
  const overview = keyProgress(r).map(g => {
    // In a mixed routine, the key in progress says which of its exercises is up
    const part = mixed ? (g.state === "current" ? esc(itemLabel(r, r.index).exercise) : "") : undefined;
    return stepHtml(g.state, esc(prettyAcc(g.label)), part);
  }).join("");
  const row = `<div class="routineRow">${overview}</div>`;
  const total = r.items.length;

  if (r.status === "done") {
    const sum = routineSummary(r);
    const weakest = sum.weakest.map(w => {
      const what = w.result.mistakes ? `${w.result.mistakes} mistake${w.result.mistakes > 1 ? "s" : ""}` : steadinessText(w.result);
      return `${prettyAcc(itemExercise(r.items[w.index], r.base).title)} (${what})`;
    });
    return {
      label: r.routine.name,
      promptHtml: row + `<div class="seqTitle">Routine complete</div>`,
      size: "sequence",
      sub: weakest.length ? `Weakest: ${weakest.join(", ")}` : sum.finished ? "Every item clean and even" : "",
      status: sum.clean === sum.finished && sum.finished > 0 ? "correct" : "waiting",
      feedback: `${sum.finished} of ${total} played · ${sum.clean} clean · ${sum.totalMistakes} mistake${sum.totalMistakes === 1 ? "" : "s"}` +
        (sum.durationMs ? ` · ${formatDuration(sum.durationMs)}` : "") + (sum.skipped ? ` · ${sum.skipped} skipped` : ""),
      score: "",
      skipLabel: "Start again",
    };
  }

  const inner = sequenceDisplay(r.current, style);
  let { feedback, status } = inner;
  // Until the next item starts, show how the previous one went
  if (r.previous && r.current.status !== "playing" && !r.current.startHint) {
    const title = prettyNames(itemExercise(r.items[r.previous.index], r.base).title);
    feedback = (r.previous.result.mistakes ? `${title}: ${r.previous.result.mistakes} mistake${r.previous.result.mistakes > 1 ? "s" : ""}`
      : `✓ ${title}: clean`) + " · " + runText(r.previous.result);
    status = r.previous.result.mistakes ? "waiting" : "correct";
  }
  const clean = r.outcomes.filter(o => o !== "skipped" && !o.mistakes).length;
  return {
    ...inner,
    promptHtml: row + inner.promptHtml,
    sub: `${r.index + 1} / ${total}` + (inner.sub && r.current.status === "playing" ? ` · ${inner.sub}` : ""),
    feedback, status,
    score: r.outcomes.length ? `${r.outcomes.length} / ${total} done · ${clean} clean` : "",
    skipLabel: "Skip",
  };
}

/** "3m 05s" or "42 s" */
function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
