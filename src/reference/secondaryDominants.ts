// Reference page: secondary dominants. A table of every major key's chords that can have one (ii, iii, IV, V, vi);
// clicking a chord shows its secondary dominant in the cell, and under its row its notes, the note it borrows from
// outside the key, and both chords on keyboards (built when clicked, by `detail`). Worked out from tonal's key data
// and the chord templates, not typed in.
import { Key, Note } from "tonal";
import { chordFormula, chordNotes } from "../theory/chordFormula";
import { prettyAcc } from "../theory/spelling";
import { esc } from "../views/html";
import { pianoSvg } from "../views/piano";
import type { ReferencePage } from "./pages";

/** Major keys round the circle of fifths: sharps, then flats (as on the diatonic chords page) */
const KEYS = ["C", "G", "D", "A", "E", "B", "F#", "F", "Bb", "Eb", "Ab", "Db", "Gb"];

/** The chords that can have a secondary dominant: every diatonic chord but I (its dominant is V itself) and vii° (a
 *  diminished chord can't sound like a home to resolve to) */
const TARGETS: readonly { degree: number; numeral: string }[] = [
  { degree: 1, numeral: "ii" },
  { degree: 2, numeral: "iii" },
  { degree: 3, numeral: "IV" },
  { degree: 4, numeral: "V" },
  { degree: 5, numeral: "vi" },
];

interface Secondary {
  key: string;
  numeral: string;
  /** The chord resolved to, e.g. "Dm", its root ("D") and template id ("m") */
  target: string;
  targetRoot: string;
  targetType: string;
  /** Its secondary dominant: the dominant seventh a fifth above, e.g. "A7", rooted on "A" */
  dominant: string;
  dominantRoot: string;
}

/** The secondary dominant of the chord on `degree` (0 is I) of a major key */
function secondaryOf(key: string, degree: number, numeral: string): Secondary {
  const k = Key.majorKey(key);
  const targetRoot = k.scale[degree];
  const triad = k.triads[degree];
  const targetType = triad.endsWith("m") ? "m" : "M";
  const dominantRoot = Note.pitchClass(Note.transpose(targetRoot, "5P"));
  return {
    key,
    numeral,
    target: prettyAcc(triad),
    targetRoot,
    targetType,
    dominant: `${prettyAcc(dominantRoot)}7`,
    dominantRoot,
  };
}

const cellId = (key: string, numeral: string) => `${key}/${numeral}`;

/** The table: a row per key (tagged for the key picker), a cell per chord, each revealing its secondary dominant */
function dominantTable(): string {
  const head = `<tr><th>Key</th>${TARGETS.map(t => `<th>${esc(t.numeral)}<span class="refSub">V7/${esc(t.numeral)}</span></th>`).join("")}</tr>`;
  const rows = KEYS.map(key => {
    const cells = TARGETS.map(t => {
      const s = secondaryOf(key, t.degree, t.numeral);
      return (
        `<td class="refCell" data-detail="${esc(cellId(key, t.numeral))}" tabindex="0" role="button" ` +
        `aria-label="${esc(`${s.target}: show its secondary dominant`)}">` +
        `<span class="refCellMain">${esc(s.target)}</span><span class="refCellReveal">from ${esc(s.dominant)}</span></td>`
      );
    }).join("");
    return `<tr data-key="${esc(key)}"><td class="sym">${esc(prettyAcc(key))}</td>${cells}</tr>`;
  }).join("");
  return (
    `<div class="refTableWrap"><table class="refTable refCells"><caption>Major keys</caption><thead>${head}</thead>` +
    `<tbody>${rows}</tbody></table></div>`
  );
}

/** A chord as tones from a root note with octave ("A3") */
const tonesOf = (type: string, root: string) => chordFormula(type, root);

/** The dominant from its root in octave 3, and the chord it leads to a fourth above (where it resolves) */
function pairTones(dominantRoot: string, targetType: string, targetRoot: string) {
  const dominant = tonesOf("7", `${dominantRoot}3`);
  const up = Note.transpose(`${dominantRoot}3`, "4P");
  // The target's root, spelled as in the key, in the octave a fourth above the dominant's root
  const target = tonesOf(targetType, `${targetRoot}${Note.octave(up)}`);
  return { dominant, target };
}

/** Keyboards for chords side by side, all over the same keys so they line up */
function chordKeys(chords: readonly { tones: ReturnType<typeof tonesOf>; title: string }[]): string {
  const midis = chords.flatMap(c => c.tones.map(t => t.midi));
  // From the white key below the lowest note to the white key above the highest: just the keys that matter
  const black = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
  let low = Math.min(...midis) - 1,
    high = Math.max(...midis) + 1;
  while (black(low)) low--;
  while (black(high)) high++;
  return (
    `<div class="refFigures">` +
    chords
      .map(
        c =>
          `<figure class="refFigure">${pianoSvg({
            low,
            high,
            keys: c.tones.map((t, i) => ({ midi: t.midi, label: t.note, role: i === 0 ? "root" : "tone" })),
            label: `${c.title}: ${chordNotes(c.tones)}`,
          })}<figcaption><b>${esc(c.title)}</b>: ${esc(chordNotes(c.tones))}</figcaption></figure>`,
      )
      .join("") +
    `</div>`
  );
}

/** What a clicked cell shows below the table: the dominant, the note it borrows, and both chords */
function detail(id: string): string {
  const [key, numeral] = id.split("/");
  const t = TARGETS.find(x => x.numeral === numeral);
  if (!t || !KEYS.includes(key)) return "";
  const s = secondaryOf(key, t.degree, numeral);
  const scale = new Set(Key.majorKey(key).scale.map(prettyAcc));
  const { dominant: tones, target } = pairTones(s.dominantRoot, s.targetType, s.targetRoot);
  const outside = tones.filter(x => !scale.has(x.note)).map(x => x.note);
  const keyName = `${prettyAcc(key)} major`;
  const borrowed = outside.length
    ? `${outside.join(" and ")} ${outside.length > 1 ? "are" : "is"} not in ${keyName}. ` +
      (tones[1] && outside.includes(tones[1].note)
        ? `${tones[1].note} is a half step below ${prettyAcc(s.targetRoot)}, and leads up to it.`
        : `It pulls towards ${s.target}.`)
    : `All its notes are in ${keyName}: it is the key's own V7.`;
  return (
    `<p><b>V7/${esc(numeral)} in ${esc(keyName)}</b>: ${esc(s.dominant)} (${esc(chordNotes(tones))}) resolves to ` +
    `${esc(s.target)}. ${esc(borrowed)}</p>` +
    chordKeys([
      { tones, title: s.dominant },
      { tones: target, title: s.target },
    ])
  );
}

/** The key picker, as on the diatonic chords page */
const keyPicker = () =>
  `<label class="pick refKeyPick">Key <select data-key-pick><option value="">All keys</option>` +
  KEYS.map(k => `<option value="${k}">${prettyAcc(k)} major</option>`).join("") +
  `</select></label>`;

const c = (degree: number, numeral: string) => secondaryOf("C", degree, numeral);

export const SECONDARY_DOMINANTS: ReferencePage = {
  id: "secondary",
  title: "Secondary dominants",
  intro: keyPicker(),
  detail,
  sections: [
    {
      id: "what",
      title: "What a secondary dominant is",
      html: `
<p>In a major key, the chord on the fifth degree, V, leads back to I. Played as a dominant seventh (V7) it pulls even more strongly: in C major, G7 resolves to C.</p>
<p>Any major or minor chord in the key can be given a dominant of its own in the same way: the dominant seventh chord a fifth above it. This is a <b>secondary dominant</b>, written V7 of the chord it leads to. In C major, the V of V is ${c(4, "V").dominant}, which resolves to ${c(4, "V").target}; it is written V7/V and read "five seven of five".</p>
${(() => {
  const { dominant, target } = pairTones("D", "M", "G");
  return chordKeys([
    { tones: dominant, title: "D7" },
    { tones: target, title: "G" },
  ]);
})()}
<p>D7 has F♯, which isn't in C major. F♯ is a half step below G, so it leads up to G the way B leads up to C in G7. Most secondary dominants borrow a note like this from outside the key, which is what makes them sound like a short move towards another key.</p>`,
    },
    {
      id: "table",
      title: "Secondary dominants in every key",
      html: `
<p>Each cell is one of the key's chords. Click it to show its secondary dominant, with its notes and both chords on a keyboard just below that row. Click it again to hide it.</p>
${dominantTable()}`,
    },
    {
      id: "using",
      title: "Using them",
      html: `
<p>A secondary dominant usually comes just before the chord it leads to, in place of a chord from the key. In C major, C–Am–Dm–G7 can become C–${c(1, "ii").dominant}–Dm–G7 (V7/ii on the way to ii), or C–${c(5, "vi").dominant}–Am (V7/vi on the way to vi).</p>
<p>The most common are V7/V, V7/vi and V7/IV. V7/IV is the tonic chord with a minor seventh added (C7 in C major), so it needs no new root, only a B♭.</p>
<p>They are often played as plain major triads instead of seventh chords (D instead of D7). For all but V7/IV the note from outside the key is the chord's third, so the triad keeps it. V7/IV needs its seventh: without the B♭, C7 is only C, the key's own I.</p>`,
    },
  ],
};
