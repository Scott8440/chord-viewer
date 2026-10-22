// Progression practice: progression data, prompts, judging chord by chord, and display.
import { describe, expect, it } from "vitest";
import {
  initialProgression, makeProgressionPrompt, progressionById, progressionChords, PROGRESSIONS, progressionsWhere,
  reduceProgression, type ProgressionAction, type ProgressionPrompt, type ProgressionState,
} from "../src/exercises/progressions";
import { analyze, buildKey, KEY_MAJORS, KEY_MINORS, matchTemplate, prettyAcc, templateById } from "../src/theory";
import { progressionDisplay } from "../src/views/practice";

const held = (...notes: number[]): ProgressionAction => ({ type: "held", notes });
const run = (s: ProgressionState, ...actions: ProgressionAction[]) => actions.reduce(reduceProgression, s);
const prompt = (id: string, keyValue: string): ProgressionPrompt => {
  const def = PROGRESSIONS.find(p => p.id === id)!;
  return { id, name: def.name, keyValue, chords: progressionChords(def, buildKey(keyValue)!) };
};
/** Close root-position voicing of a chord prompt, from C3 up */
const voice = (c: { rootPc: number; type: string }) => {
  const m = matchTemplate([], c.rootPc, c.type);
  return [...m.missing, ...m.omitted].map(t => 48 + c.rootPc + t.pc).sort((a, b) => a - b);
};

const C = [48, 52, 55], F = [48, 53, 57], G = [47, 50, 55];   // C, F/C, G/B: common-tone voicings
const CIVVI = prompt("I-IV-V-I", "C:major");

describe("progression data", () => {
  it("every chord of every progression analyzes back to the same chord and numeral, in every key of its mode", () => {
    for (const def of PROGRESSIONS) {
      for (const tonic of def.mode === "major" ? KEY_MAJORS : KEY_MINORS) {
        const key = buildKey(tonic + ":" + def.mode)!;
        for (const c of progressionChords(def, key)) {
          const r = analyze(voice(c), key);
          expect(r?.text, `${def.id} in ${tonic} ${def.mode}`).toBe(c.root + templateById(c.type)!.symbol);
          expect(r?.roman, `${def.id} in ${tonic} ${def.mode}`).toBe(prettyAcc(c.roman!.numeral));
        }
      }
    }
  });

  it("spells chords from the key", () => {
    expect(prompt("ii-V-I", "Bb:major").chords.map(c => c.root)).toEqual(["C", "F", "Bb"]);
    expect(prompt("i-VII-VI-V", "A:minor").chords.map(c => c.root + templateById(c.type)!.symbol)).toEqual(["Am", "G", "F", "E"]);
  });

  it("has unique ids, positive weights and at least one tag each", () => {
    expect(new Set(PROGRESSIONS.map(p => p.id)).size).toBe(PROGRESSIONS.length);
    for (const p of PROGRESSIONS) {
      expect(p.weight, p.id).toBeGreaterThan(0);
      expect(p.tags.length, p.id).toBeGreaterThan(0);
    }
  });

  it("can be looked up by id, mode and tag", () => {
    expect(progressionById("ii-V-I")?.name).toBe("ii–V–I");
    expect(progressionById("nope")).toBeUndefined();
    expect(progressionsWhere({ mode: "minor" }).every(p => p.mode === "minor")).toBe(true);
    const jazz = progressionsWhere({ tag: "jazz" }).map(p => p.id);
    expect(jazz).toContain("ii7-V7-Imaj7");
    expect(jazz).not.toContain("I-V-vi-IV");
  });
});

describe("makeProgressionPrompt", () => {
  it("only uses progressions in the selected key's mode, in that key", () => {
    for (let i = 0; i < 200; i++) {
      const p = makeProgressionPrompt(Math.random, buildKey("D:minor"));
      expect(p.keyValue).toBe("D:minor");
      expect(progressionById(p.id)!.mode).toBe("minor");
    }
  });

  it("picks a random key of the progression's mode when none is selected", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const p = makeProgressionPrompt(Math.random, null);
      expect(p.keyValue.endsWith(":" + progressionById(p.id)!.mode)).toBe(true);
      keys.add(p.keyValue);
    }
    expect(keys.size).toBeGreaterThan(15);
  });

  it("asks for common progressions more often, in proportion to their weight", () => {
    const counts = new Map<string, number>();
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const id = makeProgressionPrompt(Math.random, buildKey("C:major")).id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const major = progressionsWhere({ mode: "major" });
    const total = major.reduce((sum, p) => sum + p.weight, 0);
    for (const p of major) expect(counts.get(p.id)! / N, p.id).toBeCloseTo(p.weight / total, 1);
    expect(counts.get("I-V-vi-IV")!).toBeGreaterThan(2 * counts.get("circle")!);
  });

  it("can draw from a smaller pool, e.g. by tag", () => {
    for (let i = 0; i < 50; i++) {
      const p = makeProgressionPrompt(Math.random, buildKey("C:major"), undefined, progressionsWhere({ tag: "jazz" }));
      expect(progressionById(p.id)!.tags).toContain("jazz");
    }
  });

  it("does not repeat the same progression in the same key", () => {
    const pool = progressionsWhere({ mode: "major" }).filter(p => p.id === "ii-V-I" || p.id === "I-IV-V-I");
    const prev = prompt("ii-V-I", "C:major");
    for (let i = 0; i < 50; i++) expect(makeProgressionPrompt(Math.random, buildKey("C:major"), prev, pool).id).toBe("I-IV-V-I");
  });
});

describe("reduceProgression", () => {
  it("steps through the chords, one at a time", () => {
    let s = run(initialProgression(CIVVI), held(...C));
    expect(s).toMatchObject({ index: 1, status: "playing", chordsAnswered: 1, chordsFirstTry: 1 });
    s = run(s, held(), held(...F), held(), held(...G), held(), held(...C));
    expect(s).toMatchObject({ index: 4, status: "done", chordsAnswered: 4, chordsFirstTry: 4, completed: 1 });
  });

  it("accepts legato: common tones held, without lifting every key", () => {
    // C E G -> keep C, E->F, G->A (F/C) -> C->B, F->D, A->G (G/B) -> back to C
    const s = run(initialProgression(CIVVI), held(48, 52, 55), held(48, 55), held(48, 53, 55), held(48, 53, 57),
                  held(53, 57), held(47, 53, 57), held(47, 50, 57), held(47, 50, 55), held(48, 50, 55), held(48, 52, 55));
    expect(s).toMatchObject({ status: "done", chordsFirstTry: 4 });
  });

  it("does not count letting go of the last chord as a wrong attempt", () => {
    const s = run(initialProgression(CIVVI), held(...C), held(48, 52), held(48), held());
    expect(s).toMatchObject({ index: 1, status: "playing", missed: false, attempt: null });
  });

  it("judges a wrong attempt when keys are pressed and then all released", () => {
    let s = run(initialProgression(CIVVI), held(...C), held(), held(50, 53, 57), held());   // Dm instead of F
    expect(s).toMatchObject({ index: 1, status: "wrong", attempt: [50, 53, 57], missed: true });
    s = run(s, held(...F));
    expect(s).toMatchObject({ index: 2, status: "playing", chordsAnswered: 2, chordsFirstTry: 1 });
  });

  it("ignores input once done, and keeps the score for the next progression", () => {
    let s = run(initialProgression(CIVVI), held(...C), held(), held(...F), held(), held(...G), held(), held(...C));
    expect(run(s, held(), held(50, 53, 57), held())).toMatchObject({ status: "done", missed: false });
    s = run(s, { type: "next", prompt: prompt("ii-V-I", "C:major") });
    expect(s).toMatchObject({ index: 0, status: "playing", chordsAnswered: 4, completed: 1 });
    // The keys still held from the last chord (C) are not a new attempt
    expect(run(s, held())).toMatchObject({ status: "playing", missed: false });
  });

  it("needs a re-strike when the next progression starts with the chord still held", () => {
    let s = run(initialProgression(CIVVI), held(...C), held(), held(...F), held(), held(...G), held(), held(...C));
    s = run(s, { type: "next", prompt: prompt("I-V-vi-IV", "C:major") });
    expect(s.index).toBe(0);                       // holding C does not count until played again
    s = run(s, held(), held(...C));
    expect(s.index).toBe(1);
  });
});

describe("progressionDisplay", () => {
  it("shows the row, marks progress, and reveals the other notation for played chords", () => {
    const s = run(initialProgression(prompt("ii-V-I", "Bb:major")), held(48, 51, 55));   // Cm
    const roman = progressionDisplay(s, "roman");
    expect(roman.sub).toBe("ii–V–I in B♭ major");
    expect(roman.promptHtml).toMatch(/^<span class="step done"><span class="main">ii<\/span><span class="other">Cm<\/span>/);
    expect(roman.promptHtml).toContain('<span class="step current"><span class="main">V</span><span class="other">&nbsp;</span>');
    expect(roman.promptHtml).toContain('<span class="step upcoming"><span class="main">I</span>');
    const names = progressionDisplay(s, "names");
    expect(names.promptHtml).toMatch(/^<span class="step done"><span class="main">Cm<\/span><span class="other">ii<\/span>/);
    expect(names.score).toBe("1 / 1 chords right first time");
  });

  it("gives chord feedback for the current chord, and a finish message", () => {
    let s = run(initialProgression(CIVVI), held(...C), held(), held(48, 52, 57), held());   // Am/C instead of F
    expect(progressionDisplay(s, "roman").feedback).toBe("✗ That was Am/C (vi). Replace E with F");
    s = run(s, held(...F), held(), held(...G), held(), held(...C));
    expect(progressionDisplay(s, "roman")).toMatchObject({ status: "correct", feedback: "✓ Progression complete",
                                                          score: "3 / 4 chords right first time · 1 progression" });
  });
});
