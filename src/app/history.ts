// Practice history: kept in IndexedDB (in memory only if the browser won't store anything) and recorded by the modes,
// with the footer's record count and Export / Import.
import { openIdbStore } from "../progress/idbStore";
import { createRecorder, type Recorder } from "../progress/recorder";
import { exportFile, parseExport } from "../progress/records";
import { createMemoryStore, type ProgressStore } from "../progress/store";
import { $ } from "./dom";

export interface History {
  store: Promise<ProgressStore>;
  recorder: Recorder;
  /** False when the browser wouldn't store anything and history only lasts while the page is open */
  saved(): boolean;
}

/** Opens the history and runs the footer. `imported` is called after an import adds records. */
export function openHistory(device: string, imported: () => void): History {
  let saved = true;
  const store: Promise<ProgressStore> = openIdbStore().catch(e => {
    console.error("Practice history won't be saved:", e);
    saved = false;
    return createMemoryStore();
  });
  const recorder = createRecorder(store, device);

  async function showCount() {
    const n = await (await store).count();
    $("historyCount").textContent = `${n} record${n === 1 ? "" : "s"}` + (saved ? "" : " (not saved in this browser)");
  }
  void showCount();
  recorder.onRecorded(() => void showCount());

  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  function note(text: string) {
    $("historyNote").textContent = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { $("historyNote").textContent = ""; }, 6000);
  }

  $("historyExport").onclick = async () => {
    $("historyExport").blur();
    const records = await (await store).all();
    const blob = new Blob([JSON.stringify(exportFile(records, Date.now()))], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chord-display-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  $("historyImport").onclick = () => { $("historyImport").blur(); $("historyFile").click(); };
  $<HTMLInputElement>("historyFile").onchange = async () => {
    const input = $<HTMLInputElement>("historyFile"), file = input.files?.[0];
    input.value = "";   // so the same file can be picked again
    if (!file) return;
    const parsed = parseExport(await file.text());
    if ("error" in parsed) { note(parsed.error); return; }
    const added = await (await store).merge(parsed.records);
    const already = parsed.records.length - added;
    note(`Imported ${added} new record${added === 1 ? "" : "s"}` + (already ? `, ${already} already here` : "") +
         (parsed.skipped ? `, ${parsed.skipped} unreadable` : "") + ".");
    void showCount();
    imported();
  };

  return { store, recorder, saved: () => saved };
}
