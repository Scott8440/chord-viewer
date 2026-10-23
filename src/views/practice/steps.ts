// Rows of steps, shared by progressions, sequence exercises and the routine overview.

/** done: played (or clean, in a routine); flawed: finished with mistakes; skipped: passed over */
export type StepState = "done" | "current" | "upcoming" | "flawed" | "skipped";

/** One step in a row: green when done, underlined when current; an optional second line underneath. `extra` adds
 *  classes, e.g. "late" for a timed step that missed its beat. */
export function stepHtml(state: StepState, mainHtml: string, otherHtml?: string, extra = ""): string {
  return `<span class="step ${state}${extra ? " " + extra : ""}"><span class="main">${mainHtml}</span>` +
    (otherHtml === undefined ? "" : `<span class="other">${otherHtml || "&nbsp;"}</span>`) + "</span>";
}
