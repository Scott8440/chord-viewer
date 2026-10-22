// The beat light: one dot per beat of the bar, the current one lit (the first of the bar is bigger). Follows the
// transport, redrawing on animation frames only when the beat changes.
import { beatAt, type Transport } from "../timing/transport";

export interface BeatView {
  /** Follow a transport, or hide (null) */
  render(transport: Transport | null): void;
  /** Says the click can't be heard until the page is clicked or a key pressed (browsers' autoplay rules) */
  setSoundBlocked(blocked: boolean): void;
}

export function createBeatView(el: HTMLElement): BeatView {
  let transport: Transport | null = null, frame = 0, shown = "", soundBlocked = false;
  const hint = () => soundBlocked ? `<span class="soundHint">Click or press a key to hear the click</span>` : "";
  function draw() {
    if (!transport) return;
    const beat = Math.floor(beatAt(transport, performance.now()));
    // Before the first beat nothing is lit
    const lit = beat < 0 ? -1 : beat % transport.beatsPerBar;
    const html = Array.from({ length: transport.beatsPerBar }, (_, i) =>
      `<span class="${["b", i === 0 ? "down" : "", i === lit ? "lit" : ""].filter(Boolean).join(" ")}"></span>`).join("") + hint();
    if (html !== shown) el.innerHTML = shown = html;
    frame = requestAnimationFrame(draw);
  }
  return {
    render(t) {
      transport = t;
      el.hidden = !t;
      cancelAnimationFrame(frame);
      if (t) draw();
      else el.innerHTML = shown = "";
    },
    setSoundBlocked(blocked) {
      soundBlocked = blocked;
    },
  };
}
