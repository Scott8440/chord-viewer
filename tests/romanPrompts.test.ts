// Roman numeral prompts for chord practice.
import { describe, expect, it } from "vitest";
import {
  diatonicChords, initialChordPractice, makeRomanPrompt, reduceChordPractice, type ChordPrompt,
} from "../src/exercises/chordPractice";
import { createAppState, reduceApp } from "../src/state/app";
import { analyze, buildKey, KEY_MAJORS, KEY_MINORS, matchTemplate, prettyAcc, templateById } from "../src/theory";
import { chordPracticeDisplay } from "../src/views/practice";

const KEYS = [...KEY_MAJORS.map(t => t + ":major"), ...KEY_MINORS.map(t => t + ":minor")];
const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

/** The prompted chord in close root position, starting at C3 or above */
function voice(c: { rootPc: number; type: string }): number[] {
  const m = matchTemplate([], c.rootPc, c.type);
  return [...m.missing, ...m.omitted].map(t => 48 + c.rootPc + t.pc + (t.degree > 7 ? 12 : 0)).sort((a, b) => a - b);
}

describe("diatonicChords", () => {
  it("agree with the app's own analysis in every key: same chord, same numeral", () => {
    for (const k of KEYS) {
      const key = buildKey(k)!;
      const chords = diatonicChords(key);
      expect(chords).toHaveLength(14);
      for (const c of chords) {
        const r = analyze(voice(c), key);
        expect(r?.text, `${c.numeral} in ${k}`).toBe(c.root + templateById(c.type)!.symbol);
        expect(r?.roman, `${c.numeral} in ${k}`).toBe(prettyAcc(c.numeral));
      }
    }
  });

  it("use harmonic minor for V and vii in minor keys", () => {
    const aMinor = diatonicChords(buildKey("A:minor")!);
    expect(aMinor.find(c => c.numeral === "V7")).toMatchObject({ root: "E", type: "7" });
    expect(aMinor.find(c => c.numeral === "vii°7")).toMatchObject({ root: "G#", type: "dim7" });
    expect(aMinor.find(c => c.numeral === "III")).toMatchObject({ root: "C", type: "M" });
  });
});

describe("makeRomanPrompt", () => {
  it("uses the selected key and only the allowed chord types", () => {
    const key = buildKey("G:major");
    const seen = new Set<string>();
    let p: ChordPrompt | undefined;
    for (let i = 0; i < 300; i++) {
      p = makeRomanPrompt(Math.random, ["M", "maj7"], key, p);
      expect(p.roman).toMatchObject({ keyValue: "G:major", filterIgnored: false });
      seen.add(p.roman!.numeral);
    }
    expect([...seen].sort()).toEqual(["I", "IV", "IVmaj7", "Imaj7", "V"]);
  });

  it("picks a random key per prompt when none is selected", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 300; i++) keys.add(makeRomanPrompt(Math.random, ["M", "m"], null).roman!.keyValue);
    expect(keys.size).toBeGreaterThan(20);
  });

  it("falls back to any diatonic triad when no selected type occurs in the key, and says so", () => {
    const p = makeRomanPrompt(Math.random, ["aug", "sus4"], buildKey("C:major"));
    expect(p.roman?.filterIgnored).toBe(true);
    expect(["M", "m", "dim"]).toContain(p.type);
  });

  it("does not repeat the same chord", () => {
    // first pick: V in C major (index 4 of 7 triads), then I
    const prev: ChordPrompt = { rootPc: 7, root: "G", type: "M" };
    const p = makeRomanPrompt(seq(4.5 / 7, 0.5 / 7), ["M", "m", "dim"], buildKey("C:major"), prev);
    expect(p.roman?.numeral).toBe("I");
  });
});

describe("Roman prompt display", () => {
  const V7inG = makeRomanPrompt(seq(0.5), ["7"], buildKey("G:major"));   // V7 is the only dominant 7th in G

  it("shows the numeral and the key, and reveals the chord when answered", () => {
    expect(V7inG).toMatchObject({ root: "D", type: "7", roman: { numeral: "V7" } });
    const s = initialChordPractice(V7inG);
    const d = chordPracticeDisplay(s, null);
    expect(d.promptHtml).toBe('V<span class="ext">7</span>');
    expect(d.sub).toBe("in G major");
    const done = reduceChordPractice(s, { type: "held", notes: [50, 54, 57, 60] });
    expect(chordPracticeDisplay(done, null).feedback).toBe("✓ D7");
  });

  it("names a wrong chord with its numeral in the prompt's key", () => {
    let s = initialChordPractice(V7inG);
    s = reduceChordPractice(s, { type: "held", notes: [48, 52, 55] });     // C major = IV in G
    s = reduceChordPractice(s, { type: "held", notes: [] });
    expect(chordPracticeDisplay(s, null).feedback).toMatch(/^✗ That was C \(IV\)\. /);
  });

  it("prompt style is a setting", () => {
    const s = createAppState();
    expect(s.settings.promptStyle).toBe("names");
    const t = reduceApp(s, { type: "setPromptStyle", style: "roman" });
    expect(t.settings.promptStyle).toBe("roman");
    expect(reduceApp(t, { type: "setPromptStyle", style: "roman" })).toBe(t);
  });
});
