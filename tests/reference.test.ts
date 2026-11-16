// The reference pages: chord formulas from the templates, the keyboard drawing, and the pages themselves.
import { describe, expect, it } from "vitest";
import { REFERENCE_PAGES } from "../src/reference/pages";
import { chordDegrees, chordFormula, chordNotes, degreeOf } from "../src/theory/chordFormula";
import { pianoSvg } from "../src/views/piano";

describe("chord formulas", () => {
  it("names each interval as a chord formula does", () => {
    expect(["1P", "3M", "3m", "5P", "5d", "5A", "7M", "7m", "7d", "9M", "4P", "6M"].map(degreeOf)).toEqual([
      "1",
      "3",
      "♭3",
      "5",
      "♭5",
      "♯5",
      "7",
      "♭7",
      "𝄫7",
      "9",
      "4",
      "6",
    ]);
  });

  it("spells each chord on C by its intervals, letters in thirds", () => {
    expect(chordNotes(chordFormula("M"))).toBe("C–E–G");
    expect(chordNotes(chordFormula("dim"))).toBe("C–E♭–G♭");
    expect(chordNotes(chordFormula("aug"))).toBe("C–E–G♯");
    expect(chordNotes(chordFormula("dim7"))).toBe("C–E♭–G♭–B𝄫");
    expect(chordDegrees(chordFormula("m7b5"))).toBe("1 ♭3 ♭5 ♭7");
    expect(chordFormula("9").map(t => t.semitones)).toEqual([0, 4, 7, 10, 14]);
  });

  it("places the notes above another root too", () => {
    const t = chordFormula("m7", "A3");
    expect(chordNotes(t)).toBe("A–C–E–G");
    expect(t.map(x => x.midi)).toEqual([57, 60, 64, 67]);
  });

  it("refuses a chord type it doesn't know", () => {
    expect(() => chordFormula("nonsense")).toThrow();
  });
});

describe("the keyboard drawing", () => {
  it("draws every key in the range, marking and labelling the chord's notes", () => {
    const svg = pianoSvg({
      low: 60,
      high: 72,
      keys: [
        { midi: 60, label: "C", caption: "1", role: "root" },
        { midi: 63, label: "E♭", caption: "♭3" },
      ],
      label: "C minor",
    });
    expect(svg.match(/class="white/g)).toHaveLength(8);
    expect(svg.match(/class="black/g)).toHaveLength(5);
    expect(svg).toContain('class="white root"');
    expect(svg).toContain('class="black tone"');
    expect(svg).toContain(">E♭</text>");
    expect(svg).toContain(">♭3</text>");
  });

  it("escapes what it writes", () => {
    const svg = pianoSvg({ low: 60, high: 62, keys: [{ midi: 60, label: "<b>" }], label: '"x"' });
    expect(svg).not.toContain("<b>");
    expect(svg).toContain("&lt;b&gt;");
  });
});

describe("the pages", () => {
  it("each has a title, an intro and sections with unique ids and some content", () => {
    for (const page of REFERENCE_PAGES) {
      expect(page.title).toBeTruthy();
      expect(page.intro).toContain("<p>");
      const ids = page.sections.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of page.sections) expect(s.html.length).toBeGreaterThan(100);
    }
    expect(new Set(REFERENCE_PAGES.map(p => p.id)).size).toBe(REFERENCE_PAGES.length);
  });

  it("the chord page shows each chord type it discusses on a keyboard", () => {
    const page = REFERENCE_PAGES.find(p => p.id === "chords")!;
    const html = page.sections.map(s => s.html).join("");
    for (const notes of ["C–E–G", "C–E♭–G", "C–E♭–G♭", "C–E–G♯", "C–D–G", "C–F–G", "C–E–G–B♭", "C–E♭–G♭–B𝄫"])
      expect(html).toContain(notes);
    expect(html.match(/<svg class="piano"/g)!.length).toBeGreaterThan(20);
  });
});
