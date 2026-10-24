// Presenters for the drills: sight reading, chord and progression practice, and ear training.

import type { ChordPracticeState } from "../../exercises/chordPractice";
import type { PromptStyle } from "../../exercises/chordPrompt";
import { degreeName, type EarState, type MelodyState } from "../../exercises/earTraining";
import type { ProgressionState } from "../../exercises/progressions";
import { noteName, READING_RANGES, type ReadingPrompt } from "../../exercises/sightReading";
import { buildKey, chromaOf, prettyAcc, templateById, type KeyContext } from "../../theory";
import { chordSymbolHtml } from "../chordName";
import { esc } from "../html";
import { chordStepHtml, describeMiss, inversionName, romanHtml } from "./chords";
import { stepHtml } from "./steps";
import type { PracticeDisplay } from "./view";

const scoreText = (s: { answered: number; firstTry: number }) => s.answered ? `${s.firstTry} / ${s.answered} right first time` : "";

/** Sight reading: the notes are on the staff, so no prompt here; a wrong note is named, and an octave out says which
 *  way */
export function sightReadingDisplay(s: MelodyState<ReadingPrompt>): PracticeDisplay {
  const key = buildKey(s.prompt.keyValue)!;
  let feedback = "";
  if (s.status === "correct") feedback = "✓ " + s.prompt.notes.map(n => prettyAcc(n.name)).join(" ");
  else if (s.status === "wrong" && s.played != null) {
    const target = s.prompt.notes[s.index].note;
    feedback = s.played % 12 === target % 12
      ? `✗ Right note, wrong octave: ${s.played < target ? "too low" : "too high"}`
      : `✗ That was ${prettyAcc(noteName(s.played, key))}. Try again`;
  }
  const n = s.prompt.notes.length;
  return {
    label: n === 1 ? "Play this note, at this pitch" : "Play these notes, left to right, at this pitch",
    promptHtml: "", size: "note",
    sub: `${prettyAcc(key.label)} · ${READING_RANGES[s.prompt.range].label.toLowerCase()} · note ${Math.min(s.index + 1, n)} of ${n}`,
    status: s.status, feedback, score: s.answered ? `${s.firstTry} / ${s.answered} lines right first time` : "",
  };
}

/** Browsers start audio only after a click or key press on the page (a MIDI note doesn't count) */
const SOUND_WAITING = "Click anywhere or press a computer key to start";

/** Ear training: the degree circle is the display (its pings say right or wrong), so no prompt and no feedback here:
 *  just the instruction, the score and, while stopped or waiting for audio, how to start */
export function earDisplay(s: EarState, soundBlocked: boolean, running: boolean): PracticeDisplay {
  const base = { promptHtml: "", size: "note", status: "waiting", feedback: "", score: scoreText(s) } as const;
  if (!running) {
    return {
      ...base, label: soundBlocked ? "Ready" : "Stopped",
      sub: soundBlocked ? SOUND_WAITING : "Press Start to hear the note again", stopLabel: "Start",
    };
  }
  return {
    ...base, label: "Play the degree you hear over the drone, in any octave, or press it (1–7)",
    sub: soundBlocked ? SOUND_WAITING : "", stopLabel: "Stop",
  };
}

/** Ear-training melodies: a dot per note, green once played back, its degree revealed underneath (the root's from
 *  the start) */
export function earMelodyDisplay(s: MelodyState, degrees: readonly string[], soundBlocked: boolean, running: boolean): PracticeDisplay {
  const key = buildKey(s.prompt.keyValue)!;
  const steps = s.prompt.notes.map((n, i) => stepHtml(
    i < s.index ? "done" : i === s.index && running ? "current" : "upcoming", "•",
    i < s.index || i === 0 ? esc(prettyAcc(n.degree)) : ""));
  const promptHtml = `<div class="seqRow">${steps.join("")}</div>`;
  if (!running) {
    return {
      label: soundBlocked ? "Ready" : "Stopped", promptHtml, size: "sequence",
      sub: soundBlocked ? SOUND_WAITING : "Press Start to hear the melody again",
      status: "waiting", feedback: "", score: scoreText(s), stopLabel: "Start",
    };
  }
  let feedback = "";
  if (s.status === "correct") feedback = "✓ " + s.prompt.notes.map(n => prettyAcc(n.name)).join(" ");
  else if (s.status === "wrong" && s.played != null) {
    const pc = s.played % 12, target = s.prompt.notes[s.index].note;
    feedback = pc === target % 12
      ? `✗ Right note, wrong octave: ${s.played < target ? "too low" : "too high"}`
      : `✗ That was ${prettyAcc(degreeName(pc - chromaOf(key.tonic)))} (${prettyAcc(key.spell[pc])}). Listen again`;
  }
  const n = s.prompt.notes.length - 1;
  return {
    label: "Play it back from the root, in order, at the same pitch",
    promptHtml, size: "sequence",
    sub: soundBlocked ? "Click anywhere or press a computer key to start the sound"
      : `Root ${prettyAcc(key.tonic)} + ${n} notes · degrees ${degrees.map(prettyAcc).join(", ")}`,
    status: s.status, feedback, score: scoreText(s), stopLabel: "Stop",
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
  // A chord name drawn from a key says which
  const keyText = s.prompt.inKey && key ? ` · in ${prettyAcc(key.label)}` +
    (s.prompt.inKey.filterIgnored ? " · no selected chord type is in this key, so any triad" : "") : "";
  return {
    label: inv ? "Play this chord, with this note in the bass" : "Play this chord, any voicing or inversion",
    promptHtml: roman ? romanHtml(roman.numeral, inv?.number) : chordSymbolHtml(s.prompt.root, t.symbol, slash),
    size: "chord",
    sub: roman
      ? `in ${prettyAcc(promptKey!.label)}${invText}` + (roman.filterIgnored ? " · no selected chord type is in this key, so any triad" : "")
      : prettyAcc(`${s.prompt.root} ${t.name}`) + invText + keyText,
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
