// Diatonic chords exercise: every chord of a key in order, up the key (I, ii, iii … vii°) and back to I,
// as a prescriptive chord sequence.
import type { KeyContext } from "../theory";
import { atInversion } from "./inversions";
import { diatonicChords } from "./romanPrompts";
import type { ChordStep, SequenceExercise } from "./sequence";

export interface DiatonicOptions {
  /** Seventh chords (Imaj7, ii7 …) instead of triads */
  sevenths: boolean;
  /** Every chord must have its root in the bass */
  rootPosition: boolean;
}

const TRIAD_TYPES = new Set(["M", "m", "dim"]);

/** The key's diatonic triads or sevenths from the tonic up, ending back on the tonic chord. */
export function diatonicChordsExercise(key: KeyContext, opts: DiatonicOptions): SequenceExercise<ChordStep> {
  const keyValue = `${key.tonic}:${key.mode}`;
  const diatonic = diatonicChords(key).filter(c => TRIAD_TYPES.has(c.type) !== opts.sevenths);
  const chords = diatonic.map(c => {
    const chord = { rootPc: c.rootPc, root: c.root, type: c.type, roman: { numeral: c.numeral, keyValue, filterIgnored: false } };
    return opts.rootPosition ? atInversion(chord, 0) : chord;
  });
  const kind = opts.sevenths ? "seventh chords" : "triads";
  const first = diatonic[0].numeral, last = diatonic[diatonic.length - 1].numeral;
  return {
    id: `diatonic:${keyValue}:${opts.sevenths ? 7 : 3}:${opts.rootPosition ? "root" : "any"}`,
    title: `${key.tonic} ${key.mode} ${opts.sevenths ? "sevenths" : "triads"}`,
    instruction: `Play the diatonic ${kind} of ${key.tonic} ${key.mode} in order, ${first} up to ${last} and back to ${first}, ` +
      (opts.rootPosition ? "each in root position" : "in any voicing"),
    basePc: key.tonicPc,
    keyValue,
    steps: [...chords, chords[0]].map(chord => ({ kind: "chord", chord })),
  };
}
