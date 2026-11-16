// Reference page: the diatonic chords of every key, as tables (a row per key, a column per degree). The chords are
// worked out from tonal's key data, not typed in; only the symbols are put in the app's own spelling.
import { Key } from "tonal";
import { prettyAcc } from "../theory/spelling";
import type { ReferencePage } from "./pages";
import { simpleTable } from "./scaleFigures";

/** Major keys round the circle of fifths: sharps, then flats */
const MAJOR_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "F", "Bb", "Eb", "Ab", "Db", "Gb"];
/** Their relative minors, in the same order */
const MINOR_KEYS = MAJOR_KEYS.map(k => Key.majorKey(k).minorRelative);

/** A tonal chord symbol in the app's spelling: "AmMaj7" is "Am(maj7)", "C+maj7" is "Cmaj7♯5", "G#o7" is "G♯dim7" */
export function chordSymbol(symbol: string): string {
  const m = /^([A-G][#b]*)(.*)$/.exec(symbol);
  if (!m) return symbol;
  const quality = m[2]
    .replace(/^mMaj7$/, "m(maj7)")
    .replace(/^\+maj7$/, "maj7♯5")
    .replace(/^o7$/, "dim7")
    .replace(/b5/, "♭5");
  return prettyAcc(m[1]) + quality;
}

const keyName = (tonic: string, minor: boolean) => `${prettyAcc(tonic)} ${minor ? "minor" : "major"}`;

/** A row per key: its name, then the chord on each degree */
const keyTable = (numerals: readonly string[], rows: readonly { key: string; chords: readonly string[] }[]) =>
  simpleTable(
    ["Key", ...numerals],
    rows.map(r => [r.key, ...r.chords.map(chordSymbol)]),
  );

const majorTable = (sevenths: boolean) =>
  keyTable(
    sevenths ? ["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"] : ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
    MAJOR_KEYS.map(k => ({
      key: keyName(k, false),
      chords: sevenths ? Key.majorKey(k).chords : Key.majorKey(k).triads,
    })),
  );

const minorTable = (scale: "natural" | "harmonic", sevenths: boolean) => {
  const numerals =
    scale === "natural"
      ? sevenths
        ? ["i7", "iiø7", "IIImaj7", "iv7", "v7", "VImaj7", "VII7"]
        : ["i", "ii°", "III", "iv", "v", "VI", "VII"]
      : ["i", "ii°", "III+", "iv", "V", "VI", "vii°"];
  return keyTable(
    numerals,
    MINOR_KEYS.map(k => {
      const key = Key.minorKey(k)[scale];
      return { key: keyName(k, true), chords: sevenths ? key.chords : key.triads };
    }),
  );
};

export const DIATONIC_CHORDS: ReferencePage = {
  id: "diatonic",
  title: "Diatonic chords",
  sections: [
    {
      id: "major-triads",
      title: "Major keys",
      html: `
<p>The diatonic chords of a key are the chords built from its scale, one on each degree, taking every other note of the scale. In every major key they follow the same pattern: major triads on I, IV and V, minor triads on ii, iii and vi, and a diminished triad on vii°.</p>
${majorTable(false)}`,
    },
    {
      id: "major-sevenths",
      title: "Seventh chords in major keys",
      html: `
<p>Adding the next note of the scale on top of each triad gives a seventh chord on each degree. The major triads on I and IV become major sevenths, the one on V a dominant seventh, the minor triads minor sevenths, and the diminished triad on vii a half-diminished seventh.</p>
${majorTable(true)}`,
    },
    {
      id: "minor-triads",
      title: "Minor keys",
      html: `
<p>A natural minor key has the same notes as its relative major, so it has the same chords, starting from a different degree: minor triads on i, iv and v, major triads on III, VI and VII, and a diminished triad on ii°.</p>
${minorTable("natural", false)}`,
    },
    {
      id: "minor-sevenths",
      title: "Seventh chords in minor keys",
      html: `
<p>The seventh chords of a natural minor key, which are those of its relative major in a different order:</p>
${minorTable("natural", true)}`,
    },
    {
      id: "harmonic-minor",
      title: "Harmonic minor",
      html: `
<p>Music in minor keys often raises the seventh degree, which gives the harmonic minor scale. That changes three of the chords: the triad on V becomes major, the one on vii becomes diminished (built on the raised seventh), and the one on III becomes augmented. The major V, and the dominant seventh V7 built on it, are the chords most often taken from harmonic minor; the augmented III is rare.</p>
${minorTable("harmonic", false)}`,
    },
  ],
};
