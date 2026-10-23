// Presenters for the drills: note, chord and progression practice.

import type { ChordPracticeState } from "../../exercises/chordPractice";
import type { PromptStyle } from "../../exercises/chordPrompt";
import type { NotePracticeState } from "../../exercises/notePractice";
import type { ProgressionState } from "../../exercises/progressions";
import { buildKey, FLAT, prettyAcc, SHARP, templateById, type KeyContext } from "../../theory";
import { chordSymbolHtml } from "../chordName";
import { esc } from "../html";
import { chordStepHtml, describeMiss, inversionName, romanHtml } from "./chords";
import type { PracticeDisplay } from "./view";

const scoreText = (s: { answered: number; firstTry: number }) => s.answered ? `${s.firstTry} / ${s.answered} right first time` : "";

export function notePracticeDisplay(s: NotePracticeState, key: KeyContext | null): PracticeDisplay {
  let feedback = "";
  if (s.status === "correct") feedback = "✓ Correct";
  else if (s.status === "wrong" && s.played != null) {
    // Spell the wrong note the same way the prompt is spelled
    const pc = s.played % 12;
    const name = key ? key.spell[pc] : (s.prompt.name.includes("b") ? FLAT : SHARP)[pc];
    feedback = `✗ That was ${prettyAcc(name)} — try again`;
  }
  return {
    label: "Play this note, in any octave", promptHtml: esc(prettyAcc(s.prompt.name)), size: "note", sub: "",
    status: s.status, feedback, score: scoreText(s),
  };
}

export function chordPracticeDisplay(s: ChordPracticeState, key: KeyContext | null): PracticeDisplay {
  const t = templateById(s.prompt.type)!;
  const roman = s.prompt.roman;
  // A Roman numeral prompt carries its own key (a random one when none is selected)
  const promptKey = roman ? buildKey(roman.keyValue) : key;
  const inv = s.prompt.inversion;
  // Slash bass for inversions; root position has none
  const slash = inv && inv.number > 0 ? inv.bass : "";
  let feedback = "";
  if (s.status === "correct") feedback = roman ? `✓ ${prettyAcc(s.prompt.root + t.symbol + (slash ? "/" + slash : ""))}` : "✓ Correct";
  else if (s.status === "wrong" && s.attempt) feedback = "✗ " + describeMiss(s.prompt, s.attempt, promptKey);
  const invText = inv ? " · " + inversionName(inv.number) : "";
  return {
    label: inv ? "Play this chord, with this note in the bass" : "Play this chord, any voicing or inversion",
    promptHtml: roman ? romanHtml(roman.numeral, inv?.number) : chordSymbolHtml(s.prompt.root, t.symbol, slash),
    size: "chord",
    sub: roman
      ? `in ${prettyAcc(promptKey!.label)}${invText}` + (roman.filterIgnored ? " · no selected chord type is in this key, so any triad" : "")
      : prettyAcc(`${s.prompt.root} ${t.name}`) + invText,
    status: s.status, feedback, score: scoreText(s),
  };
}

export function progressionDisplay(s: ProgressionState, style: PromptStyle): PracticeDisplay {
  const key = buildKey(s.prompt.keyValue)!;
  const steps = s.prompt.chords.map((c, i) =>
    chordStepHtml(c, style, i < s.index ? "done" : i === s.index && s.status !== "done" ? "current" : "upcoming"));
  let feedback = "";
  if (s.status === "done") feedback = "✓ Progression complete";
  else if (s.status === "wrong" && s.attempt) feedback = "✗ " + describeMiss(s.prompt.chords[s.index], s.attempt, key);
  const score = s.chordsAnswered
    ? `${s.chordsFirstTry} / ${s.chordsAnswered} chords right first time` + (s.completed ? ` · ${s.completed} progression${s.completed > 1 ? "s" : ""}` : "")
    : "";
  return {
    label: "Play this progression, one chord at a time",
    promptHtml: steps.join('<span class="sep">–</span>'),
    size: "progression",
    sub: `${prettyAcc(s.prompt.name)} in ${prettyAcc(key.label)}`,
    status: s.status === "done" ? "correct" : s.status === "wrong" ? "wrong" : "waiting",
    feedback, score,
  };
}
