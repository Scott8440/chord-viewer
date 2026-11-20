// Theory quiz, key signatures: naming the key a signature shows.
import { describe, expect, it } from "vitest";
import {
  initialKeySig,
  keySigChoices,
  makeKeySigPrompt,
  reduceKeySig,
  sanitizeKeySigOptions,
  signatureOf,
  signatureText,
  DEFAULT_KEY_SIG,
} from "../src/exercises/keySignatures";
import { buildKey, keySignature } from "../src/theory";

const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe("key signatures", () => {
  it("every key on offer has the signature the staff draws from it", () => {
    for (const mode of ["major", "minor"] as const)
      for (const k of keySigChoices(mode, 7)) {
        const drawn = keySignature(buildKey(k)!);
        expect(signatureOf(k), k).toEqual(drawn);
      }
    expect(keySigChoices("major", 7)).toHaveLength(15);
  });

  it("offers keys up to the chosen number of sharps or flats", () => {
    expect(keySigChoices("major", 3)).toEqual([
      "C:major",
      "G:major",
      "D:major",
      "A:major",
      "F:major",
      "Bb:major",
      "Eb:major",
    ]);
    expect(keySigChoices("minor", 1)).toEqual(["A:minor", "E:minor", "D:minor"]);
  });

  it("asks for the mode chosen, and never the same signature twice in a row", () => {
    const rng = seeded(4);
    let p = makeKeySigPrompt(rng, { keys: "both", most: 3 });
    const modes = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const next = makeKeySigPrompt(rng, { keys: "both", most: 3 }, p);
      expect(signatureOf(next.keyValue)).not.toEqual(signatureOf(p.keyValue));
      expect(next.keyValue.endsWith(`:${next.mode}`)).toBe(true);
      expect(signatureOf(next.keyValue).count).toBeLessThanOrEqual(3);
      modes.add(next.mode);
      p = next;
    }
    expect(modes).toEqual(new Set(["major", "minor"]));
    expect(makeKeySigPrompt(rng, { keys: "minor", most: 7 }).mode).toBe("minor");
  });

  it("offers every key on offer, in a new random order each time, so the order gives nothing away", () => {
    const rng = seeded(9);
    const orders = new Set<string>();
    let p = makeKeySigPrompt(rng, { keys: "major", most: 7 });
    for (let i = 0; i < 10; i++) {
      expect([...p.choices].sort()).toEqual(keySigChoices("major", 7).sort());
      orders.add(p.choices.join());
      p = makeKeySigPrompt(rng, { keys: "major", most: 7 }, p);
    }
    expect(orders.size).toBeGreaterThan(5);
    expect(orders.has(keySigChoices("major", 7).join())).toBe(false);
  });

  it("is answered by the key or by playing its tonic in any octave; a wrong key counts once", () => {
    let s = initialKeySig({ keyValue: "Eb:major", mode: "major", choices: [] });
    s = reduceKeySig(s, { type: "answer", keyValue: "Bb:major" });
    s = reduceKeySig(s, { type: "answer", keyValue: "Bb:major" });
    expect(s).toMatchObject({ status: "wrong", missed: true, tried: ["Bb:major"] });
    s = reduceKeySig(s, { type: "play", note: 39 }); // E♭2
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 0 });
    s = reduceKeySig(s, { type: "next", prompt: { keyValue: "E:minor", mode: "minor", choices: [] } });
    expect(s).toMatchObject({ status: "waiting", tried: [] });
    s = reduceKeySig(s, { type: "answer", keyValue: "E:minor" });
    expect(s).toMatchObject({ status: "correct", answered: 2, firstTry: 1 });
  });

  it("names a signature's accidentals in order", () => {
    expect(signatureText(signatureOf("C:major"))).toBe("no sharps or flats");
    expect(signatureText(signatureOf("D:major"))).toBe("2 sharps (F# C#)");
    expect(signatureText(signatureOf("C:minor"))).toBe("3 flats (Bb Eb Ab)");
  });

  it("falls back on the defaults for anything not offered", () => {
    expect(sanitizeKeySigOptions(undefined)).toEqual(DEFAULT_KEY_SIG);
    expect(sanitizeKeySigOptions({ keys: "lydian", most: 4 })).toEqual(DEFAULT_KEY_SIG);
    expect(sanitizeKeySigOptions({ keys: "both", most: 3 })).toEqual({ keys: "both", most: 3 });
  });
});
