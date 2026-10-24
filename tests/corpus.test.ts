// The sight-reading importer: reading MuseScore scores (versions 2 and 3), cutting excerpts and measuring them; and
// the shared excerpt helpers: steps, levels, durations.
import { describe, expect, it } from "vitest";
import {
  asMelody, cutExcerpts, cutPianoExcerpts, excerptRanges, measure, phrases, restsFor,
} from "../scripts/corpus/excerpts";
import { readMscx } from "../scripts/corpus/mscx";
import { parseXml } from "../scripts/corpus/xml";
import {
  eventLength, excerptSteps, ledgerLines, PIANO_LEVELS, READING_LEVELS, readingLevel, tpcName,
  type ExcerptEvent, type ExcerptFeatures, type ExcerptStaff,
} from "../src/exercises/excerpts";

/** A version 3 score: a voice part (staff 1) and a piano (staves 2 and 3), with these bars of each */
const v3 = (voice: string[], clef = "", rh: string[] = [], lh: string[] = []) => `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02"><Score>
  <Part><Staff id="1">${clef}</Staff><trackName>Voice</trackName><Instrument><instrumentId>voice.vocals</instrumentId></Instrument></Part>
  <Part><Staff id="2"/><Staff id="3"/><trackName>Piano</trackName>
    <Instrument><instrumentId>keyboard.piano</instrumentId><clef staff="2">F</clef></Instrument></Part>
  <Staff id="1"><VBox><Text><style>Title</style><text>A &amp; B</text></Text></VBox>
    ${voice.map(b => `<Measure><voice>${b}</voice></Measure>`).join("\n")}
  </Staff>
  <Staff id="2">${rh.map(b => `<Measure>${b.startsWith("<voice>") ? b : `<voice>${b}</voice>`}</Measure>`).join("")}</Staff>
  <Staff id="3">${lh.map(b => `<Measure>${b.startsWith("<voice>") ? b : `<voice>${b}</voice>`}</Measure>`).join("")}</Staff>
</Score></museScore>`;
const note = (type: string, pitch: number, tpc: number, extra = "", noteExtra = "") =>
  `<Chord>${extra}<durationType>${type}</durationType><Note>${noteExtra}<pitch>${pitch}</pitch><tpc>${tpc}</tpc></Note></Chord>`;
const chord = (type: string, notes: [number, number][], extra = "") =>
  `<Chord>${extra}<durationType>${type}</durationType>${notes.map(([p, s]) => `<Note><pitch>${p}</pitch><tpc>${s}</tpc></Note>`).join("")}</Chord>`;
const rest = (type: string) => `<Rest><durationType>${type}</durationType></Rest>`;
const START = "<KeySig><accidental>1</accidental></KeySig><TimeSig><sigN>3</sigN><sigD>4</sigD></TimeSig>";
const TIE = '<Spanner type="Tie"><Tie/><next><location><fractions>1/4</fractions></location></next></Spanner>';
const n = (p: number, s: number, tie?: 1) => tie ? [{ p, s, tie }] : [{ p, s }];

describe("parseXml", () => {
  it("reads elements, attributes and text, decoding entities and skipping comments", () => {
    const doc = parseXml('<?xml version="1.0"?><!-- hi --><a x="1"><b>t &lt;3</b><c/></a>');
    const a = doc.children[0];
    expect(a).toMatchObject({ name: "a", attrs: { x: "1" } });
    expect(a.children.map(c => [c.name, c.text])).toEqual([["b", "t <3"], ["c", ""]]);
  });

  it("refuses mismatched tags", () => {
    expect(() => parseXml("<a><b></a>")).toThrow();
  });
});

describe("readMscx", () => {
  it("reads the voice part's bars: key, time, notes with spelling, rests, dots and ties", () => {
    const song = readMscx(v3([
      START + note("quarter", 67, 15, "<dots>1</dots>") + note("eighth", 66, 20) + note("quarter", 64, 18, "", TIE),
      note("quarter", 64, 18) + rest("quarter") + note("quarter", 62, 16),
    ]), "123")!;
    expect(song.title).toBe("A & B");
    const bars = song.voice!;
    expect(bars[0]).toMatchObject({ key: 1, time: [3, 4], clef: "G", problems: [] });
    expect(bars[0].voices[0]).toEqual([{ v: "q", d: 1, n: n(67, 15) }, { v: "8", n: n(66, 20) }, { v: "q", n: n(64, 18, 1) }]);
    expect(bars[1].voices[0][1]).toEqual({ v: "q" });
    expect(bars[1].problems).toEqual([]);
  });

  it("reads version 3 triplets (open until endTuplet) and leaves out grace notes", () => {
    const triplet = "<Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes></Tuplet>";
    const bars = readMscx(v3([START + note("eighth", 60, 14, "<grace8/>") + triplet + note("eighth", 60, 14) +
      note("eighth", 62, 16) + note("eighth", 64, 18) + "<endTuplet/>" + note("half", 65, 13)]), "1")!.voice!;
    expect(bars[0].voices[0].map(e => e.t)).toEqual([[3, 2], [3, 2], [3, 2], undefined]);
    expect(bars[0].problems).toEqual([]);
  });

  it("reads chords low to high, a unison once; a melody can't use them", () => {
    const bars = readMscx(v3([START + chord("half", [[64, 18], [60, 14], [64, 18]]) + note("quarter", 60, 14), START + note("half", 60, 14)]), "1")!.voice!;
    expect(bars[0].voices[0][0].n).toEqual([{ p: 60, s: 14 }, { p: 64, s: 18 }]);
    const melody = asMelody(bars);
    expect(melody[0].problems).toContain("chord");
    expect(melody[1].problems).toContain("doesn't add up");
  });

  it("reads the piano's two staves, each staff's clef from the instrument, and a second voice that sits out part of a bar", () => {
    const song = readMscx(v3([START + note("half", 67, 15, "<dots>1</dots>")], "",
      [`<voice>${START}${chord("half", [[64, 18], [67, 15]])}${note("quarter", 72, 14)}</voice>` +
       `<voice><location><fractions>1/4</fractions></location>${note("quarter", 60, 14)}</voice>`],
      [START + note("half", 48, 14, "<dots>1</dots>")]), "5")!;
    const [rh, lh] = song.piano!;
    expect(rh[0]).toMatchObject({ clef: "G", problems: [] });
    expect(rh[0].voices[1]).toEqual([{ v: "q", hide: 1 }, { v: "q", n: n(60, 14) }]);
    expect(lh[0]).toMatchObject({ clef: "F", problems: [] });
  });

  it("flags piano bars it can't draw or judge: cross-staff notes, tremolos, a clef change mid-bar", () => {
    const song = readMscx(v3([START + note("half", 67, 15, "<dots>1</dots>")], "",
      [START + note("half", 60, 14, "<staffMove>1</staffMove>") + note("quarter", 60, 14),
       note("half", 60, 14, "<Tremolo/>") + note("quarter", 60, 14),
       note("quarter", 60, 14) + "<Clef><concertClefType>F</concertClefType></Clef>" + note("half", 48, 14)],
      []), "6")!;
    expect(song.piano![0].map(b => b.problems)).toEqual([["cross-staff"], ["tremolo"], ["clef change"]]);
  });

  it("reads version 2 scores: no voice wrappers, other voices told apart by track, tuplets by id, ties as <Tie>", () => {
    const src = `<museScore version="2.06"><Score>
      <Part><Staff id="1"/><trackName>Voice</trackName><Instrument><instrumentId>voice.vocals</instrumentId></Instrument></Part>
      <Staff id="1"><Measure number="1">
        <KeySig><accidental>-2</accidental></KeySig><TimeSig><sigN>2</sigN><sigD>4</sigD></TimeSig>
        <Tuplet id="1"><normalNotes>2</normalNotes><actualNotes>3</actualNotes></Tuplet>
        <Chord><Tuplet>1</Tuplet><durationType>eighth</durationType><Note><Tie id="2"/><pitch>70</pitch><tpc>12</tpc></Note></Chord>
        <Chord><Tuplet>1</Tuplet><durationType>eighth</durationType><Note><pitch>70</pitch><tpc>12</tpc></Note></Chord>
        <Chord><Tuplet>1</Tuplet><durationType>eighth</durationType><Note><pitch>72</pitch><tpc>14</tpc></Note></Chord>
        <Chord><durationType>quarter</durationType><Note><pitch>74</pitch><tpc>16</tpc></Note></Chord>
        <Chord><track>1</track><durationType>half</durationType><Note><pitch>50</pitch><tpc>16</tpc></Note></Chord>
      </Measure></Staff></Score></museScore>`;
    const bar = readMscx(src, "2")!.voice![0];
    expect(bar).toMatchObject({ key: -2, time: [2, 4] });
    expect(bar.voices[0].map(e => [e.n![0].p, e.t, e.n![0].tie])).toEqual([[70, [3, 2], 1], [70, [3, 2], undefined], [72, [3, 2], undefined], [74, undefined, undefined]]);
    expect(bar.problems).toEqual(["second voice"]);
  });

  it("finds no voice part in a piano piece", () => {
    const src = '<museScore version="3.02"><Score><Part><Staff id="1"/><trackName>Piano</trackName><Instrument><instrumentId>keyboard.piano</instrumentId></Instrument></Part></Score></museScore>';
    expect(readMscx(src, "3")).toBeNull();
  });
});

describe("cutting melody excerpts", () => {
  const bars = (contents: string[]) => asMelody(readMscx(v3(contents), "9")!.voice!);

  it("finds phrases between rests, and excerpts of one phrase or two neighbours with enough notes, up to four bars", () => {
    const b = bars([
      START + note("quarter", 67, 15) + note("quarter", 66, 20) + rest("quarter"),
      note("half", 64, 18, "<dots>1</dots>"),
      note("half", 62, 16) + rest("quarter"),
      rest("measure"),
      note("half", 60, 14, "<dots>1</dots>"),
    ]);
    expect(phrases(b)).toEqual([
      { from: [0, 0], to: [0, 1], notes: 2 }, { from: [1, 0], to: [2, 0], notes: 2 }, { from: [4, 0], to: [4, 0], notes: 1 },
    ]);
    // Alone, each is too short; the last pair spans a bar's rest
    expect(excerptRanges(b)).toEqual([{ from: [0, 0], to: [2, 0], notes: 4 }]);
  });

  it("leaves out a phrase cut short by a bar it can't use", () => {
    const b = bars([START + note("quarter", 67, 15) + note("quarter", 66, 20) + note("quarter", 64, 18),
      chord("half", [[60, 14], [64, 18]]) + rest("quarter")]);
    expect(phrases(b)).toEqual([]);
  });

  it("keeps only the phrase's own notes: a neighbour's notes in its bars become tidy rests", () => {
    const melody = bars([
      START + note("quarter", 60, 14) + rest("quarter") + note("quarter", 67, 15),
      note("quarter", 65, 13) + note("quarter", 64, 18) + note("quarter", 62, 16),
      note("quarter", 60, 14) + rest("quarter") + note("quarter", 71, 19),
    ]);
    const cut = cutExcerpts(melody, "8");
    // The lone notes either side are too short alone, so they come only with the middle phrase
    expect(cut.map(e => e.id)).toEqual(["8:1.0-3.0", "8:1.2-3.0", "8:1.2-3.2"]);
    const [line] = cut[1].staves[0].voices;
    // C and the rest after it: one half rest; the B after the last note: a quarter rest beside the one written
    expect(line[0]).toEqual([{ v: "h" }, { v: "q", n: n(67, 15) }]);
    expect(line[2]).toEqual([{ v: "q", n: n(60, 14) }, { v: "q" }, { v: "q" }]);
    expect(cut[1].parts.voice!.notes).toBe(5);
  });

  it("writes tenor parts as written (an octave up, treble clef) and drops a tie out of the phrase", () => {
    const melody = asMelody(readMscx(v3([
      START + note("quarter", 55, 15) + note("quarter", 54, 20) + note("quarter", 57, 17, "", TIE),
      note("quarter", 57, 17) + note("quarter", 59, 19) + note("quarter", 60, 14, "", TIE),
    ], "<defaultClef>G8vb</defaultClef>"), "7")!.voice!);
    const [one] = cutExcerpts(melody, "7");
    expect(one).toMatchObject({ id: "7:1.0-2.2", key: 1, time: [3, 4] });
    expect(one.staves[0].clef).toBe("treble");
    const line = one.staves[0].voices[0];
    expect(line.flat().map(e => e.n![0].p)).toEqual([67, 66, 69, 69, 71, 72]);
    expect(line[0][2].n![0].tie).toBe(1);
    expect(line[1][2].n![0].tie).toBeUndefined();
    expect(one.parts.voice!.notes).toBe(5);
  });

  it("fills gaps with rests on the beat", () => {
    expect(restsFor(0, 1, [4, 4])).toEqual([{ v: "w", bar: 1 }]);
    expect(restsFor(1 / 4, 1, [4, 4])).toEqual([{ v: "q" }, { v: "h" }]);
    // Not across the middle of a 4/4 bar
    expect(restsFor(1 / 4, 3 / 4, [4, 4])).toEqual([{ v: "q" }, { v: "q" }]);
    expect(restsFor(0, 3 / 8, [6, 8])).toEqual([{ v: "q", d: 1 }]);
    // In 6/8, finish the beat first, then whole beats
    expect(restsFor(3 / 16, 3 / 4, [6, 8])).toEqual([{ v: "16" }, { v: "8" }, { v: "q", d: 1 }]);
    expect(restsFor(1 / 8, 1 / 2, [2, 4])).toEqual([{ v: "8" }, { v: "q" }]);
    expect(restsFor(0, 1 / 12, [2, 4])).toBeNull();
  });
});

describe("cutting piano excerpts", () => {
  const melody = [
    START + note("quarter", 67, 15) + note("quarter", 66, 20) + note("quarter", 64, 18),
    note("quarter", 62, 16) + note("quarter", 64, 18) + rest("quarter"),
  ];

  it("takes both staves over the melody's phrase, offered as each hand with enough to play, and both", () => {
    const song = readMscx(v3(melody, "",
      [START + chord("quarter", [[67, 15], [71, 19]]) + note("quarter", 69, 17) + note("quarter", 67, 15),
       note("quarter", 66, 20) + note("half", 67, 15)],
      [START + note("half", 43, 15, "<dots>1</dots>"), note("half", 50, 16, "<dots>1</dots>")]), "4")!;
    const [ex] = cutPianoExcerpts(song);
    expect(ex.id).toBe("4:1-2");
    expect(ex.staves.map(s => s.clef)).toEqual(["treble", "bass"]);
    expect(Object.keys(ex.parts).sort()).toEqual(["both", "rh"]);   // the left hand has two notes: not enough alone
    expect(ex.parts.rh).toMatchObject({ notes: 5, chord: 2, span: 4, voices: 1 });
    expect(ex.parts.both).toMatchObject({ notes: 5, chord: 2 });
  });

  it("leaves out bars it can't use", () => {
    const song = readMscx(v3(melody, "",
      [START + note("half", 60, 14, "<Tremolo/>") + note("quarter", 60, 14), note("half", 60, 14, "<dots>1</dots>")],
      [START + note("half", 43, 15, "<dots>1</dots>"), note("half", 50, 16, "<dots>1</dots>")]), "4")!;
    expect(cutPianoExcerpts(song)).toEqual([]);
  });
});

describe("measuring", () => {
  const e = (v: ExcerptEvent["v"], p?: number, s?: number, more: Partial<ExcerptEvent> = {}, tie?: 1): ExcerptEvent =>
    ({ v, ...(p == null ? {} : { n: n(p, s!, tie) }), ...more });

  it("measures what makes a melody hard", () => {
    // In G major, 3/4: G4 E4 | C♯5 (dotted, chromatic) A5 (a ledger line) | a syncopated tie
    const f = measure([{ clef: "treble", voices: [[
      [e("h", 67, 15), e("q", 64, 18)],
      [e("q", 73, 21, { d: 1 }), e("8", 81, 17), e("q", 79, 15)],
      [e("8", 74, 16), e("q", 76, 18, {}, 1), e("8", 76, 18), e("q")],
    ]] }], 1, [3, 4]);
    expect(f).toMatchObject({
      notes: 7, bars: 3, keyAccidentals: 1, chromatic: 1, range: 17, ledger: 1, maxLeap: 9,
      dotted: 1, ties: 1, tuplets: 0, rests: 0, syncopations: 1, compound: false, shortest: 1 / 8,
      chord: 1, span: 0, voices: 1,
    });
    expect(f.values).toBe(4);
  });

  it("counts ledger lines by how far off the staff a note goes", () => {
    expect([28, 29, 39, 40, 42, 26].map(step => ledgerLines(step, "treble"))).toEqual([1, 0, 0, 1, 2, 2]);
    expect([16, 17, 27, 28].map(step => ledgerLines(step, "bass"))).toEqual([1, 0, 0, 1]);
  });

  it("measures chords and voices in a piano staff", () => {
    const st: ExcerptStaff = { clef: "treble", voices: [
      [[{ v: "h", n: [{ p: 64, s: 18 }, { p: 67, s: 15 }, { p: 72, s: 14 }] }, e("q", 71, 19)]],
      [[{ v: "q", hide: 1 }, e("h", 60, 14)]],
    ] };
    expect(measure([st], 0, [3, 4])).toMatchObject({ notes: 3, chord: 3, span: 8, voices: 2 });
  });
});

describe("steps", () => {
  it("strikes every note starting together once, across voices and staves; a tied note isn't struck again", () => {
    const staves: ExcerptStaff[] = [
      { clef: "treble", voices: [
        [[{ v: "q", n: [{ p: 64, s: 18 }, { p: 67, s: 15, tie: 1 }] }, { v: "q", n: [{ p: 67, s: 15 }] }, { v: "q" }]],
        [[{ v: "q", hide: 1 }, { v: "h", n: [{ p: 60, s: 14 }] }]],
      ] },
      { clef: "bass", voices: [[[{ v: "h", d: 1, n: [{ p: 48, s: 14 }] }]]] },
    ];
    const { steps, stepOf } = excerptSteps(staves, [3, 4]);
    expect(steps.map(s => s.notes.map(x => x.p))).toEqual([[48, 64, 67], [60]]);
    // The tied G takes its first note's step; rests and spaces none
    expect(stepOf[0][0][0]).toEqual([0, 0, -1]);
    expect(stepOf[0][1][0]).toEqual([-1, 1]);
    expect(stepOf[1][0][0]).toEqual([0]);
  });

  it("follows a tie into another voice of the same staff when its own voice has no such note", () => {
    const st: ExcerptStaff = { clef: "treble", voices: [
      [[{ v: "h", hide: 1 }], [{ v: "h", n: [{ p: 64, s: 18 }, { p: 67, s: 15 }] }]],
      [[{ v: "h", n: [{ p: 67, s: 15, tie: 1 }] }], [{ v: "h", n: [{ p: 60, s: 14 }] }]],
    ] };
    const { steps, stepOf } = excerptSteps([st], [2, 4]);
    expect(steps.map(s => s.notes.map(x => x.p))).toEqual([[67], [60, 64]]);
    expect(stepOf[0][0][1]).toEqual([1]);
  });
});

describe("levels", () => {
  const easy: ExcerptFeatures = {
    notes: 5, bars: 2, keyAccidentals: 0, chromatic: 0, range: 5, ledger: 0, maxLeap: 2, stepShare: 1, values: 2,
    shortest: 1 / 4, dotted: 0, ties: 0, tuplets: 0, rests: 0, syncopations: 0, compound: false, chord: 1, span: 0, voices: 1,
  };

  it("puts a melody in the first level it fits, whatever its key", () => {
    expect(readingLevel(easy)).toBe(1);
    expect(readingLevel({ ...easy, keyAccidentals: 6 })).toBe(1);
    expect(readingLevel({ ...easy, dotted: 1 })).toBe(2);
    expect(readingLevel({ ...easy, compound: true })).toBe(3);
    expect(readingLevel({ ...easy, tuplets: 3 })).toBe(4);
    expect(readingLevel({ ...easy, chromatic: 9 })).toBe(READING_LEVELS.length);
  });

  it("has piano levels of its own: chords, voices and how busy a bar is", () => {
    expect(readingLevel(easy, "rh")).toBe(1);
    expect(readingLevel({ ...easy, chord: 2, span: 4 }, "rh")).toBe(2);
    expect(readingLevel({ ...easy, chord: 3, span: 7, voices: 2 }, "both")).toBe(3);
    expect(readingLevel({ ...easy, notes: 30 }, "lh")).toBe(4);
    expect(readingLevel({ ...easy, chord: 6 }, "rh")).toBe(PIANO_LEVELS.length);
  });

  it("works out durations and spellings", () => {
    expect(eventLength({ v: "q", d: 1 })).toBeCloseTo(3 / 8);
    expect(eventLength({ v: "8", t: [3, 2] })).toBeCloseTo(1 / 12);
    expect([14, 20, 12, 13, 19, 7].map(tpcName)).toEqual(["C", "F#", "Bb", "F", "B", "Cb"]);
  });
});
