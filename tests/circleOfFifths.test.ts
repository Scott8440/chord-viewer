// Circle of fifths: theory helpers and the SVG model.
import { describe, expect, it } from "vitest";
import { initialRoutine, keyProgress, reduceRoutine, routineById } from "../src/exercises/routines";
import { DEFAULT_EXERCISE_OPTIONS } from "../src/exercises/prescriptive";
import { analyze, buildKey, circlePosition, CIRCLE_OF_FIFTHS_MAJOR, CIRCLE_OF_FIFTHS_MINOR, keySignature } from "../src/theory";
import { chordOnCircle, circleSvg, type CircleModel } from "../src/views/circleOfFifths";

/** Each segment of the drawn circle: ring, label, numeral (if any) and state classes */
function segments(model: CircleModel) {
  const svg = circleSvg(model);
  return [...svg.matchAll(/<g class="seg (outer|inner)([^"]*)">.*?<text class="name"[^>]*>([^<]+)<\/text>(?:<text class="num"[^>]*>([^<]+)<\/text>)?<\/g>/g)]
    .map(m => ({ ring: m[1], classes: m[2].trim().split(" ").filter(Boolean), label: m[3], numeral: m[4] ?? "" }));
}
const find = (model: CircleModel, label: string) => segments(model).find(s => s.label === label)!;

describe("circle of fifths theory", () => {
  it("pairs each major key with its relative minor, a fifth apart round the circle", () => {
    CIRCLE_OF_FIFTHS_MAJOR.forEach((major, i) => {
      const key = buildKey(`${major}:major`)!;
      expect(buildKey(`${CIRCLE_OF_FIFTHS_MINOR[i]}:minor`)!.spell[key.tonicPc]).toBeDefined();
      const next = buildKey(`${CIRCLE_OF_FIFTHS_MAJOR[(i + 1) % 12]}:major`)!;
      expect((next.tonicPc - key.tonicPc + 12) % 12).toBe(7);
      // relative minor: a minor third below
      expect((key.tonicPc - buildKey(`${CIRCLE_OF_FIFTHS_MINOR[i]}:minor`)!.tonicPc + 12) % 12).toBe(3);
    });
  });

  it("knows each position's key signature", () => {
    expect(circlePosition("D:major")).toBe(2);
    expect(circlePosition("B:minor")).toBe(2);
    expect(circlePosition("Bogus:major")).toBe(-1);
    const sig = (k: string) => keySignature(buildKey(k)!);
    expect(sig("C:major")).toEqual({ count: 0, accidental: "" });
    expect(sig("D:major")).toEqual({ count: 2, accidental: "#" });
    expect(sig("Eb:major")).toEqual({ count: 3, accidental: "b" });
    // The enharmonic seam: F# major and its relative minor, spelled Eb minor
    expect(sig("F#:major")).toEqual({ count: 6, accidental: "#" });
    expect(sig("Eb:minor")).toEqual({ count: 6, accidental: "b" });
    // Every key's signature agrees with its place on the circle
    CIRCLE_OF_FIFTHS_MAJOR.forEach((t, i) => expect(sig(`${t}:major`).count).toBe(i <= 6 ? i : 12 - i));
    CIRCLE_OF_FIFTHS_MINOR.forEach((t, i) => expect(sig(`${t}:minor`).count).toBe(i <= 6 ? i : 12 - i));
  });
});

describe("circleSvg", () => {
  it("draws 12 major and 12 minor segments, C at the top", () => {
    const segs = segments({});
    expect(segs.filter(s => s.ring === "outer").map(s => s.label).join(" ")).toBe("C G D A E B F♯ D♭ A♭ E♭ B♭ F");
    expect(segs.filter(s => s.ring === "inner").map(s => s.label).join(" ")).toBe("Am Em Bm F♯m C♯m G♯m E♭m B♭m Fm Cm Gm Dm");
    expect(segs.every(s => !s.numeral && s.classes.length === 0)).toBe(true);
  });

  it("highlights a major key and labels its neighbourhood: IV I V outside, ii vi iii inside", () => {
    const m = { keyValue: "G:major" };
    expect(find(m, "G")).toMatchObject({ classes: ["focus"], numeral: "I" });
    expect(find(m, "C")).toMatchObject({ classes: ["inkey"], numeral: "IV" });
    expect(find(m, "D")).toMatchObject({ classes: ["inkey"], numeral: "V" });
    expect([find(m, "Am").numeral, find(m, "Em").numeral, find(m, "Bm").numeral]).toEqual(["ii", "vi", "iii"]);
    expect(find(m, "A").classes).toEqual([]);
    expect(circleSvg(m)).toContain('<text class="c1" x="0" y="-2">G</text><text class="c2" x="0" y="11">1♯</text>');
  });

  it("highlights a minor key on the inner ring: iv i v inside, VI III VII outside", () => {
    const m = { keyValue: "D:minor" };
    expect(find(m, "Dm")).toMatchObject({ classes: ["focus"], numeral: "i" });
    expect([find(m, "Gm").numeral, find(m, "Am").numeral]).toEqual(["iv", "v"]);
    expect([find(m, "B♭").numeral, find(m, "F").numeral, find(m, "C").numeral]).toEqual(["VI", "III", "VII"]);
    expect(circleSvg(m)).toContain(">Dm</text><text class=\"c2\" x=\"0\" y=\"11\">1♭</text>");
  });

  it("wraps round the top: F major's neighbourhood includes C and B♭", () => {
    const m = { keyValue: "F:major" };
    expect([find(m, "B♭").numeral, find(m, "F").numeral, find(m, "C").numeral]).toEqual(["IV", "I", "V"]);
  });

  it("marks a chord on its ring", () => {
    expect(find({ chord: { rootPc: 9, minor: true } }, "Am").classes).toEqual(["mark"]);
    expect(find({ chord: { rootPc: 9, minor: false } }, "A").classes).toEqual(["mark"]);
    expect(find({ chord: { rootPc: 1, minor: false } }, "D♭").classes).toEqual(["mark"]);   // C# = D♭
  });

  it("can highlight the key alone, without its neighbourhood", () => {
    const m = { keyValue: "G:major", neighbours: false };
    expect(find(m, "G")).toMatchObject({ classes: ["focus"], numeral: "" });
    expect(find(m, "C")).toMatchObject({ classes: [], numeral: "" });
  });

  it("shows E♭ minor with six flats in the middle", () => {
    expect(circleSvg({ keyValue: "Eb:minor" })).toContain(">E♭m</text><text class=\"c2\" x=\"0\" y=\"11\">6♭</text>");
  });

  it("shows routine progress and a centre with the direction", () => {
    const m: CircleModel = { progress: { "C:major": "done", "G:major": "flawed", "D:major": "skipped", "A:major": "current" },
                             center: { text: "4 / 12", order: "flats" } };
    expect(["C", "G", "D", "A", "E"].map(l => find(m, l).classes.join(" "))).toEqual(["done", "flawed", "skipped", "current", ""]);
    expect(circleSvg(m)).toContain(">4 / 12</text><text class=\"c2\" x=\"0\" y=\"12\">↺</text>");
  });
});

describe("chordOnCircle", () => {
  const at = (notes: number[]) => chordOnCircle(analyze(notes, null));
  it("puts major-family chords outside and minor-family chords inside, by root", () => {
    expect(at([48, 52, 55])).toEqual({ rootPc: 0, minor: false });          // C
    expect(at([43, 59, 62, 65])).toEqual({ rootPc: 7, minor: false });      // G7
    expect(at([45, 60, 64, 67])).toEqual({ rootPc: 9, minor: true });       // Am7
    expect(at([52, 55, 59])).toEqual({ rootPc: 4, minor: true });           // Em
  });
  it("leaves out chords that aren't on the circle, and non-chords", () => {
    expect(at([47, 50, 53])).toBeNull();     // Bdim
    expect(at([48, 52, 56])).toBeNull();     // Caug
    expect(at([60])).toBeNull();
    expect(chordOnCircle(null)).toBeNull();
  });
});

describe("keyProgress", () => {
  it("groups a routine's items by key with one state each", () => {
    let r = initialRoutine(routineById("scale-triads-circle")!, "sharps", DEFAULT_EXERCISE_OPTIONS);
    expect(keyProgress(r).slice(0, 2)).toEqual([
      { keyValue: "C:major", label: "C", state: "current", items: [0, 1] },
      { keyValue: "G:major", label: "G", state: "upcoming", items: [2, 3] },
    ]);
    r = reduceRoutine(r, { type: "skip", held: [] });
    r = reduceRoutine(r, { type: "skip", held: [] });
    expect(keyProgress(r).slice(0, 2).map(g => g.state)).toEqual(["skipped", "current"]);
  });
});
