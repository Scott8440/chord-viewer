// The built-in clock, a page behaviour (PAGE_SETUP's `metronome`): while the exercise's metronome option is on, it
// runs the transport at the exercise's tempo (a new tempo carries on from the current beat). The click and the beat
// light follow the transport in state, whoever drives it, so an external clock could replace this driver alone.
import { retempo, startTransport, type Transport } from "../timing/transport";
import type { ClickPlayer } from "../audio/click";
import type { BeatView } from "../views/beat";
import type { AppState } from "../state/app";
import type { AppStore } from "./performance";

export const BEATS_PER_BAR = 4;
/** The first beat comes a moment after starting, so the first click isn't cut short */
const START_DELAY_MS = 150;

export function startMetronome(store: AppStore, views: { click: ClickPlayer; beat: BeatView }): () => void {
  function drive(s: AppState) {
    const { metronome, bpm } = s.settings.exercise;
    const now = performance.now();
    const next: Transport | null = !metronome ? null
      : s.transport ? retempo(s.transport, bpm, now)
      : startTransport(bpm, BEATS_PER_BAR, now + START_DELAY_MS);
    if (next !== s.transport) store.dispatch({ type: "setTransport", transport: next });
  }
  function follow(t: Transport | null) {
    views.click.follow(t);
    views.beat.render(t);
  }
  const unsubscribe = store.subscribe((s, prev) => {
    if (s.settings.exercise !== prev.settings.exercise) drive(s);
    if (s.transport !== prev.transport) follow(s.transport);
  });
  drive(store.getState());
  follow(store.getState().transport);
  return () => {
    unsubscribe();
    store.dispatch({ type: "setTransport", transport: null });
    follow(null);
  };
}
