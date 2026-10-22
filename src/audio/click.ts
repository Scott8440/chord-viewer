// The metronome click: follows the transport (it never decides where the beats are, so an external clock can drive
// it the same way). A look-ahead scheduler: every 25 ms, clicks due in the next 120 ms are scheduled on the audio
// clock, so timer jitter never makes a click late.
import { beatAt, beatMs, timeOfBeat, type Transport } from "../timing/transport";

const TICK_MS = 25;
const AHEAD_MS = 120;

export interface ClickPlayer {
  /** Click on the transport's beats (accenting the first of each bar), or fall silent (null) */
  follow(transport: Transport | null): void;
}

export function createClickPlayer(): ClickPlayer {
  let ctx: AudioContext | null = null;
  let transport: Transport | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  /** Performance time of the last click scheduled. Kept by time, not beat number, so a new tempo or anchor carries
   *  on without a doubled click (nothing within half a beat of it is scheduled) */
  let lastClick = -Infinity;

  // Browsers only start audio after a user gesture; any click or key press will do
  const unlock = () => { void ctx?.resume(); };
  addEventListener("pointerdown", unlock);
  addEventListener("keydown", unlock);

  /** Audio-clock time (s) at which a sound is heard at performance time `ms`; output latency included */
  function audioTimeOf(c: AudioContext, ms: number): number {
    const ts = c.getOutputTimestamp?.();
    if (ts?.contextTime !== undefined && ts.performanceTime) return ts.contextTime + (ms - ts.performanceTime) / 1000;
    return c.currentTime + (ms - performance.now()) / 1000 - (c.outputLatency || c.baseLatency || 0);
  }

  function click(c: AudioContext, at: number, accent: boolean) {
    const osc = c.createOscillator(), gain = c.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    gain.gain.setValueAtTime(accent ? 0.5 : 0.3, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.05);
  }

  function schedule() {
    if (!ctx || !transport || ctx.state !== "running") return;
    const now = performance.now();
    for (let beat = Math.ceil(beatAt(transport, now)); timeOfBeat(transport, beat) < now + AHEAD_MS; beat++) {
      const time = timeOfBeat(transport, beat);
      if (time < lastClick + beatMs(transport) / 2) continue;
      const at = audioTimeOf(ctx, time);
      if (at >= ctx.currentTime) click(ctx, at, beat % transport.beatsPerBar === 0);
      lastClick = time;
    }
  }

  return {
    follow(t) {
      transport = t;
      if (!t) { clearInterval(timer); timer = undefined; lastClick = -Infinity; return; }
      ctx ??= new AudioContext();
      void ctx.resume();
      timer ??= setInterval(schedule, TICK_MS);
      schedule();
    },
  };
}
