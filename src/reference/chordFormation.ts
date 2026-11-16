// Reference page: chord forms, how each chord type is built. Prose with keyboard diagrams; every diagram, note list
// and formula is worked out from the chord templates (chordFormula), not typed in, so it can't disagree with the app.
import { chordDegrees, chordFormula, chordNotes, type FormulaTone } from "../theory/chordFormula";
import { templateById } from "../theory/chords";
import { prettyAcc } from "../theory/spelling";
import { esc } from "../views/html";
import { pianoSvg, type MarkedKey } from "../views/piano";
import type { ReferencePage } from "./pages";

const C4 = 60;

/** "Cm7♭5" */
const symbolOf = (id: string) => `C${prettyAcc(templateById(id)?.symbol ?? id)}`;
const nameOf = (id: string) => templateById(id)?.name ?? id;

/** Draws from C4 to the C at or above the highest note, so every figure starts in the same place */
const highFor = (tones: readonly { midi: number }[]) =>
  C4 + 12 * Math.max(1, Math.ceil((Math.max(...tones.map(t => t.midi)) - C4 + 1) / 12));

const keysOf = (tones: readonly FormulaTone[]): MarkedKey[] =>
  tones.map((t, i) => ({ midi: t.midi, label: t.note, caption: t.degree, role: i === 0 ? "root" : "tone" }));

/** A chord on C as a captioned keyboard: "Cm7 (minor seventh): C–E♭–G–B♭, 1 ♭3 5 ♭7" */
function chordFigure(id: string): string {
  const tones = chordFormula(id);
  const svg = pianoSvg({
    low: C4,
    high: highFor(tones),
    keys: keysOf(tones),
    label: `${symbolOf(id)}, ${nameOf(id)}: ${chordNotes(tones)}`,
  });
  return (
    `<figure class="refFigure">${svg}<figcaption><b>${esc(symbolOf(id))}</b> ${esc(nameOf(id))}: ` +
    `${esc(chordNotes(tones))}</figcaption></figure>`
  );
}

/** Several chords side by side (they wrap on a narrow screen) */
const figures = (...ids: string[]) => `<div class="refFigures">${ids.map(chordFigure).join("")}</div>`;

/** A table row per chord type: symbol, name, formula, half steps above the root, notes on C */
function chordTable(ids: readonly string[], { formula = true } = {}): string {
  const rows = ids
    .map(id => {
      const tones = chordFormula(id);
      return (
        `<tr><td class="sym">${esc(symbolOf(id))}</td><td>${esc(nameOf(id))}</td>` +
        (formula ? `<td>${esc(chordDegrees(tones))}</td>` : "") +
        `<td>${tones.map(t => t.semitones).join(", ")}</td><td>${esc(chordNotes(tones))}</td></tr>`
      );
    })
    .join("");
  return (
    `<div class="refTableWrap"><table class="refTable"><thead><tr><th>Symbol</th><th>Name</th>` +
    (formula ? `<th>Formula</th>` : "") +
    `<th>Half steps</th><th>On C</th></tr></thead><tbody>${rows}</tbody></table></div>`
  );
}

/** Two thirds stacked, drawn with the distance between neighbouring notes under the upper one */
function stackedFigure(id: string): string {
  const tones = chordFormula(id);
  const keys: MarkedKey[] = tones.map((t, i) => ({
    midi: t.midi,
    label: t.note,
    caption: i === 0 ? "" : `+${t.semitones - tones[i - 1].semitones}`,
    role: i === 0 ? "root" : "tone",
  }));
  const steps = tones.slice(1).map((t, i) => t.semitones - tones[i].semitones);
  return (
    `<figure class="refFigure">${pianoSvg({ low: C4, high: C4 + 12, keys, label: `${symbolOf(id)}: ${chordNotes(tones)}` })}` +
    `<figcaption><b>${esc(symbolOf(id))}</b> ${esc(nameOf(id))}: ${esc(chordNotes(tones))}, ` +
    `${steps.join(" + ")} half steps</figcaption></figure>`
  );
}

/** C major in root position and its two inversions: same notes, a different one at the bottom */
function inversionFigures(): string {
  const [c, e, g] = chordFormula("M");
  const voicings: { name: string; symbol: string; notes: { midi: number; note: string; role: MarkedKey["role"] }[] }[] =
    [
      {
        name: "Root position",
        symbol: "C",
        notes: [c, e, g].map((t, i) => ({ ...t, role: i === 0 ? "root" : "tone" })),
      },
      {
        name: "First inversion",
        symbol: "C/E",
        notes: [
          { ...e, role: "tone" },
          { ...g, role: "tone" },
          { ...c, midi: c.midi + 12, role: "root" },
        ],
      },
      {
        name: "Second inversion",
        symbol: "C/G",
        notes: [
          { ...g, role: "tone" },
          { ...c, midi: c.midi + 12, role: "root" },
          { ...e, midi: e.midi + 12, role: "tone" },
        ],
      },
    ];
  return (
    `<div class="refFigures">` +
    voicings
      .map(v => {
        const svg = pianoSvg({
          low: C4,
          high: C4 + 17, // to F5: room for the highest note, E5, and no more
          keys: v.notes.map((n, i) => ({ midi: n.midi, label: n.note, role: n.role, caption: i === 0 ? "bass" : "" })),
          label: `${v.name}, ${v.symbol}: ${v.notes.map(n => n.note).join(", ")} from the bottom`,
        });
        return `<figure class="refFigure">${svg}<figcaption><b>${esc(v.symbol)}</b> ${esc(v.name.toLowerCase())}: ${esc(v.notes.map(n => n.note).join("–"))}</figcaption></figure>`;
      })
      .join("") +
    `</div>`
  );
}

export const CHORD_FORMATION: ReferencePage = {
  id: "chords",
  title: "Chord forms",
  sections: [
    {
      id: "triads",
      title: "Triads",
      html: `
<p>The simplest chord is the <b>triad</b>: a root, the note a third above it, and the note a third above that. The three notes are called the root, the third and the fifth, after their distance from the root.</p>
<p>Thirds come in two sizes. A <b>major third</b> is four half steps and a <b>minor third</b> is three. A triad has two thirds stacked, and there are four ways to choose their sizes:</p>
<div class="refFigures">${stackedFigure("M")}${stackedFigure("m")}${stackedFigure("dim")}${stackedFigure("aug")}</div>
${chordTable(["M", "m", "dim", "aug"])}
<p>Major and minor triads both span a perfect fifth, seven half steps. They differ only in the third: four half steps up for major, three for minor. The third is the note that decides whether a chord sounds major or minor.</p>
<p>A <b>diminished</b> triad is two minor thirds, so its fifth is a half step smaller than perfect (six half steps). An <b>augmented</b> triad is two major thirds, so its fifth is a half step larger (eight half steps).</p>
<p>The augmented triad divides the octave into three equal parts of four half steps each. Because of that, C augmented, E augmented and G♯ augmented use the same three keys.</p>
<p>Chord symbols write major as the letter alone (C), minor with an m (Cm), and the other two as Cdim and Caug. You will also see C° for diminished and C+ for augmented.</p>`,
    },
    {
      id: "suspended",
      title: "Suspended chords",
      html: `
<p>A <b>suspended</b> chord replaces the third with a second or a fourth. Csus2 is C–D–G and Csus4 is C–F–G. With no third, the chord is neither major nor minor.</p>
${figures("sus2", "sus4")}
<p>The name comes from older harmony, where a note from the previous chord was held over (suspended) into the next one before dropping to the third. In a lot of music now the sus chord is used on its own, without resolving.</p>`,
    },
    {
      id: "sevenths",
      title: "Seventh chords",
      html: `
<p>Adding one more third on top of a triad gives a <b>seventh chord</b>, named after the new note's interval above the root. The seventh is either <b>major</b>, eleven half steps (one half step below the octave), or <b>minor</b>, ten half steps.</p>
<p>Putting a major or minor seventh on top of the different triads gives the common seventh chords:</p>
${figures("maj7", "7", "m7", "m7b5", "dim7", "mMaj7")}
${chordTable(["maj7", "7", "m7", "m7b5", "dim7", "mMaj7"])}
<p>A few things about the names:</p>
<ul>
<li><b>C7</b> on its own means a major triad with a minor seventh. It is called the <b>dominant</b> seventh because it occurs naturally on the fifth note of a major scale, which is called the dominant: in C major, G–B–D–F is G7.</li>
<li>The "maj" in <b>Cmaj7</b> refers to the seventh. The triad is major as well, but the symbol only needs to say so for the seventh, since a plain C is already major.</li>
<li>The "m" in <b>Cm7</b> refers to the third: a minor triad with a minor seventh. Keeping the triad minor and making the seventh major gives <b>Cm(maj7)</b>.</li>
<li><b>Cm7♭5</b> is a diminished triad with a minor seventh. It is also called half-diminished and written Cø.</li>
<li><b>Cdim7</b> is a diminished triad with a diminished seventh, nine half steps above the root. It is three minor thirds stacked, and like the augmented triad it divides the octave evenly, into four parts. There are only three different diminished seventh chords as a result.</li>
</ul>`,
    },
    {
      id: "sixths",
      title: "Sixth chords",
      html: `
<p>A <b>sixth chord</b> adds the major sixth, nine half steps above the root, to a triad instead of a seventh. C6 is C–E–G–A, and Cm6 is C–E♭–G–A. The sixth is major in both.</p>
${figures("6", "m6")}
<p>C6 has the same notes as Am7 (A–C–E–G). Which name fits depends on which note is in the bass and on the chords around it.</p>`,
    },
    {
      id: "ninths",
      title: "Ninth chords and added notes",
      html: `
<p>Stacking thirds past the seventh gives the <b>ninth</b>, fourteen half steps above the root. It is the same note as the second, an octave higher. A ninth chord includes the seventh: C9 is C–E–G–B♭–D.</p>
${figures("9", "maj9", "m9")}
<p>A triad with the ninth and no seventh is written with <b>add</b>: Cadd9 is C–E–G–D. Without "add", a 9 in a chord symbol means the seventh is there too.</p>
${figures("add9", "madd9")}
${chordTable(["add9", "madd9", "9", "maj9", "m9"])}
<p>The same process continues to the eleventh (the fourth, an octave up) and the thirteenth (the sixth, an octave up). After the thirteenth the next third is the root again, two octaves up.</p>
<p>Larger chords often leave out the fifth when they are played. It adds little to the chord's sound, and five or more notes are a lot for one hand. The third and the seventh are the notes that matter most, since they decide the chord's quality.</p>`,
    },
    {
      id: "inversions",
      title: "Inversions",
      html: `
<p>The notes of a chord can be played in any order and in any octave, and it is still the same chord. What changes is the <b>inversion</b>, which depends only on the lowest note.</p>
${inversionFigures()}
<p>With the root at the bottom, the chord is in <b>root position</b>. With the third at the bottom it is in <b>first inversion</b>, and with the fifth at the bottom, <b>second inversion</b>. A seventh chord also has a <b>third inversion</b>, with the seventh at the bottom.</p>
<p>An inversion is often written as a slash chord: the chord, then the bass note. C/E is C major with E in the bass. The same notation is used for a bass note that isn't in the chord at all, such as C/D.</p>
<p>Inversions are mostly useful for moving between chords with small movements of the hand. C to F in root position means moving every finger; C to F/C keeps the C where it is and moves the other two notes up by a step or a half step.</p>`,
    },
    {
      id: "summary",
      title: "Summary",
      html: `
<p>Every chord type on this page, with its formula and its notes on C. The formula numbers each note by its distance from the root in steps of the major scale, with ♭ or ♯ where the note is lower or higher than the major scale's.</p>
${chordTable(["M", "m", "dim", "aug", "sus2", "sus4", "6", "m6", "maj7", "7", "m7", "m7b5", "dim7", "mMaj7", "add9", "madd9", "9", "maj9", "m9"])}`,
    },
  ],
};
