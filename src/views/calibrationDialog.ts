// The latency calibration dialog: what to do, the beat, progress tap by tap, and the result. DOM only; the flow is
// src/modes/calibrate.ts and main.ts wires the two.
import type { CalibrationProgress } from "../modes/calibrate";
import { CALIBRATION_TAPS, CALIBRATION_WARMUP } from "../timing/calibration";
import type { Transport } from "../timing/transport";
import { createBeatView } from "./beat";

export interface CalibrationDialog {
  /** Opens (if closed) following the transport's beats; call again when the transport changes */
  open(transport: Transport): void;
  /** Says the click can't be heard yet (the browser wants a click or key first) */
  setSoundBlocked(blocked: boolean): void;
  show(progress: CalibrationProgress): void;
  close(): void;
}

export function createCalibrationDialog(el: HTMLDialogElement, actions: {
  /** Cancel while listening, or Close after an uneven result: either way, stop */
  cancel(): void;
  retry(): void;
}): CalibrationDialog {
  el.innerHTML = `
    <h2>Calibrate timing</h2>
    <p>Play any note on each click. The first ${CALIBRATION_WARMUP} settle you in; the next ${CALIBRATION_TAPS} are
      measured. Play the way you normally would, not ahead of or behind the click on purpose.</p>
    <div class="calBeat"></div>
    <div class="calTaps"></div>
    <div class="calStatus"></div>
    <div class="calButtons">
      <button class="calRetry" hidden>Try again</button>
      <button class="calClose"></button>
    </div>`;
  const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const beat = createBeatView(q(".calBeat"));
  let done = false;

  // Buttons never keep focus, so Space stays the pedal and computer keys keep playing notes
  const press = (b: HTMLButtonElement, f: () => void) => { b.onclick = () => { b.blur(); f(); }; };
  press(q(".calClose"), () => done ? close() : actions.cancel());
  press(q(".calRetry"), () => actions.retry());
  // Esc (the dialog's own cancel) stops listening too
  el.addEventListener("cancel", e => { e.preventDefault(); if (done) close(); else actions.cancel(); });

  function close() {
    beat.render(null);
    if (el.open) el.close();
  }

  return {
    open(transport) {
      if (!el.open) el.showModal();
      // Nothing inside keeps focus: key presses are notes
      (document.activeElement as HTMLElement | null)?.blur();
      beat.render(transport);
    },
    setSoundBlocked: blocked => beat.setSoundBlocked(blocked),
    show(p) {
      done = p.kind === "done";
      if (p.kind === "cancelled") { close(); return; }
      const measured = p.kind === "listening" ? p.measured : CALIBRATION_TAPS;
      q(".calTaps").innerHTML = Array.from({ length: CALIBRATION_TAPS }, (_, i) =>
        `<span class="${i < measured ? "in" : ""}"></span>`).join("");
      q(".calRetry").hidden = !(p.kind === "done");
      q(".calClose").textContent = p.kind === "done" ? (p.result.steady ? "Done" : "Close") : "Cancel";
      const status = q(".calStatus");
      status.className = "calStatus" + (p.kind === "done" ? (p.result.steady ? " ok" : " warn") : "");
      status.textContent = p.kind === "listening"
        ? p.warmupLeft ? `Warming up: ${p.warmupLeft} more…` : `${p.measured} of ${CALIBRATION_TAPS}`
        : p.result.steady
          ? `Your notes were ${Math.abs(p.result.latencyMs)} ms ${p.result.latencyMs < 0 ? "ahead of" : "behind"} the click ` +
            `(±${p.result.spreadMs} ms). Latency set to ${p.result.latencyMs} ms.`
          : `Those notes were too uneven to measure (±${p.result.spreadMs} ms). Latency unchanged.`;
    },
    close,
  };
}
