// Theory quiz, key relationships on the circle of fifths: questions on a key's neighbours, signatures and chains of
// dominants.
import { describe, expect, it } from "vitest";
import {
  answersOf,
  DEFAULT_CIRCLE_QUIZ,
  degreePlace,
  initialCircleQuiz,
  keyAtSlot,
  makeCirclePrompt,
  placeId,
  reduceCircleQuiz,
  ringKeys,
  sanitizeCircleQuizOptions,
  slotOf,
  type CirclePrompt,
  type Place,
} from "../src/exercises/circleQuiz";
import { buildKey, chromaOf, keySignature } from "../src/theory";
import { circleQuizDisplay } from "../src/views/practice";

const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const name = (p: Place) => ringKeys(p.ring)[p.key] + (p.ring === "minor" ? "m" : "");
const major = (tonic: string): Place => ({ ring: "major", key: ringKeys("major").indexOf(tonic) });
const minor = (tonic: string): Place => ({ ring: "minor", key: ringKeys("minor").indexOf(tonic) });

describe("key relationships on the circle of fifths", () => {
  it("knows each key's diatonic neighbours", () => {
    const bb = major("Bb");
    expect(name(degreePlace(bb, "V"))).toBe("F");
    expect(name(degreePlace(bb, "IV"))).toBe("Eb");
    expect(name(degreePlace(bb, "vi"))).toBe("Gm");
    expect(name(degreePlace(bb, "ii"))).toBe("Cm");
    expect(name(degreePlace(bb, "iii"))).toBe("Dm");
    const e = minor("E");
    expect(name(degreePlace(e, "v"))).toBe("Bm");
    expect(name(degreePlace(e, "iv"))).toBe("Am");
    expect(name(degreePlace(e, "III"))).toBe("G");
    expect(name(degreePlace(e, "VI"))).toBe("C");
    expect(name(degreePlace(e, "VII"))).toBe("D");
  });

  it("closely related keys: the five that share six or all seven of the key's notes", () => {
    const p: CirclePrompt = { kind: "related", rotation: 0, ref: major("D") };
    expect(answersOf(p).map(name).sort()).toEqual(["A", "Bm", "Em", "F#m", "G"]);
    const scale = (pl: Place) => new Set(buildKey(`${ringKeys(pl.ring)[pl.key]}:${pl.ring}`)!.scale.map(chromaOf));
    const d = scale(major("D"));
    const shared = answersOf(p).map(k => [...scale(k)].filter(n => d.has(n)).length);
    expect(shared.sort()).toEqual([6, 6, 6, 6, 7]); // the relative minor has all seven
  });

  it("degree: answered only by playing; picking on the circle does nothing; a wrong note counts once", () => {
    let s = initialCircleQuiz({ kind: "degree", rotation: 3, ref: major("Bb"), degree: "V" });
    s = reduceCircleQuiz(s, { type: "place", place: major("F") }); // the right place, but picked
    expect(s.status).toBe("waiting");
    s = reduceCircleQuiz(s, { type: "play", note: 51 }); // E♭
    s = reduceCircleQuiz(s, { type: "play", note: 63 }); // E♭ again, an octave up
    expect(s).toMatchObject({ status: "wrong", tried: [placeId(major("Eb"))] });
    s = reduceCircleQuiz(s, { type: "play", note: 53 }); // F3
    expect(s).toMatchObject({ status: "correct", firstTry: 0, answered: 1 });
    // A minor answer by its tonic: the ii of B♭ is C minor
    let ii = initialCircleQuiz({ kind: "degree", rotation: 0, ref: major("Bb"), degree: "ii" });
    ii = reduceCircleQuiz(ii, { type: "play", note: 48 });
    expect(ii.status).toBe("correct");
  });

  it("related: all five tonics played, in any order; picking on the circle does nothing", () => {
    let s = initialCircleQuiz({ kind: "related", rotation: 0, ref: major("D") });
    s = reduceCircleQuiz(s, { type: "place", place: major("G") });
    expect(s.found).toEqual([]);
    for (const note of [67, 71, 57, 64]) {
      // G, B (B minor), A, E (E minor)
      s = reduceCircleQuiz(s, { type: "play", note });
      expect(s.status).toBe("waiting");
    }
    s = reduceCircleQuiz(s, { type: "play", note: 66 }); // F♯: F♯ minor, the one left
    expect(s).toMatchObject({ status: "correct", firstTry: 1 });
    expect(s.found).toHaveLength(5);
  });

  it("spells a key's neighbours from its side of the circle", () => {
    const answer = (ref: Place, degree: Parameters<typeof degreePlace>[1]) => {
      const tonic = (pl: Place) => ringKeys(pl.ring)[pl.key];
      let s = initialCircleQuiz({ kind: "degree", rotation: 0, ref, degree });
      s = reduceCircleQuiz(s, { type: "play", note: 60 + chromaOf(tonic(degreePlace(ref, degree))) });
      return circleQuizDisplay(s).feedback;
    };
    expect(answer(major("Db"), "IV")).toMatch(/^✓ G♭ major /);
    expect(answer(major("F#"), "V")).toMatch(/^✓ C♯ major /);
    expect(answer(major("F#"), "iii")).toMatch(/^✓ A♯ minor /);
    expect(answer(minor("Eb"), "VI")).toMatch(/^✓ C♭ major /);
    expect(answer(minor("Eb"), "iv")).toMatch(/^✓ A♭ minor /);
    let related = initialCircleQuiz({ kind: "related", rotation: 0, ref: major("Db") });
    for (const n of [66, 68, 70, 63, 65]) related = reduceCircleQuiz(related, { type: "play", note: n });
    expect(circleQuizDisplay(related).feedback).toBe("✓ A♭, G♭, B♭m, E♭m, Fm: the keys around D♭");
  });

  it("signature: the key asked for, on its ring", () => {
    let s = initialCircleQuiz({ kind: "signature", rotation: 0, answer: minor("C") });
    s = reduceCircleQuiz(s, { type: "place", place: major("Eb") }); // same signature, but a major key
    expect(s.status).toBe("wrong");
    s = reduceCircleQuiz(s, { type: "place", place: minor("C") });
    expect(s.status).toBe("correct");
  });

  it("chain: the chords between the first and the tonic, in order, from the board or played", () => {
    const e7toC = ["E", "A", "D", "G", "C"].map(t => ringKeys("major").indexOf(t));
    let s = initialCircleQuiz({ kind: "chain", rotation: 0, chords: e7toC, choices: [] });
    expect(answersOf(s.prompt).map(name)).toEqual(["A", "D", "G"]);
    s = reduceCircleQuiz(s, { type: "chord", key: ringKeys("major").indexOf("D") }); // out of order
    expect(s).toMatchObject({ status: "wrong", tried: [placeId(major("D"))] });
    s = reduceCircleQuiz(s, { type: "chord", key: ringKeys("major").indexOf("A") });
    s = reduceCircleQuiz(s, { type: "play", note: 62 }); // D
    expect(s).toMatchObject({ status: "waiting", found: [placeId(major("A")), placeId(major("D"))], tried: [] });
    s = reduceCircleQuiz(s, { type: "place", place: major("G") }); // the circle isn't how a chain is answered
    expect(s.found).toHaveLength(2);
    s = reduceCircleQuiz(s, { type: "chord", key: ringKeys("major").indexOf("G") });
    expect(s.status).toBe("correct");
  });

  it("makes questions of the kind chosen, chains a fifth apart down to the tonic, never the same key twice running", () => {
    const rng = seeded(7);
    let p = makeCirclePrompt(rng, DEFAULT_CIRCLE_QUIZ);
    const kinds = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const next = makeCirclePrompt(rng, DEFAULT_CIRCLE_QUIZ, p);
      kinds.add(next.kind);
      if ("ref" in next && "ref" in p) expect(placeId(next.ref)).not.toBe(placeId(p.ref));
      if (next.kind === "chain") {
        expect(next.chords.length).toBeGreaterThanOrEqual(4);
        for (let j = 1; j < next.chords.length; j++)
          expect(
            (chromaOf(ringKeys("major")[next.chords[j - 1]]) - chromaOf(ringKeys("major")[next.chords[j]]) + 12) % 12,
          ).toBe(7);
        expect([...next.choices].sort((a, b) => a - b)).toEqual([...Array(12).keys()]);
      }
      p = next;
    }
    expect(kinds).toEqual(new Set(["degree", "related", "signature", "chain"]));
    for (const asks of ["degree", "related", "signature", "chain"] as const)
      expect(makeCirclePrompt(rng, { asks }).kind).toBe(asks);
  });

  it("signatures on the circle match the key's own", () => {
    // Each step clockwise from C adds a sharp (or takes away a flat)
    for (let k = 0; k < 12; k++) {
      const sig = keySignature(buildKey(`${ringKeys("major")[k]}:major`)!);
      const sharps = sig.accidental === "#" ? sig.count : -sig.count;
      expect(((sharps % 12) + 12) % 12).toBe(k);
    }
  });

  it("turns the circle: slots and keys map both ways", () => {
    for (let r = 0; r < 12; r++) for (let k = 0; k < 12; k++) expect(keyAtSlot(slotOf(k, r), r)).toBe(k);
  });

  it("falls back on the defaults for anything not offered (including the old ring and question options)", () => {
    expect(sanitizeCircleQuizOptions(undefined)).toEqual(DEFAULT_CIRCLE_QUIZ);
    expect(sanitizeCircleQuizOptions({ ring: "minor", asks: "where" })).toEqual(DEFAULT_CIRCLE_QUIZ);
    expect(sanitizeCircleQuizOptions({ asks: "chain" })).toEqual({ asks: "chain" });
  });
});
