// Progression practice: progression data, prompts, judging chord by chord, and display.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESSIONS, initialProgression, makeProgressionPrompt, progressionChords, PROGRESSIONS, reduceProgression,
  sanitizeProgressions, type ProgressionAction, type ProgressionPrompt, type ProgressionState,
} from "../src/exercises/progressions";
import { createAppState, reduceApp } from "../src/state/app";
import { analyze, buildKey, KEY_MAJORS, KEY_MINORS, matchTemplate, prettyAcc, templateById } from "../src/theory";
import { progressionDisplay } from "../src/views/practice";

const held = (...notes: number[]): ProgressionAction => ({ type: "held", notes });
const run = (s: ProgressionState, ...actions: ProgressionAction[]) => actions.reduce(reduceProgression, s);
const prompt = (id: string, keyValue: string): ProgressionPrompt => {
  const def = PROGRESSIONS.find(p => p.id === id)!;
  return { id, name: def.name, keyValue, chords: progressionChords(def, buildKey(keyValue)!), filterIgnored: false };
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

  it("sanitizes the selection", () => {
    expect(sanitizeProgressions(["ii-V-I", "nope", "I-IV-V-I"])).toEqual(["I-IV-V-I", "ii-V-I"]);
    expect(sanitizeProgressions([])).toEqual([...DEFAULT_PROGRESSIONS]);
    expect(createAppState().settings.progressions).toEqual([...DEFAULT_PROGRESSIONS]);
    expect(reduceApp(createAppState(), { type: "setProgressions", ids: ["circle"] }).settings.progressions).toEqual(["circle"]);
  });
});

describe("makeProgressionPrompt", () => {
  it("only uses progressions in the selected key's mode", () => {
    for (let i = 0; i < 100; i++) {
      const p = makeProgressionPrompt(Math.random, DEFAULT_PROGRESSIONS, buildKey("D:minor"));
      expect(p).toMatchObject({ id: "i-iv-V-i", keyValue: "D:minor", filterIgnored: false });
    }
  });

  it("picks a random key of the right mode when none is selected", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = makeProgressionPrompt(Math.random, ["ii-V-I"], null);
      expect(p.keyValue).toMatch(/:major$/);
      keys.add(p.keyValue);
    }
    expect(keys.size).toBeGreaterThan(8);
  });

  it("falls back to any progression in the key's mode when none selected fits, and says so", () => {
    const p = makeProgressionPrompt(Math.random, ["ii-V-I"], buildKey("E:minor"));
    expect(p.filterIgnored).toBe(true);
    expect(PROGRESSIONS.find(d => d.id === p.id)!.mode).toBe("minor");
  });

  it("does not repeat the same progression in the same key", () => {
    const prev = prompt("ii-V-I", "C:major");
    for (let i = 0; i < 50; i++) {
      const p = makeProgressionPrompt(Math.random, ["ii-V-I", "I-IV-V-I"], buildKey("C:major"), prev);
      expect(p.id).toBe("I-IV-V-I");
    }
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
