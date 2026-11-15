// Moving an exercise on to the next key once a run is done.
import { describe, expect, it } from "vitest";
import { KEY_PROGRESSIONS, nextKey } from "../src/exercises/keyOrder";
import { sanitizeExerciseOptions } from "../src/exercises/prescriptive";
import { isKeyValue } from "../src/theory";

/** Twelve steps from C (or A minor), as tonics */
const walk = (start: string, p: (typeof KEY_PROGRESSIONS)[number]) => {
  const keys = [start];
  for (let i = 0; i < 12; i++) keys.push(nextKey(keys[keys.length - 1], p));
  return keys.map(k => k.split(":")[0]).join(" ");
};

describe("next key", () => {
  it("round the circle of fifths, either way, back to the start after twelve", () => {
    expect(walk("C:major", "circle-sharps")).toBe("C G D A E B F# Db Ab Eb Bb F C");
    expect(walk("C:major", "circle-flats")).toBe("C F Bb Eb Ab Db F# B E A D G C");
    expect(walk("A:minor", "circle-sharps")).toBe("A E B F# C# G# Eb Bb F C G D A");
  });

  it("chromatically, up or down, spelled as in the key lists", () => {
    expect(walk("C:major", "chromatic-up")).toBe("C Db D Eb E F F# G Ab A Bb B C");
    expect(walk("C:major", "chromatic-down")).toBe("C B Bb A Ab G F# F E Eb D Db C");
    expect(walk("A:minor", "chromatic-up")).toBe("A Bb B C C# D Eb E F F# G G# A");
  });

  it("minor keys stay minor, major stay major; same again stays put", () => {
    expect(nextKey("E:minor", "circle-sharps")).toBe("B:minor");
    expect(nextKey("G:major", "repeat")).toBe("G:major");
  });

  it("a random key: another key in the same mode, never the same one", () => {
    for (let i = 0; i < 200; i++) {
      const k = nextKey("D:minor", "random");
      expect(k).not.toBe("D:minor");
      expect(k.endsWith(":minor") && isKeyValue(k)).toBe(true);
    }
    expect(nextKey("C:major", "random", () => 0)).toBe("Db:major");
  });

  it("every progression from every key gives a key the pickers know", () => {
    for (const mode of ["major", "minor"]) for (const t of ["C", "Db", "C#", "F#", "G#", "Bb", "B"]) {
      const k = `${t}:${mode}`;
      if (!isKeyValue(k)) continue;
      for (const p of KEY_PROGRESSIONS) expect(isKeyValue(nextKey(k, p)), `${k} ${p}`).toBe(true);
    }
  });

  it("the option: round the circle by default, any known progression kept", () => {
    expect(sanitizeExerciseOptions({}).progression).toBe("circle-sharps");
    expect(sanitizeExerciseOptions({ progression: "random" }).progression).toBe("random");
    expect(sanitizeExerciseOptions({ progression: "sideways" }).progression).toBe("circle-sharps");
  });
});
