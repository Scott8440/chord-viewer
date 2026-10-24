// Technique exercises as prescriptive note sequences, the staples of piano exams and warm-up books: five-finger
// patterns, arpeggios, broken chords and the chromatic scale. Each is played from any octave (the first note sets
// it) and judged like a scale.
import { chromaOf, type KeyContext } from "../theory";
import { atInversion } from "./inversions";
import type { NoteStep, SequenceExercise, SequenceStep } from "./sequence";
import type { ScaleOctaves } from "./scales";

export const ARPEGGIO_INVERSIONS = [0, 1, 2] as const;
export type ArpeggioInversion = typeof ARPEGGIO_INVERSIONS[number];
export const INVERSION_NAMES = ["root position", "first inversion", "second inversion"] as const;

const octaveWords = (n: ScaleOctaves) => n === 1 ? "one octave" : "two octaves";

/** The key's tonic triad: [offset from the tonic, spelled name] for root, 3rd and 5th */
function tonicTriad(key: KeyContext): [number, string][] {
  const t = chromaOf(key.tonic);
  return [0, 2, 4].map(d => [(chromaOf(key.scale[d]) - t + 12) % 12, key.scale[d]]);
}

const note = (offset: number, name: string): NoteStep => ({ kind: "note", offset, name });

/** A line up, its top note, and the same line back down */
const upAndDown = (up: NoteStep[], top: NoteStep): NoteStep[] => [...up, top, ...[...up].reverse()];

/**
 * Five-finger pattern: the key's first five notes up and back down (1 2 3 4 5 4 3 2 1; minor: 1 2 ♭3 4 5), then the
 * tonic chord, root position, all five fingers staying put.
 */
export function fiveFingerExercise(key: KeyContext): SequenceExercise {
  const t = chromaOf(key.tonic);
  const five = key.scale.slice(0, 5).map(name => note((chromaOf(name) - t + 12) % 12, name));
  const notes = [...five, ...five.slice(0, 4).reverse()];
  const chord: SequenceStep = {
    kind: "chord",
    chord: atInversion({ rootPc: key.tonicPc, root: key.tonic, type: key.mode === "major" ? "M" : "m" }, 0),
  };
  return {
    id: `fivefinger:${key.tonic}:${key.mode}`,
    title: `${key.tonic} ${key.mode} five-finger pattern`,
    instruction: `Play ${key.tonic} ${key.mode}'s first five notes up and back down, a finger each, then its tonic chord in root position`,
    basePc: t,
    keyValue: `${key.tonic}:${key.mode}`,
    steps: [...notes, chord],
  };
}

/**
 * Arpeggio of the tonic triad, up and back down over 1 or 2 octaves, from the root (root position) or from the 3rd
 * or 5th (first or second inversion), ending where it started.
 */
export function arpeggioExercise(key: KeyContext, octaves: ScaleOctaves, inversion: ArpeggioInversion): SequenceExercise<NoteStep> {
  const triad = tonicTriad(key);
  // The triad from the chosen note up: a note below where it starts goes up an octave
  const start = triad.slice(inversion).concat(triad.slice(0, inversion).map(([o, n]) => [o + 12, n] as [number, string]));
  const up: NoteStep[] = [];
  for (let o = 0; o < octaves; o++) for (const [off, name] of start) up.push(note(off + 12 * o, name));
  const [firstOff, firstName] = start[0];
  const position = INVERSION_NAMES[inversion];
  return {
    id: `arpeggio:${key.tonic}:${key.mode}:${inversion}:${octaves}`,
    title: `${key.tonic} ${key.mode} arpeggio`,
    instruction: `Play the ${key.tonic} ${key.mode} arpeggio${inversion ? `, ${position} (from ${firstName})` : ""}, up and back down, ` +
      `${octaveWords(octaves)}, starting on any ${firstName}`,
    basePc: key.tonicPc,
    keyValue: `${key.tonic}:${key.mode}`,
    steps: upAndDown(up, note(firstOff + 12 * octaves, firstName)),
  };
}

/**
 * Broken chords, as in exams: the tonic triad in each position in turn, each broken low–middle–high–middle (C E G E,
 * E G C G, G C E C …), up 1 or 2 octaves to the root, then the same back down.
 */
export function brokenChordExercise(key: KeyContext, octaves: ScaleOctaves): SequenceExercise<NoteStep> {
  const triad = tonicTriad(key);
  const up: NoteStep[] = [];
  for (let k = 0; k < 3 * octaves; k++) {
    // Position k: the triad's notes from its k-th note up, the lowest at or above the last position's lowest
    const chord = [0, 1, 2].map(i => {
      const j = k + i, [off, name] = triad[j % 3];
      return note(off + 12 * Math.floor(j / 3), name);
    });
    up.push(chord[0], chord[1], chord[2], chord[1]);
  }
  const [rootOff, rootName] = triad[0];
  return {
    id: `broken:${key.tonic}:${key.mode}:${octaves}`,
    title: `${key.tonic} ${key.mode} broken chords`,
    instruction: `Play ${key.tonic} ${key.mode}'s tonic chord broken, low–middle–high–middle, in each position up ` +
      `${octaveWords(octaves)} and back down, starting on any ${rootName}`,
    basePc: key.tonicPc,
    keyValue: `${key.tonic}:${key.mode}`,
    steps: upAndDown(up, note(rootOff + 12 * octaves, rootName)),
  };
}

const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 * Chromatic scale from the key's tonic, every semitone up and back down over 1 or 2 octaves: sharps going up and
 * flats coming down, as it's usually written, the starting note keeping its own name.
 */
export function chromaticExercise(key: KeyContext, octaves: ScaleOctaves): SequenceExercise<NoteStep> {
  const t = chromaOf(key.tonic);
  const name = (off: number, names: string[]) => off % 12 === 0 ? key.tonic : names[(t + off) % 12];
  const up: NoteStep[] = [], down: NoteStep[] = [];
  for (let off = 0; off < 12 * octaves; off++) {
    up.push(note(off, name(off, SHARPS)));
    down.push(note(off, name(off, FLATS)));
  }
  return {
    id: `chromatic:${key.tonic}:${octaves}`,
    title: `Chromatic scale from ${key.tonic}`,
    instruction: `Play the chromatic scale from ${key.tonic}, every semitone up and back down, ${octaveWords(octaves)}, ` +
      `starting on any ${key.tonic}`,
    basePc: t,
    keyValue: `${key.tonic}:${key.mode}`,
    steps: [...up, note(12 * octaves, key.tonic), ...down.reverse()],
  };
}
