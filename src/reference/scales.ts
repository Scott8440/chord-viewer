// Reference page: major and minor scales. Prose with keyboard diagrams; every scale, key signature and chord listed is
// worked out from tonal's scale and key data (scaleFormula), not typed in.
import { Key } from "tonal";
import { diatonicTriads, keySignature, scaleFormula } from "../theory/scaleFormula";
import { prettyAcc } from "../theory/spelling";
import type { ReferencePage } from "./pages";
import { scaleFigure, scaleFigures, scaleTable, simpleTable } from "./scaleFigures";

const DEGREE_NAMES = ["tonic", "supertonic", "mediant", "subdominant", "dominant", "submediant", "leading tone"];
const ROMAN_MAJOR = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

/** Degree, name, its note in C major and the triad built on it */
function degreeTable(): string {
  const tones = scaleFormula("major", "C4", { octave: false });
  const triads = diatonicTriads("C");
  return simpleTable(
    ["Degree", "Name", "In C major", "Triad", "Numeral"],
    tones.map((t, i) => [t.degree, DEGREE_NAMES[i], t.note, triads[i], ROMAN_MAJOR[i]]),
  );
}

const SHARP_KEYS = ["C", "G", "D", "A", "E", "B", "F#"];
const FLAT_KEYS = ["F", "Bb", "Eb", "Ab", "Db", "Gb"];

/** Each major key with its signature and its relative minor */
function signatureTable(): string {
  const rows = [...SHARP_KEYS, ...FLAT_KEYS].map(tonic => {
    const sig = keySignature(tonic);
    const n = Math.abs(sig.count);
    const what = sig.count === 0 ? "none" : `${n} ${sig.count > 0 ? "sharp" : "flat"}${n > 1 ? "s" : ""}`;
    return [
      `${prettyAcc(tonic)} major`,
      what,
      sig.notes.join(" ") || "–",
      prettyAcc(Key.majorKey(tonic).minorRelative) + " minor",
    ];
  });
  return simpleTable(["Key", "Signature", "Notes", "Relative minor"], rows);
}

const MINOR_TRIADS = diatonicTriads("A", true);

export const SCALES: ReferencePage = {
  id: "scales",
  title: "Major and minor scales",
  sections: [
    {
      id: "major",
      title: "The major scale",
      html: `
<p>A scale is a set of notes in order, from a starting note, the <b>tonic</b>, up to the same note an octave higher. The major scale has seven different notes. The steps between them follow a fixed pattern of whole steps (W, two half steps) and half steps (H, one half step):</p>
<p><b>W W H W W W H</b></p>
${scaleFigure("major", "major", "C4")}
<p>Starting on C, the pattern uses only white keys. Starting anywhere else, it needs one or more black keys. G major needs F♯: the step from E up to the seventh note has to be a whole step, and the step from there to G a half step. F major needs B♭ for a similar reason: the step from A up to the fourth note has to be a half step.</p>
${scaleFigures(scaleFigure("major", "major", "G4"), scaleFigure("major", "major", "F4"), scaleFigure("major", "major", "D4"))}
<p>Each letter appears once in a major scale. That is why the seventh note of G major is written F♯ and not G♭: the letter G is already taken by the tonic.</p>`,
    },
    {
      id: "degrees",
      title: "Scale degrees",
      html: `
<p>The notes of a scale are numbered from the tonic, 1 to 7, with 8 for the octave. Each degree also has a name:</p>
${degreeTable()}
<p>The seventh degree is called the leading tone because it is a half step below the tonic and tends to move up to it.</p>
<p>The triad column builds a chord on each degree from the scale's own notes, taking every other note. The pattern is the same in every major key: major triads on 1, 4 and 5, minor triads on 2, 3 and 6, and a diminished triad on 7. Chords built this way are the key's <b>diatonic</b> chords. Roman numerals name them by degree, in capitals for major and lower case for minor, so the same progression can be written once for any key: I–IV–V is C–F–G in C major and G–C–D in G major.</p>`,
    },
    {
      id: "signatures",
      title: "Key signatures",
      html: `
<p>Music in a major key mostly uses the notes of that key's scale. Rather than marking the same sharps or flats on every note, they are written once at the start of each line of music, as the <b>key signature</b>. Each major key has its own:</p>
${signatureTable()}
<p>Going up a fifth from one key to the next (C, G, D, A …) adds one sharp each time. Going down a fifth (C, F, B♭, E♭ …) adds one flat. Arranged this way the keys form the <b>circle of fifths</b>. The sharps and flats are always added in the same order, and the signature writes them in that order.</p>
<p>F♯ major and G♭ major use the same keys on the piano. They are the same scale written two ways, one with six sharps and one with six flats.</p>`,
    },
    {
      id: "minor",
      title: "The natural minor scale",
      html: `
<p>The natural minor scale has its own pattern of steps:</p>
<p><b>W H W W H W W</b></p>
${scaleFigure("minor", "natural minor", "A4")}
<p>Starting on A, it uses only white keys, the same notes as C major. Compared with the major scale on the same tonic, three notes are a half step lower: the third, the sixth and the seventh.</p>
${scaleFigures(scaleFigure("major", "major", "C4", { caption: "degrees" }), scaleFigure("minor", "natural minor", "C4", { caption: "degrees" }))}
<p>The lowered third is the same note that makes a minor chord minor, so the triad on the tonic of a minor scale is a minor triad.</p>`,
    },
    {
      id: "relative",
      title: "Relative and parallel keys",
      html: `
<p>Every major key shares its notes, and its key signature, with one minor key. The two are <b>relative</b> keys. The relative minor starts on the sixth degree of the major scale, three half steps below the major tonic: A minor is the relative minor of C major, E minor of G major, and D minor of F major.</p>
<p>Because relative keys have the same notes, they have the same diatonic chords, counted from a different tonic. In A minor they are ${MINOR_TRIADS.join(", ")}: minor triads on 1, 4 and 5, major triads on 3, 6 and 7, and a diminished triad on 2.</p>
<p>Keys that share a tonic instead, such as C major and C minor, are <b>parallel</b> keys. They have different notes and different key signatures: C major has none, and C minor has three flats, the signature of its relative major, E♭ major.</p>`,
    },
    {
      id: "harmonic-melodic",
      title: "Harmonic and melodic minor",
      html: `
<p>In the natural minor scale the seventh degree is a whole step below the tonic. Music in minor keys often raises it by a half step, so that it leads up to the tonic the way the seventh degree of a major scale does. This also makes the triad on the fifth degree major: G–B–D in C minor, instead of G–B♭–D.</p>
<p>The natural minor scale with its seventh raised is the <b>harmonic minor</b> scale:</p>
${scaleFigure("harmonic minor", "harmonic minor", "C4")}
<p>Raising the seventh leaves a gap of three half steps between the sixth and seventh degrees (A♭ to B in C minor). The <b>melodic minor</b> scale raises the sixth as well, which closes the gap:</p>
${scaleFigure("melodic minor", "melodic minor", "C4")}
<p>In classical music the melodic minor scale raises the sixth and seventh on the way up only, and comes down as natural minor. In jazz the raised form is used in both directions, and that is what "melodic minor" usually means there.</p>`,
    },
    {
      id: "summary",
      title: "Summary",
      html: `
<p>The four scales on this page, on C. The formula numbers each note by its distance from the tonic in steps of the major scale, with ♭ where the note is a half step lower than the major scale's.</p>
${scaleTable(
  [
    { type: "major", name: "major" },
    { type: "minor", name: "natural minor" },
    { type: "harmonic minor", name: "harmonic minor" },
    { type: "melodic minor", name: "melodic minor" },
  ],
  { keys: true },
)}`,
    },
  ],
};
