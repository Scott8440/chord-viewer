// The metronome click: follows the transport (it never decides where the beats are, so an external clock can drive
// it the same way). A look-ahead scheduler: every 25 ms, clicks that must start within the next 120 ms of the audio
// clock are scheduled on it, so timer jitter never makes a click late, however much output latency there is.
import { beatAt, beatMs, timeOfBeat, type Transport } from "../timing/transport";

const TICK_MS = 25;
const AHEAD_MS = 120;

export interface ClickPlayer {
  /** Click on the transport's beats (accenting the first of each bar), or fall silent (null) */
  follow(transport: Transport | null): void;
}

/** `blocked(true)` while clicks are due but the browser hasn't let audio start yet (it needs a click, tap or key). */
export function createClickPlayer(blocked: (on: boolean) => void = () => {}): ClickPlayer {
  let ctx: AudioContext | null = null;
  let transport: Transport | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  /** Performance time of the last click scheduled. Kept by time, not beat number, so a new tempo or anchor carries
   *  on without a doubled click (nothing within half a beat of it is scheduled) */
  let lastClick = -Infinity;

  // iOS: play through the ring/silent switch, like a music app (Safari 16.4+; elsewhere this does nothing)
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session) try { session.type = "playback"; } catch {}

  // Browsers only start audio after a user gesture. Listen in the capture phase so nothing can swallow it, and on
  // every gesture event, since browsers differ in which count (iOS wants touchend or click, not pointerdown)
  function unlock() {
    if (!ctx || ctx.state === "running") return;
    void ctx.resume().then(report);
    // Older iOS only unlocks once a sound starts inside the gesture: a silent one will do
    const silent = ctx.createBufferSource();
    silent.buffer = ctx.createBuffer(1, 1, 22050);
    silent.connect(ctx.destination);
    silent.start();
  }
  for (const type of ["pointerdown", "touchend", "click", "keydown"]) addEventListener(type, unlock, { capture: true });

  let wasBlocked = false;
  function report() {
    const now = !!transport && !!ctx && ctx.state !== "running";
    if (now !== wasBlocked) blocked(wasBlocked = now);
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
        ctx = new AudioContext();
        ctx.onstatechange = report;
      }
      // Works when this follows a gesture (ticking the Metronome box); otherwise unlock() does it on the next one
      unlock();
      report();
      timer ??= setInterval(schedule, TICK_MS);
      schedule();
    },
  };
}
