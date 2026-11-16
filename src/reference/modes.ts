// Reference page: the modes of the major scale. Prose with keyboard diagrams; every mode, its notes, how it differs from
// major or minor, its parent key and its seventh chord are worked out from tonal's scale data (scaleFormula).
import { Note } from "tonal";
import { scaleFormula, scaleNotes } from "../theory/scaleFormula";
import { templateById } from "../theory/chords";
import { prettyAcc } from "../theory/spelling";
import type { ReferencePage } from "./pages";
import { scaleFigure, scaleFigures, scaleTable, simpleTable } from "./scaleFigures";

interface ModeInfo {
  /** tonal's scale name */
  type: string;
  name: string;
  /** The degree of the major scale it starts on */
  degree: number;
}

/** In major-scale order: Ionian on the 1st degree, Dorian on the 2nd … */
const MODES: readonly ModeInfo[] = [
  { type: "ionian", name: "Ionian", degree: 1 },
  { type: "dorian", name: "Dorian", degree: 2 },
  { type: "phrygian", name: "Phrygian", degree: 3 },
  { type: "lydian", name: "Lydian", degree: 4 },
  { type: "mixolydian", name: "Mixolydian", degree: 5 },
  { type: "aeolian", name: "Aeolian", degree: 6 },
  { type: "locrian", name: "Locrian", degree: 7 },
];
const mode = (type: string) => MODES.find(m => m.type === type)!;

/** From the most raised notes to the most lowered: each differs from the one before it by one note */
const BRIGHTNESS = ["lydian", "ionian", "mixolydian", "dorian", "aeolian", "phrygian", "locrian"].map(mode);

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

/** The major key whose notes a mode on `root` uses: C Dorian uses B♭ major's */
function parentKey(m: ModeInfo, root: string): string {
  const interval = scaleFormula("major", "C4")[m.degree - 1].interval;
  return prettyAcc(Note.pitchClass(Note.transpose(root, `-${interval}`)));
}

/** The degrees of a mode on C that differ from another scale's ("♯4", "♭2 ♭5") */
function differences(type: string, from: string): string {
  const mine = scaleFormula(type, "C4", { octave: false }).map(t => t.degree);
  const theirs = new Set(scaleFormula(from, "C4", { octave: false }).map(t => t.degree));
  return mine.filter(d => !theirs.has(d)).join(" ");
}

/** The seventh chord on a mode's tonic, from its 1st, 3rd, 5th and 7th degrees: "Cm7" */
function seventhChord(type: string): string {
  const t = scaleFormula(type, "C4", { octave: false });
  const shape = [t[2], t[4], t[6]].map(x => x.semitones).join(",");
  const id = { "4,7,11": "maj7", "3,7,10": "m7", "4,7,10": "7", "3,6,10": "m7b5" }[shape];
  return id ? `C${prettyAcc(templateById(id)?.symbol ?? id)}` : "?";
}

/** The white keys from each note: the seven modes of C major */
function whiteKeyTable(): string {
  return scaleTable(
    MODES.map(m => ({
      type: m.type,
      name: m.name,
      root: `${scaleFormula("major", "C4")[m.degree - 1].note}4`,
      extra: [`${ORDINAL[m.degree - 1]} degree`],
    })),
    { keys: true, extra: ["Starts on"], first: "Mode" },
  );
}

/** Each mode beside the major or natural minor scale with the same third, and the notes that differ */
function characterTable(): string {
  return simpleTable(
    ["Mode", "Compared with", "Different notes"],
    BRIGHTNESS.filter(m => m.type !== "ionian" && m.type !== "aeolian").map(m => {
      const major = scaleFormula(m.type, "C4")[2].semitones === 4;
      const from = major ? "major" : "minor";
      return [m.name, major ? "major" : "natural minor", differences(m.type, from)];
    }),
  );
}

export const MODES_PAGE: ReferencePage = {
  id: "modes",
  title: "Modes",
  sections: [
    {
      id: "modes",
      title: "The modes of the major scale",
      html: `
<p>Playing the notes of a major scale from a different starting note gives a different pattern of steps. The white keys from D to D use the notes of C major, but follow the pattern W H W W W H W instead of the major scale's W W H W W W H. Each of the seven starting points gives a <b>mode</b>, and the modes have Greek names:</p>
${whiteKeyTable()}
<p>Ionian is the major scale itself, and Aeolian is the natural minor scale. The other five are known only by their mode names.</p>`,
    },
    {
      id: "same-root",
      title: "Modes on the same tonic",
      html: `
<p>Modes are easier to compare on one tonic. On C, each mode is the C major scale with some notes lowered or raised. In this order, from the most raised to the most lowered, each mode differs from the one before it by a single note:</p>
${scaleFigures(...BRIGHTNESS.map(m => scaleFigure(m.type, m.name, "C4", { caption: "degrees" })))}
<p>The order follows the circle of fifths. C Lydian has the notes of ${parentKey(mode("lydian"), "C")} major (one sharp), C Ionian those of C major, C Mixolydian those of ${parentKey(mode("mixolydian"), "C")} major (one flat), and so on to C Locrian, which has the notes of ${parentKey(mode("locrian"), "C")} major (five flats).</p>`,
    },
    {
      id: "character",
      title: "Major and minor modes",
      html: `
<p>As with chords, the third decides whether a mode sounds major or minor. Lydian, Ionian and Mixolydian have a major third. Dorian, Aeolian and Phrygian have a minor third. Locrian has a minor third and a diminished fifth, so the triad on its tonic is diminished.</p>
<p>A mode is usually described by how it differs from the major or natural minor scale with the same third:</p>
${characterTable()}
<p>Dorian's 6 is the major sixth, a half step above the natural minor scale's ♭6.</p>
<p>Mixolydian is common in rock and folk music, and Dorian in jazz and folk. Phrygian appears in flamenco and metal. Lydian is used less often, and Locrian rarely, since its tonic chord is diminished.</p>`,
    },
    {
      id: "any-key",
      title: "Finding a mode in any key",
      html: `
<p>There are two ways to work out a mode on a given tonic.</p>
<p><b>From the parent major scale.</b> Each mode starts on a fixed degree of a major scale: Dorian on the 2nd, Mixolydian on the 5th, and so on. To find A Mixolydian, find the major scale with A as its 5th degree, which is ${parentKey(mode("mixolydian"), "A")} major, and play its notes from A: ${scaleNotes(scaleFormula("mixolydian", "A4"))}.</p>
<p><b>From the tonic's own major scale.</b> Take the major scale on the tonic and change the notes the mode changes. A major is ${scaleNotes(scaleFormula("major", "A4"))}. Mixolydian lowers the 7th, which gives ${scaleNotes(scaleFormula("mixolydian", "A4"))}.</p>
${scaleFigures(scaleFigure("mixolydian", "Mixolydian", "A4", { note: `the notes of ${parentKey(mode("mixolydian"), "A")} major` }), scaleFigure("dorian", "Dorian", "F4", { note: `the notes of ${parentKey(mode("dorian"), "F")} major` }))}`,
    },
    {
      id: "chords",
      title: "Modes and chords",
      html: `
<p>Stacking thirds on the tonic of each mode, from the mode's own notes, gives a seventh chord:</p>
${simpleTable(
  ["Mode", "Seventh chord on C"],
  MODES.map(m => [m.name, seventhChord(m.type)]),
)}
<p>This is one way modes are used in jazz. Every note of the chord is in the mode, so a mode can be chosen to fit a chord: D Dorian over Dm7, G Mixolydian over G7, C Ionian or C Lydian over Cmaj7. In C major these three chords are ii, V and I, and D Dorian, G Mixolydian and C Ionian all use the notes of C major.</p>`,
    },
    {
      id: "summary",
      title: "Summary",
      html: `
<p>The seven modes on C, from the most raised to the most lowered, with the major key whose notes each one uses.</p>
${scaleTable(
  BRIGHTNESS.map(m => ({ type: m.type, name: m.name, extra: [`${parentKey(m, "C")} major`] })),
  { keys: true, extra: ["Notes of"], first: "Mode" },
)}`,
    },
  ],
};
