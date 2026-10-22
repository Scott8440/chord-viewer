// Note practice exercise: prompts and judging.
import { describe, expect, it } from "vitest";
import { initialNotePractice, makeNotePrompt, reduceNotePractice, type NotePrompt } from "../src/exercises/notePractice";
import { createAppState, reduceApp } from "../src/state/app";
import { buildKey } from "../src/theory";

/** Deterministic rng that returns the given values in turn */
const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };
const fSharp: NotePrompt = { pc: 6, name: "F#" };

describe("makeNotePrompt", () => {
  it("picks a pitch class and spells black keys as a sharp or flat when there is no key", () => {
    expect(makeNotePrompt(seq(6 / 12, 0.2), null)).toEqual({ pc: 6, name: "F#" });
    expect(makeNotePrompt(seq(6 / 12, 0.8), null)).toEqual({ pc: 6, name: "Gb" });
    expect(makeNotePrompt(seq(0, 0.8), null)).toEqual({ pc: 0, name: "C" });
  });

  it("spells from the key when one is set", () => {
    expect(makeNotePrompt(seq(10 / 12), buildKey("F:major")).name).toBe("Bb");
    expect(makeNotePrompt(seq(6 / 12), buildKey("D:major")).name).toBe("F#");
  });

  it("never repeats the previous note", () => {
    const p = makeNotePrompt(seq(6 / 12, 6 / 12, 2 / 12, 0.5), null, fSharp);
    expect(p.pc).toBe(2);
  });

  it("covers all 12 notes over time", () => {
    const seen = new Set<number>();
    let prompt: NotePrompt | undefined;
    for (let i = 0; i < 500; i++) { prompt = makeNotePrompt(Math.random, null, prompt); seen.add(prompt.pc); }
    expect(seen.size).toBe(12);
  });
});

describe("reduceNotePractice", () => {
  it("accepts the right note in any octave, first try", () => {
    const s = reduceNotePractice(initialNotePractice(fSharp), { type: "play", note: 30 });   // F#1
    expect(s).toMatchObject({ status: "correct", played: 30, answered: 1, firstTry: 1 });
  });

  it("marks a wrong note and lets the player try again, without first-try credit", () => {
    let s = reduceNotePractice(initialNotePractice(fSharp), { type: "play", note: 67 });     // G4
    expect(s).toMatchObject({ status: "wrong", played: 67, missed: true, answered: 0 });
    s = reduceNotePractice(s, { type: "play", note: 66 });
    expect(s).toMatchObject({ status: "correct", answered: 1, firstTry: 0 });
  });

  it("ignores notes after a correct answer until the next prompt", () => {
    const s = reduceNotePractice(initialNotePractice(fSharp), { type: "play", note: 66 });
    expect(reduceNotePractice(s, { type: "play", note: 60 })).toBe(s);
  });

  it("starts the next prompt fresh and keeps the score", () => {
    let s = reduceNotePractice(initialNotePractice(fSharp), { type: "play", note: 66 });
    s = reduceNotePractice(s, { type: "next", prompt: { pc: 0, name: "C" } });
    expect(s).toMatchObject({ prompt: { pc: 0 }, status: "waiting", played: null, missed: false, answered: 1, firstTry: 1 });
  });

  it("counts a skip as answered but not right first time", () => {
    const s = reduceNotePractice(initialNotePractice(fSharp), { type: "skip", prompt: { pc: 0, name: "C" } });
    expect(s).toMatchObject({ prompt: { pc: 0 }, status: "waiting", answered: 1, firstTry: 0 });
  });

  it("does not count a skip twice after a correct answer", () => {
    let s = reduceNotePractice(initialNotePractice(fSharp), { type: "play", note: 66 });
    s = reduceNotePractice(s, { type: "skip", prompt: { pc: 0, name: "C" } });
    expect(s).toMatchObject({ answered: 1, firstTry: 1 });
  });
});

describe("mode setting", () => {
  it("switches mode and ignores a switch to the same mode", () => {
    const s = createAppState();
    expect(s.settings.mode).toBe("free");
    const t = reduceApp(s, { type: "setMode", mode: "notes" });
    expect(t.settings.mode).toBe("notes");
    expect(reduceApp(t, { type: "setMode", mode: "notes" })).toBe(t);
  });
});
