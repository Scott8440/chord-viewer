// Template recognizer: matching, cost explanations and consistency.
import { describe, expect, it } from "vitest";
import { analyze, buildKey, CHORD_TEMPLATES, chordReadings, matchTemplate, RECOGNIZER_WEIGHTS } from "../src/theory";

describe("matchTemplate", () => {
  it("reports omitted optional tones, missing required tones and extra notes", () => {
    const m = matchTemplate([0, 4, 10, 2], 0, "9");          // C E Bb D: C9 without its 5th
    expect(m.omitted.map(t => t.degree)).toEqual([5]);
    expect(m.missing).toEqual([]);
    expect(m.extra).toEqual([]);

    const m2 = matchTemplate([0, 7, 10, 6], 0, "7");         // C G Bb F#: no 3rd, extra F#
    expect(m2.missing.map(t => t.degree)).toEqual([3]);
    expect(m2.extra).toEqual([6]);
  });

  it("works on any root", () => {
    expect(matchTemplate([2, 6, 9, 0], 2, "7").missing).toEqual([]);   // D7
  });

  it("rejects unknown template ids", () => {
    expect(() => matchTemplate([0], 0, "nope")).toThrow();
  });
});

describe("templates", () => {
  it("have unique ids and symbols", () => {
    expect(new Set(CHORD_TEMPLATES.map(t => t.id)).size).toBe(CHORD_TEMPLATES.length);
    expect(new Set(CHORD_TEMPLATES.map(t => t.symbol)).size).toBe(CHORD_TEMPLATES.length);
  });

  it("never define the same pitch-class set twice (which would make names arbitrary)", () => {
    const seen = new Map<string, string>();
    for (const t of CHORD_TEMPLATES) {
      const m = matchTemplate([], 0, t.id);   // nothing played: every tone is missing or omitted
      const full = [...new Set([...m.missing, ...m.omitted].map(x => x.pc))].sort((a, b) => a - b).join(",");
      expect(seen.get(full), `${t.id} duplicates ${seen.get(full)}`).toBeUndefined();
      seen.set(full, t.id);
    }
  });
});

describe("readings", () => {
  it("explain their cost: the reasons add up", () => {
    for (const notes of [[40, 55, 60], [36, 61, 64, 70], [36, 55, 59, 62], [48, 52, 55, 62, 66]]) {
      for (const key of [null, buildKey("C:major"), buildKey("F#:minor")]) {
        const pcs = [...new Set(notes.map(n => n % 12))];
        for (const r of chordReadings(pcs, key)) {
          expect(r.reasons.reduce((s, x) => s + x.cost, 0)).toBeCloseTo(r.cost, 6);
          expect(r.reasons.filter(x => !x.fromKey).reduce((s, x) => s + x.cost, 0)).toBeCloseTo(r.voicingCost, 6);
        }
      }
    }
  });

  it("say what was left out and what is in the bass", () => {
    const r = analyze([40, 48, 58], null);                    // E C Bb: C7/E, no 5th
    expect(r?.text).toBe("C7/E");
    expect(r?.best?.omitted).toEqual([5]);
    expect(r?.best?.reasons.map(x => x.label)).toEqual(["dominant seventh", "no 5th", "E in the bass (inversion)"]);
  });

  it("give the same answer in every transposition", () => {
    const shapes = [[0, 4, 7], [4, 12, 19], [0, 10, 16, 19], [3, 12, 16, 19, 23], [0, 7, 11, 14], [0, 13, 16, 22],
                    [6, 15, 19, 24], [0, 7, 9, 16, 19], [0, 3, 6, 9], [5, 12, 19, 22, 26, 27], [0, 1, 2], [0, 5]];
    for (const shape of shapes) {
      const ref = analyze(shape.map(n => n + 48), null);
      for (let t = 1; t < 12; t++) {
        const r = analyze(shape.map(n => n + 48 + t), null);
        expect(r?.kind).toBe(ref?.kind);
        if (r?.kind === "chord" && ref?.kind === "chord") {
          expect(r.best.alias).toBe(ref.best.alias);
          expect((r.best.rootPc - ref.best.rootPc + 12) % 12).toBe(t);
          expect(r.best.cost).toBeCloseTo(ref.best.cost, 6);
        }
      }
    }
  });

  it("are never hidden by the key alone", () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      const key = buildKey(["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"][tonic] + ":major");
      for (const notes of [[40, 60, 68, 70], [36, 61, 64, 70], [43, 59, 62, 65]]) {
        expect(analyze(notes, key)?.kind).toBe(analyze(notes, null)?.kind);
      }
    }
  });

  it("use the weights passed in", () => {
    const strict = { ...RECOGNIZER_WEIGHTS, omit: { 5: 10, 9: 10 } };
    expect(analyze([48, 52, 59], null)?.text).toBe("Cmaj7");   // C E B: no 5th is fine by default
    expect(analyze([48, 52, 59], null, strict)?.text).toBe("?");
  });
});
