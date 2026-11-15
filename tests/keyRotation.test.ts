// Key rotation, shared by the drills with a key option; and the judging state their reducers share.
import { describe, expect, it } from "vitest";
import { pickChordKey } from "../src/exercises/chordPractice";
import { pickTonic } from "../src/exercises/earTraining";
import { answeredRight, answeredWrong, movedOn, type Judged } from "../src/exercises/judging";
import {
  countInKey, keyRotation, pickKey, PROMPTS_PER_KEY, randomKey, rotateKey, type KeyRotation,
} from "../src/exercises/keyRotation";
import { pickReadingKey } from "../src/exercises/sightReading";
import { KEY_MAJORS } from "../src/theory";

const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe("picking a key", () => {
  it("keeps a fixed choice and never picks the previous key at random", () => {
    expect(pickKey(seq(0.5), "Ab", KEY_MAJORS, "Ab")).toBe("Ab");
    expect(randomKey(seq(0, 0.99), KEY_MAJORS, "C")).toBe("B");
    expect(randomKey(seq(0), KEY_MAJORS)).toBe("C");
    for (let i = 0; i < 50; i++) expect(pickKey(Math.random, "random", ["C", "G"], "C")).toBe("G");
  });

  it("each drill keeps its own keys and choices", () => {
    expect(KEY_MAJORS).toContain(pickTonic(Math.random, "random"));
    expect(pickTonic(Math.random, "random")).not.toContain(":");
    expect(pickReadingKey(seq(0.99), "random")).toBe("B:minor");
    expect(pickChordKey(seq(0.5), "none", "C:major")).toBeNull();
    expect(pickChordKey(seq(0, 0.5), "random", null)).toBe("C:major");
  });
});

describe("rotating keys", () => {
  const pick = (choice: string, previous: string) => choice === "random" ? previous + "'" : choice;
  /** Prompts asked one after another from a fresh start, as the modes do: the first prompt counts too */
  function run(choice: string, prompts: number): KeyRotation<string>[] {
    let r = keyRotation("C");
    const out: KeyRotation<string>[] = [];
    for (let i = 0; i < prompts; i++) out.push(r = rotateKey(r, choice, pick));
    return out;
  }

  it("moves on every PROMPTS_PER_KEY prompts with a random choice", () => {
    const keys = run("random", PROMPTS_PER_KEY * 2 + 1).map(r => r.key);
    expect(keys.slice(0, PROMPTS_PER_KEY)).toEqual(Array(PROMPTS_PER_KEY).fill("C"));
    expect(keys.slice(PROMPTS_PER_KEY, PROMPTS_PER_KEY * 2)).toEqual(Array(PROMPTS_PER_KEY).fill("C'"));
    expect(keys[PROMPTS_PER_KEY * 2]).toBe("C''");
    expect(run("random", PROMPTS_PER_KEY + 1)[PROMPTS_PER_KEY]).toEqual({ key: "C'", inKey: 1 });
  });

  it("stays put with a fixed key, however many prompts", () => {
    const r = run("C", PROMPTS_PER_KEY * 3);
    expect(r.every(x => x.key === "C")).toBe(true);
    expect(r[r.length - 1].inKey).toBe(PROMPTS_PER_KEY * 3);
  });

  it("counts a prompt without moving on, and starts afresh in a new key", () => {
    const full = { key: "C", inKey: PROMPTS_PER_KEY };
    expect(countInKey(full)).toEqual({ key: "C", inKey: PROMPTS_PER_KEY + 1 });
    expect(keyRotation("G")).toEqual({ key: "G", inKey: 0 });
    // Chord practice's "none" is a key of null, and never moves
    expect(rotateKey(keyRotation<string | null>(null), "none", () => "D")).toEqual({ key: null, inKey: 1 });
  });
});

describe("the shared judging state", () => {
  interface S extends Judged<string> { extra: number }
  const s: S = { prompt: "a", status: "waiting", missed: false, answered: 3, firstTry: 2, extra: 1 };

  it("counts a right answer, right first time unless missed", () => {
    expect(answeredRight(s, { extra: 5 })).toEqual({ ...s, status: "correct", answered: 4, firstTry: 3, extra: 5 });
    const missed = answeredWrong(s);
    expect(missed).toEqual({ ...s, status: "wrong", missed: true });
    expect(answeredRight(missed)).toMatchObject({ status: "correct", answered: 4, firstTry: 2 });
  });

  it("moves on: a skip counts as answered unless it already was", () => {
    const wrong = answeredWrong(s, { extra: 9 });
    expect(movedOn(wrong, { type: "next", prompt: "b" }, { extra: 0 }))
      .toEqual({ ...s, prompt: "b", status: "waiting", missed: false, extra: 0 });
    expect(movedOn(wrong, { type: "skip", prompt: "b" })).toMatchObject({ prompt: "b", answered: 4, firstTry: 2, extra: 9 });
    expect(movedOn(answeredRight(s), { type: "skip", prompt: "b" })).toMatchObject({ answered: 4, firstTry: 3 });
  });
});
