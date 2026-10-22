// Judging chords from the held keys, shared by every exercise that asks for a chord.
//
// A chord counts as soon as the held keys form it, however they got there: rolled, or legato with common tones
// held from the previous chord. An attempt is only judged wrong when keys were newly pressed and then every key
// was released without the chord ever being formed. Just letting go of the previous chord is not an attempt.

export interface ChordAttempt {
  /** Keys held at the last update, to tell new presses from releases */
  prevHeld: number[];
  /** A key was pressed since the attempt started, so releasing everything judges it */
  pressed: boolean;
  /** Fullest set of notes held during the attempt, for feedback */
  peak: number[];
}

export type AttemptOutcome =
  | { kind: "match" }
  | { kind: "miss"; notes: number[] }
  | { kind: "none" };

/** A new attempt; keys already held (e.g. the previous chord) are not part of it. */
export const freshAttempt = (held: number[] = []): ChordAttempt => ({ prevHeld: held, pressed: false, peak: [] });

/** Feeds the keys now held (MIDI numbers, low to high) and says whether they form the target or an attempt missed it. */
export function trackAttempt(a: ChordAttempt, notes: number[], isTarget: (notes: number[]) => boolean):
    { attempt: ChordAttempt; outcome: AttemptOutcome } {
  if (isTarget(notes)) return { attempt: freshAttempt(notes), outcome: { kind: "match" } };
  if (!notes.length) {
    return { attempt: freshAttempt(), outcome: a.pressed ? { kind: "miss", notes: a.peak } : { kind: "none" } };
  }
  const pressed = a.pressed || notes.some(n => !a.prevHeld.includes(n));
  const peak = pressed && notes.length >= a.peak.length ? notes : a.peak;
  return { attempt: { prevHeld: notes, pressed, peak }, outcome: { kind: "none" } };
}
