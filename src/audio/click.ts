// The metronome click: follows the transport (it never decides where the beats are, so an external clock can drive
// it the same way). A look-ahead scheduler: every 25 ms, clicks that must start within the next 120 ms of the audio
// clock are scheduled on it, so timer jitter never makes a click late, however much output latency there is.
import { beatAt, beatMs, timeOfBeat, type Transport } from "../timing/transport";
import { audioContext, unlockAudio } from "./context";

const TICK_MS = 25;
const AHEAD_MS = 120;

export interface ClickPlayer {
  /** Click on the transport's beats (accenting the first of each bar), or fall silent (null) */
  follow(transport: Transport | null): void;
}

export interface ClickStatus {
  /** Clicks are due but the browser hasn't let audio start yet (it needs a click, tap or key) */
  blocked: boolean;
  /** How long the audio output takes to sound (ms), as the browser reports it; null while not playing */
  outputLatencyMs: number | null;
}

/** `onStatus` is called whenever the status changes. */
export function createClickPlayer(onStatus: (status: ClickStatus) => void = () => {}): ClickPlayer {
  let ctx: AudioContext | null = null;
  let transport: Transport | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  /** Performance time of the last click scheduled. Kept by time, not beat number, so a new tempo or anchor carries
   *  on without a doubled click (nothing within half a beat of it is scheduled) */
  let lastClick = -Infinity;

  let last: ClickStatus = { blocked: false, outputLatencyMs: null };
  function report() {
    const running = !!transport && !!ctx && ctx.state === "running";
    // Browsers settle on the device's latency a little after starting, so this is checked on every schedule
    const latency = running ? Math.round(((ctx!.outputLatency || 0) + (ctx!.baseLatency || 0)) * 1000) : null;
    const status = { blocked: !!transport && !!ctx && !running, outputLatencyMs: latency };
    // Only real changes (a few ms of jitter isn't one)
    const moved = (status.outputLatencyMs == null) !== (last.outputLatencyMs == null) ||
      Math.abs((status.outputLatencyMs ?? 0) - (last.outputLatencyMs ?? 0)) >= 10;
    if (status.blocked !== last.blocked || moved) onStatus(last = status);
  }

  /** Audio-clock time (s) at which a sound is heard at performance time `ms`; output latency included */
  function audioTimeOf(c: AudioContext, ms: number): number {
    const estimate = c.currentTime + (ms - performance.now()) / 1000 - (c.outputLatency || c.baseLatency || 0);
    const ts = c.getOutputTimestamp?.();
    if (ts?.contextTime === undefined || !ts.performanceTime) return estimate;
    const precise = ts.contextTime + (ms - ts.performanceTime) / 1000;
    // A browser whose output timestamp is on another clock would put every click in the past (silence): ignore it
    return Math.abs(precise - estimate) < 0.25 ? precise : estimate;
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
    report();
    // Look ahead on the audio clock: a click heard at a beat must start output latency earlier (Bluetooth headphones
    // can add 300 ms), so the beats to schedule reach that much further than AHEAD_MS of performance time
    const horizon = ctx.currentTime + AHEAD_MS / 1000;
    for (let beat = Math.ceil(beatAt(transport, performance.now())); ; beat++) {
      const time = timeOfBeat(transport, beat);
      const at = audioTimeOf(ctx, time);
      if (at > horizon) break;
      // Too late to be heard on the beat (the first one after starting, say), or scheduled already
      if (at < ctx.currentTime || time < lastClick + beatMs(transport) / 2) continue;
      click(ctx, at, beat % transport.beatsPerBar === 0);
      lastClick = time;
    }
  }

  return {
    follow(t) {
      transport = t;
      if (!t) { clearInterval(timer); timer = undefined; lastClick = -Infinity; report(); return; }
      if (!ctx) {
        ctx = audioContext();
        ctx.addEventListener("statechange", report);
      }
      // Works when this follows a gesture (ticking the Metronome box); otherwise the next gesture does it
      unlockAudio();
      report();
      timer ??= setInterval(schedule, TICK_MS);
      schedule();
    },
  };
}
