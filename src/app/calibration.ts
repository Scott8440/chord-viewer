// Latency calibration, in a dialog: from the Calibrate button, or by itself when the metronome starts and the latency
// hasn't been dealt with yet (calibrated, typed in, or declined). The flow is src/modes/calibrate.ts.
import { startCalibrating } from "../modes/calibrate";
import type { AppStore } from "../modes/performance";
import type { AppState } from "../state/app";
import { createCalibrationDialog, type CalibrationDialog } from "../views/calibrationDialog";
import { $ } from "./dom";

export function setUpCalibration(store: AppStore): CalibrationDialog {
  let stop: (() => void) | null = null;

  const dialog = createCalibrationDialog($<HTMLDialogElement>("calibration"), {
    // Declined: it won't open by itself again
    cancel() {
      stop?.();
      stop = null;
      store.dispatch({ type: "setLatencyCalibrated" });
      dialog.close();
    },
    retry: () => calibrate(),
  });

  function calibrate() {
    const transport = store.getState().transport;
    if (!transport) return;
    stop?.();
    dialog.open(transport);
    stop = startCalibrating(store, p => {
      if (p.kind !== "listening") stop = null;
      dialog.show(p);
    });
  }

  $("calibrate").onclick = () => {
    $("calibrate").blur();
    calibrate();
  };
  const needsCalibrating = (s: AppState) => !!s.transport && !s.settings.latencyCalibrated && !stop;
  store.subscribe((s, prev) => {
    if (s.transport && !prev.transport && needsCalibrating(s)) calibrate();
    // A new tempo while calibrating: the dialog's beat light follows it
    else if (stop && s.transport && s.transport !== prev.transport) dialog.open(s.transport);
  });
  // The metronome may already be running from the saved settings
  if (needsCalibrating(store.getState())) calibrate();

  return dialog;
}
