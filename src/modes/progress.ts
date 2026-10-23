// Progress mode: the practice history as charts (src/views/progressView.ts). Reads the history when started and on
// `refresh` (a new selection, or after an import). The selection lasts while the page is open.
import type { ProgressStore } from "../progress/store";
import type { ProgressSelection, ProgressView } from "../views/progressView";
import type { Mode } from "./performance";

let selection: ProgressSelection = { range: "30", routine: null, exercise: null };

/** A new range, routine or exercise to show (then `refresh` the mode) */
export const selectProgress = (s: ProgressSelection) => { selection = s; };

export function startProgress(views: { progress: ProgressView }, history: Promise<ProgressStore>, saved: () => boolean): Mode {
  let stopped = false;
  async function show() {
    const records = await (await history).all();
    if (!stopped) views.progress.render(records, selection, saved());
  }
  void show();
  return {
    stop() { stopped = true; views.progress.clear(); },
    refresh: () => void show(),
  };
}
