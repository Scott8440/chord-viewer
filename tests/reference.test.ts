// The reference pages: chord formulas from the templates, the keyboard drawing, and the pages themselves.
import { describe, expect, it } from "vitest";
import { REFERENCE_PAGES } from "../src/reference/pages";
import { chordDegrees, chordFormula, chordNotes, degreeOf } from "../src/theory/chordFormula";
import {
  diatonicTriads,
  keySignature,
  scaleFormula,
  scaleNotes,
  scaleSteps,
  stepName,
} from "../src/theory/scaleFormula";
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

describe("scale formulas", () => {
  it("spells each scale from its tonic, one letter per note", () => {
    expect(scaleNotes(scaleFormula("major", "G4"))).toBe("G A B C D E F♯");
    expect(scaleNotes(scaleFormula("minor", "C4"))).toBe("C D E♭ F G A♭ B♭");
    expect(scaleNotes(scaleFormula("locrian", "C4"))).toBe("C D♭ E♭ F G♭ A♭ B♭");
    expect(scaleFormula("lydian", "C4").map(t => t.degree)).toEqual(["1", "2", "3", "♯4", "5", "6", "7", "8"]);
  });

  it("gives the steps between neighbouring notes", () => {
    expect(scaleSteps(scaleFormula("major")).map(stepName).join(" ")).toBe("W W H W W W H");
    expect(scaleSteps(scaleFormula("harmonic minor")).map(stepName).join(" ")).toBe("W H W W H W+H H");
    expect(scaleFormula("major", "C4", { octave: false })).toHaveLength(7);
  });

  it("knows each major key's signature, in the order it's written, and its diatonic triads", () => {
    expect(keySignature("C")).toEqual({ count: 0, notes: [] });
    expect(keySignature("A")).toEqual({ count: 3, notes: ["F♯", "C♯", "G♯"] });
    expect(keySignature("Eb")).toEqual({ count: -3, notes: ["B♭", "E♭", "A♭"] });
    expect(diatonicTriads("C")).toEqual(["C", "Dm", "Em", "F", "G", "Am", "Bdim"]);
    expect(diatonicTriads("A", true)).toEqual(["Am", "Bdim", "C", "Dm", "Em", "F", "G"]);
  });

  it("refuses a scale it doesn't know", () => {
    expect(() => scaleFormula("nonsense")).toThrow();
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
  it("each has a title and sections with unique ids and some content", () => {
    for (const page of REFERENCE_PAGES) {
      expect(page.title).toBeTruthy();
      const ids = page.sections.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of page.sections) expect(s.html.length).toBeGreaterThan(100);
    }
    expect(new Set(REFERENCE_PAGES.map(p => p.id)).size).toBe(REFERENCE_PAGES.length);
  });

  it("lists chord forms, scales, diatonic chords, secondary dominants, then modes", () => {
    expect(REFERENCE_PAGES.map(p => p.id)).toEqual(["chords", "scales", "diatonic", "secondary", "modes"]);
  });

  it("secondary dominants: each chord's cell holds its dominant seventh, a fifth above it", () => {
    const page = REFERENCE_PAGES.find(p => p.id === "secondary")!;
    const table = page.sections.find(s => s.id === "table")!.html;
    const cells = (key: string) =>
      [
        ...(new RegExp(`<tr data-key="${key}">(.*?)</tr>`).exec(table)?.[1] ?? "").matchAll(
          /<span class="refCellMain">(.*?)<\/span><span class="refCellReveal">from (.*?)<\/span>/g,
        ),
      ].map(m => `${m[2]}→${m[1]}`);
    expect(cells("C")).toEqual(["A7→Dm", "B7→Em", "C7→F", "D7→G", "E7→Am"]);
    expect(cells("Bb")).toEqual(["G7→Cm", "A7→Dm", "B♭7→E♭", "C7→F", "D7→Gm"]);
    expect(table).toContain('data-detail="C/ii"');
  });

  it("secondary dominants: a clicked chord shows its dominant's notes, the note from outside the key, and both chords", () => {
    const page = REFERENCE_PAGES.find(p => p.id === "secondary")!;
    const ii = page.detail!("C/ii");
    expect(ii).toContain("A7 (A–C♯–E–G) resolves to Dm");
    expect(ii).toContain("C♯ is not in C major. C♯ is a half step below D, and leads up to it.");
    expect(ii.match(/<svg class="piano"/g)).toHaveLength(2);
    // V7/iii borrows two notes; V7/IV only its seventh
    expect(page.detail!("C/iii")).toContain("D♯ and F♯ are not in C major");
    expect(page.detail!("C/IV")).toContain("B♭ is not in C major. It pulls towards F.");
    expect(page.detail!("Eb/V")).toContain(
      "F7 (F–A–C–E♭) resolves to B♭. A is not in E♭ major. A is a half step below B♭",
    );
    expect(page.detail!("C/vii")).toBe("");
    expect(page.detail!("H/ii")).toBe("");
  });

  it("the diatonic chord page has a row per key, every chord in the app's spelling", () => {
    const page = REFERENCE_PAGES.find(p => p.id === "diatonic")!;
    const html = page.sections.map(s => s.html).join("");
    const section = (id: string) => page.sections.find(s => s.id === id)!.html;
    /** A key's row in one section's table: its chords */
    const row = (id: string, key: string) => {
      const m = new RegExp(`<tr[^>]*><td class="sym">${key}</td>(.*?)</tr>`).exec(section(id));
      return m
        ? m[1]
            .replace(/<\/?td>/g, " ")
            .trim()
            .split(/\s+/)
        : null;
    };
    // Whether the keys are major or minor is the caption; the rows name just the tonic
    expect(section("major-triads")).toContain("<caption>Major keys</caption>");
    expect(section("minor-triads")).toContain("<caption>Minor keys</caption>");
    expect(row("major-triads", "C")).toEqual(["C", "Dm", "Em", "F", "G", "Am", "Bdim"]);
    expect(row("major-triads", "B♭")).toEqual(["B♭", "Cm", "Dm", "E♭", "F", "Gm", "Adim"]);
    expect(row("minor-triads", "A")).toEqual(["Am", "Bdim", "C", "Dm", "Em", "F", "G"]);
    // The key picker pairs each major key with its relative minor; both rows carry the major key's tag
    expect(page.intro).toContain("data-key-pick");
    expect(page.intro).toContain('<option value="Bb">B♭ major / G minor</option>');
    expect(section("major-triads")).toContain('<tr data-key="Bb"><td class="sym">B♭</td>');
    expect(section("minor-triads")).toContain('<tr data-key="Bb"><td class="sym">G</td>');
    expect(section("harmonic-minor")).toContain('<tr data-key="C"><td class="sym">A</td>');
    expect(html).toContain("<td>Cmaj7</td><td>Dm7</td><td>Em7</td><td>Fmaj7</td><td>G7</td><td>Am7</td><td>Bm7♭5</td>");
    // Harmonic minor: major V, diminished vii on the raised seventh, augmented III
    expect(html).toContain("<td>Am</td><td>Bdim</td><td>Caug</td><td>Dm</td><td>E</td><td>F</td><td>G♯dim</td>");
    expect(html).not.toMatch(/mMaj7|\+maj7|o7|b5/);
  });

  it("the scale and mode pages show their scales on keyboards, worked out rather than typed", () => {
    const text = (id: string) =>
      REFERENCE_PAGES.find(p => p.id === id)!
        .sections.map(s => s.html)
        .join("");
    const scales = text("scales"),
      modes = text("modes");
    for (const notes of ["C D E F G A B", "A B C D E F G", "C D E♭ F G A♭ B", "F♯ C♯ G♯ D♯ A♯ E♯"])
      expect(scales).toContain(notes);
    // C Lydian has G major's notes, C Locrian D♭ major's; A Mixolydian is D major from A
    expect(modes).toContain("C Lydian has the notes of G major");
    expect(modes).toContain("D♭ major (five flats)");
    expect(modes).toContain("which is D major, and play its notes from A: A B C♯ D E F♯ G");
    expect(modes).toContain("Cm7♭5");
    expect(scales.match(/<svg class="piano"/g)!.length).toBeGreaterThan(10);
    expect(modes.match(/<svg class="piano"/g)!.length).toBeGreaterThan(15);
  });

  it("the chord page shows each chord type it discusses on a keyboard", () => {
    const page = REFERENCE_PAGES.find(p => p.id === "chords")!;
    const html = page.sections.map(s => s.html).join("");
    for (const notes of ["C–E–G", "C–E♭–G", "C–E♭–G♭", "C–E–G♯", "C–D–G", "C–F–G", "C–E–G–B♭", "C–E♭–G♭–B𝄫"])
      expect(html).toContain(notes);
    expect(html.match(/<svg class="piano"/g)!.length).toBeGreaterThan(20);
  });
});
