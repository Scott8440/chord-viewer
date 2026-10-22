// Chord recognizer data: the chord types we know, and every weight used to score a reading.
// Lower cost wins. Tuning the recognizer means editing this file and re-running the voicing corpus.

export interface ChordTemplate {
  /** Stable id. Roman numerals key off "M", "m", "dim", "dim7", "m7b5" and "aug". */
  id: string;
  /** Lead-sheet suffix written after the root: "", "m7", "maj7#11" */
  symbol: string;
  /** Long name, shown as "C dominant seventh" */
  name: string;
  /** Spell the root the way minor-family chords usually are (C#m, not Dbm) */
  minor?: boolean;
  /** Intervals from the root in tonal notation. "(5P)" marks a tone that may be left out. */
  tones: string;
  /** How common the chord is: 0 for triads, up to 4.5 for rare alterations */
  cost: number;
  /** Only valid with the root in the bass (power chords) */
  rootPosition?: boolean;
}

// Order matters only for ties: an earlier template wins an exactly equal cost.
export const CHORD_TEMPLATES: readonly ChordTemplate[] = [
  // Triads and power chord
  { id: "M",      symbol: "",        name: "major",                    tones: "1P 3M 5P",               cost: 0 },
  { id: "m",      symbol: "m",       name: "minor",          minor: true, tones: "1P 3m 5P",            cost: 0 },
  { id: "5",      symbol: "5",       name: "power chord (perfect 5th)", tones: "1P 5P",                 cost: 1, rootPosition: true },
  // Sevenths
  { id: "7",      symbol: "7",       name: "dominant seventh",         tones: "1P 3M (5P) 7m",          cost: 1 },
  { id: "maj7",   symbol: "maj7",    name: "major seventh",            tones: "1P 3M (5P) 7M",          cost: 1 },
  { id: "m7",     symbol: "m7",      name: "minor seventh",  minor: true, tones: "1P 3m (5P) 7m",       cost: 1 },
  // Common colors
  { id: "dim",    symbol: "dim",     name: "diminished",     minor: true, tones: "1P 3m 5d",            cost: 2 },
  { id: "aug",    symbol: "aug",     name: "augmented",                tones: "1P 3M 5A",               cost: 2 },
  { id: "sus2",   symbol: "sus2",    name: "suspended second",         tones: "1P 2M 5P",               cost: 2 },
  { id: "sus4",   symbol: "sus4",    name: "suspended fourth",         tones: "1P 4P 5P",               cost: 2 },
  { id: "m7b5",   symbol: "m7b5",    name: "half-diminished", minor: true, tones: "1P 3m 5d 7m",        cost: 2 },
  { id: "6",      symbol: "6",       name: "sixth",                    tones: "1P 3M 5P 6M",            cost: 2 },
  { id: "m6",     symbol: "m6",      name: "minor sixth",    minor: true, tones: "1P 3m 5P 6M",         cost: 2 },
  { id: "dim7",   symbol: "dim7",    name: "diminished seventh", minor: true, tones: "1P 3m 5d 7d",     cost: 2 },
  { id: "7sus4",  symbol: "7sus4",   name: "suspended fourth seventh", tones: "1P 4P 5P 7m",            cost: 2 },
  { id: "add9",   symbol: "add9",    name: "added ninth",              tones: "1P 3M 5P 9M",            cost: 2 },
  { id: "madd9",  symbol: "m(add9)", name: "minor added ninth", minor: true, tones: "1P 3m 5P 9M",      cost: 2 },
  { id: "9",      symbol: "9",       name: "dominant ninth",           tones: "1P 3M (5P) 7m 9M",       cost: 2 },
  { id: "maj9",   symbol: "maj9",    name: "major ninth",              tones: "1P 3M (5P) 7M 9M",       cost: 2 },
  { id: "m9",     symbol: "m9",      name: "minor ninth",    minor: true, tones: "1P 3m (5P) 7m 9M",    cost: 2 },
  // Extended and altered
  { id: "13",     symbol: "13",      name: "dominant thirteenth",      tones: "1P 3M (5P) 7m (9M) 13M", cost: 2.5 },
  { id: "m11",    symbol: "m11",     name: "minor eleventh", minor: true, tones: "1P 3m (5P) 7m (9M) 11P", cost: 2.5 },
  { id: "6add9",  symbol: "6/9",     name: "sixth added ninth",        tones: "1P 3M 5P 6M 9M",         cost: 3 },
  { id: "m69",    symbol: "m6/9",    name: "minor sixth added ninth", minor: true, tones: "1P 3m 5P 6M 9M", cost: 3 },
  { id: "maj13",  symbol: "maj13",   name: "major thirteenth",         tones: "1P 3M (5P) 7M 9M 13M", cost: 3 },
  { id: "m13",    symbol: "m13",     name: "minor thirteenth", minor: true, tones: "1P 3m (5P) 7m 9M 13M", cost: 3 },
  { id: "7b9",    symbol: "7b9",     name: "dominant flat ninth",      tones: "1P 3M (5P) 7m 9m",       cost: 3 },
  { id: "7#9",    symbol: "7#9",     name: "dominant sharp ninth",     tones: "1P 3M (5P) 7m 9A",       cost: 3 },
  { id: "7#11",   symbol: "7#11",    name: "lydian dominant seventh",  tones: "1P 3M (5P) 7m 11A",      cost: 3 },
  { id: "7b5",    symbol: "7b5",     name: "dominant seventh flat fifth", tones: "1P 3M 5d 7m",         cost: 3 },
  { id: "7#5",    symbol: "7#5",     name: "seventh augmented fifth",  tones: "1P 3M 5A 7m",            cost: 3 },
  { id: "maj7#5", symbol: "maj7#5",  name: "augmented seventh",        tones: "1P 3M 5A 7M",            cost: 3 },
  { id: "mMaj7",  symbol: "m(maj7)", name: "minor/major seventh", minor: true, tones: "1P 3m (5P) 7M",  cost: 3 },
  { id: "9sus4",  symbol: "9sus4",   name: "suspended fourth ninth",   tones: "1P 4P 5P 7m 9M",         cost: 3 },
  { id: "maj7#11", symbol: "maj7#11", name: "major seventh sharp eleventh", tones: "1P 3M (5P) 7M 11A", cost: 3 },
  { id: "9#11",   symbol: "9#11",    name: "dominant ninth sharp eleventh", tones: "1P 3M (5P) 7m 9M 11A", cost: 3 },
  { id: "maj9#11", symbol: "maj9#11", name: "major sharp eleventh (lydian)", tones: "1P 3M (5P) 7M 9M 11A", cost: 3 },
  { id: "13b9",   symbol: "13b9",    name: "dominant thirteenth flat ninth", tones: "1P 3M (5P) 7m 9m 13M", cost: 3 },
  { id: "13#11",  symbol: "13#11",   name: "dominant thirteenth sharp eleventh", tones: "1P 3M (5P) 7m 9M 11A 13M", cost: 3 },
  { id: "7b13",   symbol: "7b13",    name: "dominant seventh flat thirteenth", tones: "1P 3M (5P) 7m 13m", cost: 3 },
  { id: "13sus4", symbol: "13sus4",  name: "suspended fourth thirteenth", tones: "1P 4P 5P 7m 9M 13M", cost: 3 },
  { id: "7sus4b9", symbol: "7sus4b9", name: "suspended fourth flat ninth", tones: "1P 4P 5P 7m 9m",     cost: 3 },
  { id: "m9b5",   symbol: "m9b5",    name: "half-diminished ninth", minor: true, tones: "1P 3m 5d 7m 9M", cost: 3 },
  { id: "7#5#9",  symbol: "7#5#9",   name: "seventh sharp fifth sharp ninth", tones: "1P 3M 5A 7m 9A",  cost: 3 },
  { id: "7#5b9",  symbol: "7#5b9",   name: "seventh sharp fifth flat ninth", tones: "1P 3M 5A 7m 9m",   cost: 3 },
  { id: "mMaj9",  symbol: "m(maj9)", name: "minor/major ninth", minor: true, tones: "1P 3m (5P) 7M 9M", cost: 3 },
  // Rare: named when nothing simpler fits
  { id: "Mb5",    symbol: "(b5)",    name: "major flat fifth",         tones: "1P 3M 5d",               cost: 4.5 },
  { id: "dimMaj7", symbol: "dim(maj7)", name: "diminished major seventh", minor: true, tones: "1P 3m 5d 7M", cost: 4.5 },
  { id: "maj7b5", symbol: "maj7b5",  name: "major seventh flat fifth", tones: "1P 3M 5d 7M",            cost: 4.5 },
  { id: "maj7sus4", symbol: "maj7sus4", name: "major seventh suspended fourth", tones: "1P 4P 5P 7M",   cost: 4.5 },
  { id: "9b5",    symbol: "9b5",     name: "dominant ninth flat fifth", tones: "1P 3M 5d 7m 9M",        cost: 4.5 },
  { id: "9#5",    symbol: "9#5",     name: "dominant ninth sharp fifth", tones: "1P 3M 5A 7m 9M",       cost: 4.5 },
  { id: "maj9#5", symbol: "maj9#5",  name: "major ninth sharp fifth",  tones: "1P 3M 5A 7M 9M",         cost: 4.5 },
  { id: "9b13",   symbol: "9b13",    name: "dominant ninth flat thirteenth", tones: "1P 3M (5P) 7m 9M 13m", cost: 4.5 },
  { id: "7b9b13", symbol: "7b9b13",  name: "dominant flat ninth flat thirteenth", tones: "1P 3M (5P) 7m 9m 13m", cost: 4.5 },
  { id: "7#9b13", symbol: "7#9b13",  name: "dominant sharp ninth flat thirteenth", tones: "1P 3M (5P) 7m 9A 13m", cost: 4.5 },
  { id: "7#9#11", symbol: "7#9#11",  name: "dominant sharp ninth sharp eleventh", tones: "1P 3M (5P) 7m 9A 11A", cost: 4.5 },
  { id: "7b9#11", symbol: "7b9#11",  name: "dominant flat ninth sharp eleventh", tones: "1P 3M (5P) 7m 9m 11A", cost: 4.5 },
  { id: "7b9#9",  symbol: "7b9#9",   name: "dominant flat and sharp ninth", tones: "1P 3M (5P) 7m 9m 9A", cost: 4.5 },
  { id: "13#9",   symbol: "13#9",    name: "dominant thirteenth sharp ninth", tones: "1P 3M (5P) 7m 9A 13M", cost: 4.5 },
  { id: "69#11",  symbol: "6/9#11",  name: "sixth added ninth sharp eleventh", tones: "1P 3M 5P 6M 9M 11A", cost: 4.5 },
  { id: "maj13#11", symbol: "maj13#11", name: "major thirteenth sharp eleventh", tones: "1P 3M (5P) 7M 9M 11A 13M", cost: 4.5 },
  { id: "m11#5",  symbol: "m11#5",   name: "minor eleventh sharp fifth", minor: true, tones: "1P 3m 5A 7m 9M 11P", cost: 4.5 },
  { id: "quartal", symbol: "sus4(quartal)", name: "quartal",           tones: "1P 4P 7m 10m",           cost: 4.5 },
];

export interface RecognizerWeights {
  /** Bass is a chord tone but not the root (an inversion, C/E) */
  inversion: number;
  /** Leaving out an optional tone, by its degree (5 for the 5th, 9 for the 9th) */
  omit: Record<number, number>;
  /** Chord over a bass note that is not in it (G/C). Added on top of `inversion`. */
  upperStructure: number;
  /** Only chords this simple may sit over a foreign bass */
  upperMaxBaseCost: number;
  /** Over-a-bass readings are only tried when the best plain reading costs more than this */
  upperOnlyAbove: number;
  /** Ignoring one non-bass note as an added/passing tone. Only tried when nothing else fits. */
  addedNote: number;
  key: {
    /** Root is not in the key (harmonic minor's raised 7th counts as in the key) */
    rootOutside: number;
    /** Each played chord tone outside the key */
    toneOutside: number;
    /** Root is the tonic */
    tonicRoot: number;
  };
  /** Readings whose cost, before the key adjustments, is above this are rejected (clusters show "?").
      The key only re-ranks readings; it never hides one. */
  maxCost: number;
  /** Alternatives shown: within this much of the best, at most `maxAlts` */
  altWindow: number;
  maxAlts: number;
}

export const RECOGNIZER_WEIGHTS: RecognizerWeights = {
  inversion: 1.5,
  omit: { 5: 0.5, 9: 0.25 },
  upperStructure: 0.5,
  upperMaxBaseCost: 2,
  upperOnlyAbove: 3,
  addedNote: 3,
  key: { rootOutside: 1.0, toneOutside: 0.4, tonicRoot: -0.7 },
  maxCost: 6,
  altWindow: 2.5,
  maxAlts: 3,
};
