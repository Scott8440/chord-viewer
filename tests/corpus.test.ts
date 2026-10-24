// The sight-reading importer: reading MuseScore scores (versions 2 and 3), cutting excerpts and measuring them.
import { describe, expect, it } from "vitest";
import { cutExcerpts, excerptRanges, measure, phrases, restsFor } from "../scripts/corpus/excerpts";
import { readMscx } from "../scripts/corpus/mscx";
import { parseXml } from "../scripts/corpus/xml";
import { eventLength, READING_LEVELS, readingLevel, tpcName, type ExcerptEvent } from "../src/exercises/excerpts";

/** A version 3 score: a voice part (staff 1) and a piano (staff 2), with these bars of voice-1 content */
const v3 = (bars: string[], clef = "") => `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02"><Score>
  <Part><Staff id="1">${clef}</Staff><trackName>Voice</trackName><Instrument><instrumentId>voice.vocals</instrumentId></Instrument></Part>
  <Part><Staff id="2"/><trackName>Piano</trackName><Instrument><instrumentId>keyboard.piano</instrumentId></Instrument></Part>
  <Staff id="1"><VBox><Text><style>Title</style><text>A &amp; B</text></Text></VBox>
    ${bars.map(b => `<Measure><voice>${b}</voice></Measure>`).join("\n")}
  </Staff>
  <Staff id="2"><Measure><voice><Rest><durationType>measure</durationType></Rest></voice></Measure></Staff>
</Score></museScore>`;
const note = (type: string, pitch: number, tpc: number, extra = "", noteExtra = "") =>
  `<Chord>${extra}<durationType>${type}</durationType><Note>${noteExtra}<pitch>${pitch}</pitch><tpc>${tpc}</tpc></Note></Chord>`;
const rest = (type: string) => `<Rest><durationType>${type}</durationType></Rest>`;
const START = "<KeySig><accidental>1</accidental></KeySig><TimeSig><sigN>3</sigN><sigD>4</sigD></TimeSig>";
const TIE = '<Spanner type="Tie"><Tie/><next><location><fractions>1/4</fractions></location></next></Spanner>';

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
    const line = readMscx(v3([
      START + note("quarter", 67, 15, "<dots>1</dots>") + note("eighth", 66, 20) + note("quarter", 64, 18, "", TIE),
      note("quarter", 64, 18) + rest("quarter") + note("quarter", 62, 16),
    ]), "123")!;
    expect(line.title).toBe("A & B");
    expect(line.bars[0]).toMatchObject({ key: 1, time: [3, 4], clef: "G", problems: [] });
    expect(line.bars[0].events).toEqual([{ v: "q", d: 1, p: 67, s: 15 }, { v: "8", p: 66, s: 20 }, { v: "q", p: 64, s: 18, tie: 1 }]);
    expect(line.bars[1].events[1]).toEqual({ v: "q" });
    expect(line.bars[1].problems).toEqual([]);
  });

  it("reads version 3 triplets (open until endTuplet) and leaves out grace notes", () => {
    const triplet = "<Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes></Tuplet>";
    const line = readMscx(v3([START + note("eighth", 60, 14, "<grace8/>") + triplet + note("eighth", 60, 14) +
      note("eighth", 62, 16) + note("eighth", 64, 18) + "<endTuplet/>" + note("half", 65, 13)]), "1")!;
    expect(line.bars[0].events.map(e => e.t)).toEqual([[3, 2], [3, 2], [3, 2], undefined]);
    expect(line.bars[0].problems).toEqual([]);
  });

  it("flags what an excerpt can't use: chords, a second voice, bars that don't add up", () => {
    const chord = '<Chord><durationType>half</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note><Note><pitch>64</pitch><tpc>18</tpc></Note></Chord>';
    const line = readMscx(v3([START + chord + note("quarter", 60, 14), START + note("half", 60, 14)]), "1")!;
    expect(line.bars[0].problems).toContain("chord");
    expect(line.bars[0].events[0].p).toBe(64);   // the top note
    expect(line.bars[1].problems).toContain("doesn't add up");
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
    const bar = readMscx(src, "2")!.bars[0];
    expect(bar).toMatchObject({ key: -2, time: [2, 4] });
    expect(bar.events.map(e => [e.p, e.t, e.tie])).toEqual([[70, [3, 2], 1], [70, [3, 2], undefined], [72, [3, 2], undefined], [74, undefined, undefined]]);
    expect(bar.problems).toEqual(["second voice"]);
  });

  it("finds no voice part in a piano piece", () => {
    const src = '<museScore version="3.02"><Score><Part><Staff id="1"/><trackName>Piano</trackName><Instrument><instrumentId>keyboard.piano</instrumentId></Instrument></Part></Score></museScore>';
    expect(readMscx(src, "3")).toBeNull();
  });
});

describe("cutting excerpts", () => {
  const bars = (contents: string[]) => readMscx(v3(contents), "9")!.bars;

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
    const chord = '<Chord><durationType>half</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note><Note><pitch>64</pitch><tpc>18</tpc></Note></Chord>';
    const b = bars([START + note("quarter", 67, 15) + note("quarter", 66, 20) + note("quarter", 64, 18), chord + rest("quarter")]);
    expect(phrases(b)).toEqual([]);
  });

  it("keeps only the phrase's own notes: a neighbour's notes in its bars become tidy rests", () => {
    const line = readMscx(v3([
      START + note("quarter", 60, 14) + rest("quarter") + note("quarter", 67, 15),
      note("quarter", 65, 13) + note("quarter", 64, 18) + note("quarter", 62, 16),
      note("quarter", 60, 14) + rest("quarter") + note("quarter", 71, 19),
    ]), "8")!;
    const cut = cutExcerpts(line);
    // The lone notes either side are too short alone, so they come only with the middle phrase
    expect(cut.map(e => e.id)).toEqual(["8:1.0-3.0", "8:1.2-3.0", "8:1.2-3.2"]);
    const ex = cut[1];
    // C and the rest after it: one half rest; the B after the last note: a quarter rest beside the one written
    expect(ex.bars[0]).toEqual([{ v: "h" }, { v: "q", p: 67, s: 15 }]);
    expect(ex.bars[2]).toEqual([{ v: "q", p: 60, s: 14 }, { v: "q" }, { v: "q" }]);
    expect(ex.features.notes).toBe(5);
  });

  it("writes tenor parts as written (an octave up, treble clef) and drops a tie out of the phrase", () => {
    const line = readMscx(v3([
      START + note("quarter", 55, 15) + note("quarter", 54, 20) + note("quarter", 57, 17, "", TIE),
      note("quarter", 57, 17) + note("quarter", 59, 19) + note("quarter", 60, 14, "", TIE),
    ], "<defaultClef>G8vb</defaultClef>"), "7")!;
    const [one] = cutExcerpts(line);
    expect(one).toMatchObject({ id: "7:1.0-2.2", clef: "treble", key: 1, time: [3, 4] });
    expect(one.bars.flat().map(e => e.p)).toEqual([67, 66, 69, 69, 71, 72]);
    expect(one.bars[0][2].tie).toBe(1);
    expect(one.bars[1][2].tie).toBeUndefined();
    expect(one.features.notes).toBe(5);
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

  it("measures what makes an excerpt hard", () => {
    const e = (v: ExcerptEvent["v"], p?: number, s?: number, more: Partial<ExcerptEvent> = {}): ExcerptEvent =>
      ({ v, ...(p == null ? {} : { p, s }), ...more });
    // In G major, 3/4: G4 E4 | C♯5 (dotted, chromatic) A5 (ledger) | a syncopated tie
    const f = measure([
      [e("h", 67, 15), e("q", 64, 18)],
      [e("q", 73, 21, { d: 1 }), e("8", 81, 17), e("q", 79, 15)],
      [e("8", 74, 16), e("q", 76, 18, { tie: 1 }), e("8", 76, 18), e("q")],
    ], 1, [3, 4], "treble");
    expect(f).toMatchObject({
      notes: 7, bars: 3, keyAccidentals: 1, chromatic: 1, range: 17, ledger: 1, maxLeap: 9,
      dotted: 1, ties: 1, tuplets: 0, rests: 0, syncopations: 1, compound: false, shortest: 1 / 8,
    });
    expect(f.values).toBe(4);
  });
});

describe("levels", () => {
  const easy = {
    notes: 5, bars: 2, keyAccidentals: 0, chromatic: 0, range: 5, ledger: 0, maxLeap: 2, stepShare: 1, values: 2,
    shortest: 1 / 4, dotted: 0, ties: 0, tuplets: 0, rests: 0, syncopations: 0, compound: false,
  };

  it("puts an excerpt in the first level it fits, whatever its key", () => {
    expect(readingLevel(easy)).toBe(1);
    expect(readingLevel({ ...easy, keyAccidentals: 6 })).toBe(1);
    expect(readingLevel({ ...easy, dotted: 1 })).toBe(2);
    expect(readingLevel({ ...easy, compound: true })).toBe(3);
    expect(readingLevel({ ...easy, tuplets: 3 })).toBe(4);
    expect(readingLevel({ ...easy, chromatic: 9 })).toBe(READING_LEVELS.length);
  });

  it("works out durations and spellings", () => {
    expect(eventLength({ v: "q", d: 1 })).toBeCloseTo(3 / 8);
    expect(eventLength({ v: "8", t: [3, 2] })).toBeCloseTo(1 / 12);
    expect([14, 20, 12, 13, 19, 7].map(tpcName)).toEqual(["C", "F#", "Bb", "F", "B", "Cb"]);
  });
});
