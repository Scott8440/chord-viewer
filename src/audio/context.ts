// The app's one AudioContext, shared by the metronome click and the ear-training sounds, made on first use.
// Browsers only start audio after a user gesture (a MIDI note isn't one), so it is resumed on every gesture.
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (ctx) return ctx;
  // iOS: play through the ring/silent switch, like a music app (Safari 16.4+; elsewhere this does nothing)
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session) try { session.type = "playback"; } catch {}
  ctx = new AudioContext();
  // Listen in the capture phase so nothing can swallow it, and on every gesture event, since browsers differ in which
  // count (iOS wants touchend or click, not pointerdown)
  for (const type of ["pointerdown", "touchend", "click", "keydown"]) addEventListener(type, unlockAudio, { capture: true });
  return ctx;
}

/** Starts audio if it isn't running: works inside a gesture, or after one in browsers that remember it (Chrome) */
export function unlockAudio() {
  if (!ctx || ctx.state === "running") return;
  void ctx.resume();
  // Older iOS only unlocks once a sound starts inside the gesture: a silent one will do
  const silent = ctx.createBufferSource();
  silent.buffer = ctx.createBuffer(1, 1, 22050);
  silent.connect(ctx.destination);
  silent.start();
}
