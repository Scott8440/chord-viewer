// Judging a pitch class in any octave (used by ear training), and the mode setting.
import { describe, expect, it } from "vitest";
import { initialNotePractice, reduceNotePractice, type NotePrompt } from "../src/exercises/notePractice";

const fSharp: NotePrompt = { pc: 6, name: "F#" };

describe("reduceNotePractice", () => {
  it("accepts the right note in any octave, first try", () => {
    const s = reduceNotePractice(initialNotePractice(fSharp), { type: "play", note: 30 }); // F#1
    expect(s).toMatchObject({ status: "correct", played: 30, answered: 1, firstTry: 1 });
  });

  it("marks a wrong note and lets the player try again, without first-try credit", () => {
    let s = reduceNotePractice(initialNotePractice(fSharp), { type: "play", note: 67 }); // G4
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
    expect(s).toMatchObject({
      prompt: { pc: 0 },
      status: "waiting",
      played: null,
      missed: false,
      answered: 1,
      firstTry: 1,
    });
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
