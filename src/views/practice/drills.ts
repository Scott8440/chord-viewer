// Presenters for the drills: sight reading, chord and progression practice, and ear training.

import type { ChordPracticeState } from "../../exercises/chordPractice";
import type { PromptStyle } from "../../exercises/chordPrompt";
import { answerOrder, qualityLabel, type ChordEarState } from "../../exercises/chordEar";
import { degreeName, type EarState, type MelodyState } from "../../exercises/earTraining";
import type { ProgressionState } from "../../exercises/progressions";
import { noteName, READING_PARTS, READING_RANGES, type ReadingState } from "../../exercises/sightReading";
import { chromaOf, prettyAcc, requireKey, requireTemplate, templateById, type KeyContext } from "../../theory";
import { chordSymbolHtml } from "../chordName";
import { esc } from "../html";
import { chordStepHtml, describeMiss, inversionName, romanHtml } from "./chords";
import { stepHtml } from "./steps";
import type { AnswerBox } from "../answerBoard";
import type { PracticeDisplay } from "./view";

const scoreText = (s: { answered: number; firstTry: number }) =>
  s.answered ? `${s.firstTry} / ${s.answered} right first time` : "";

/** A key with its relative: a song moved to a signature may be in either */
const withRelative = (k: KeyContext) =>
  prettyAcc(k.mode === "major" ? `${k.label} / ${k.scale[5]} minor` : `${k.label} / ${k.scale[2]} major`);

/** Sight reading: the notes are on the staff, so no prompt here, except a song's title and composer; a wrong note is
 *  named, and an octave out says which way (for a chord, when it's one of the chord's notes in another octave) */
export function sightReadingDisplay(s: ReadingState): PracticeDisplay {
  const key = requireKey(s.prompt.keyValue);
  const m = s.prompt.music;
  const n = s.prompt.steps.length;
  const single = s.prompt.steps.every(step => step.length === 1);
  let feedback = "";
  if (s.status === "correct") {
    feedback = m
      ? `✓ All ${n} ${single ? "notes" : "notes and chords"}`
      : "✓ " + s.prompt.steps.map(step => prettyAcc(step[0].name)).join(" ");
  } else if (s.status === "wrong" && s.played == null) {
    feedback = "✗ Play the chord's notes together";
  } else if (s.status === "wrong" && s.played != null) {
    const step = s.prompt.steps[s.index],
      played = s.played;
    const near = step.filter(t => t.note % 12 === played % 12 && !s.struck.includes(t.note));
    feedback =
      near.length === 1
        ? `✗ Right note, wrong octave: ${played < near[0].note ? "too low" : "too high"}`
        : `✗ That was ${prettyAcc(noteName(played, key))}${step.length > 1 ? ", not in this chord" : ""}. Try again`;
  }
  const progress = `${single ? "note " : ""}${Math.min(s.index + 1, n)} of ${n}`;
  const score = s.answered ? `${s.firstTry} / ${s.answered} lines right first time` : "";
  if (m) {
    const part = m.part === "voice" ? "" : ` · ${READING_PARTS[m.part].replace("Piano, ", "")}`;
    return {
      label: single
        ? "Play this, note by note, at this pitch"
        : "Play this, note by note and chord by chord, at this pitch",
      promptHtml: `<div class="seqTitle">${esc(m.source.title)}</div><div class="excerptBy">${esc(m.source.composer)} · ${m.arranged ? "melody from OpenScore Lieder, bass added" : "from OpenScore Lieder"}</div>`,
      size: "sequence",
      sub: `${withRelative(key)}${part} · level ${m.level} · ${progress}`,
      status: s.status,
      feedback,
      score,
    };
  }
  return {
    label: n === 1 ? "Play this note, at this pitch" : "Play these notes, left to right, at this pitch",
    promptHtml: "",
    size: "note",
    sub: `${prettyAcc(key.label)} · ${READING_RANGES[s.prompt.range].label.toLowerCase()} · ${progress}`,
    status: s.status,
    feedback,
    score,
  };
}

/** Sight reading while the songs load, or when they couldn't (opened as a local file, the browser won't fetch them) */
export function readingLoadingDisplay(
  failed: boolean,
  fromFile = typeof location !== "undefined" && location.protocol === "file:",
): PracticeDisplay {
  if (failed && fromFile) {
    return {
      label: "Songs need the online version (GitHub Pages) or a local server",
      promptHtml: "",
      size: "note",
      sub: "Opened as a file, the page can't load them; choose Generated notes to read here",
      status: "waiting",
      feedback: "",
      score: "",
    };
  }
  return {
    label: failed ? "Couldn't load the songs" : "Loading songs…",
    promptHtml: "",
    size: "note",
    sub: failed ? "Check the connection and choose the level again, or choose Generated notes" : "",
    status: "waiting",
    feedback: "",
    score: "",
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
      ...base,
      label: soundBlocked ? "Ready" : "Stopped",
      sub: soundBlocked ? SOUND_WAITING : "Press Start to hear the note again",
      stopLabel: "Start",
    };
  }
  return {
    ...base,
    label: "Play the degree you hear over the drone, in any octave, or press it (1–7)",
    sub: soundBlocked ? SOUND_WAITING : "",
    stopLabel: "Stop",
  };
}

/** Ear-training melodies: a dot per note, green once played back, its degree revealed underneath (the root's from
 *  the start) */
export function earMelodyDisplay(
  s: MelodyState,
  degrees: readonly string[],
  soundBlocked: boolean,
  running: boolean,
): PracticeDisplay {
  const key = requireKey(s.prompt.keyValue);
  const steps = s.prompt.notes.map((n, i) =>
    stepHtml(
      i < s.index ? "done" : i === s.index && running ? "current" : "upcoming",
      "•",
      i < s.index || i === 0 ? esc(prettyAcc(n.degree)) : "",
    ),
  );
  const promptHtml = `<div class="seqRow">${steps.join("")}</div>`;
  if (!running) {
    return {
      label: soundBlocked ? "Ready" : "Stopped",
      promptHtml,
      size: "sequence",
      sub: soundBlocked ? SOUND_WAITING : "Press Start to hear the melody again",
      status: "waiting",
      feedback: "",
      score: scoreText(s),
      stopLabel: "Start",
    };
  }
  let feedback = "";
  if (s.status === "correct") feedback = "✓ " + s.prompt.notes.map(n => prettyAcc(n.name)).join(" ");
  else if (s.status === "wrong" && s.played != null) {
    const pc = s.played % 12,
      target = s.prompt.notes[s.index].note;
    feedback =
      pc === target % 12
        ? `✗ Right note, wrong octave: ${s.played < target ? "too low" : "too high"}`
        : `✗ That was ${prettyAcc(degreeName(pc - chromaOf(key.tonic)))} (${prettyAcc(key.spell[pc])}). Listen again`;
  }
  const n = s.prompt.notes.length - 1;
  return {
    label: "Play it back from the root, in order, at the same pitch",
    promptHtml,
    size: "sequence",
    sub: soundBlocked
      ? "Click anywhere or press a computer key to start the sound"
      : `Root ${prettyAcc(key.tonic)} + ${n} notes · degrees ${degrees.map(prettyAcc).join(", ")}`,
    status: s.status,
    feedback,
    score: scoreText(s),
    stopLabel: "Stop",
  };
}

export function chordPracticeDisplay(s: ChordPracticeState, key: KeyContext | null): PracticeDisplay {
  const t = requireTemplate(s.prompt.type);
  const roman = s.prompt.roman;
  // A Roman numeral prompt carries its own key (a random one when none is selected)
  const romanKey = roman ? requireKey(roman.keyValue) : null;
  const promptKey = romanKey ?? key;
  const inv = s.prompt.inversion;
  // Slash bass for inversions; root position has none
  const slash = inv && inv.number > 0 ? inv.bass : "";
  let feedback = "";
  if (s.status === "correct")
    feedback = roman ? `✓ ${prettyAcc(s.prompt.root + t.symbol + (slash ? "/" + slash : ""))}` : "✓ Correct";
  else if (s.status === "wrong" && s.attempt) feedback = "✗ " + describeMiss(s.prompt, s.attempt, promptKey);
  const invText = inv ? " · " + inversionName(inv.number) : "";
  // A chord name drawn from a key says which
  const keyText =
    s.prompt.inKey && key
      ? ` · in ${prettyAcc(key.label)}` +
        (s.prompt.inKey.filterIgnored ? " · no selected chord type is in this key, so any triad" : "")
      : "";
  return {
    label: inv ? "Play this chord, with this note in the bass" : "Play this chord, any voicing or inversion",
    promptHtml: roman ? romanHtml(roman.numeral, inv?.number) : chordSymbolHtml(s.prompt.root, t.symbol, slash),
    size: "chord",
    sub:
      roman && romanKey
        ? `in ${prettyAcc(romanKey.label)}${invText}` +
          (roman.filterIgnored ? " · no selected chord type is in this key, so any triad" : "")
        : prettyAcc(`${s.prompt.root} ${t.name}`) + invText + keyText,
    status: s.status,
    feedback,
    score: scoreText(s),
  };
}

export function progressionDisplay(s: ProgressionState, style: PromptStyle): PracticeDisplay {
  const key = requireKey(s.prompt.keyValue);
  const steps = s.prompt.chords.map((c, i) =>
    chordStepHtml(c, style, i < s.index ? "done" : i === s.index && s.status !== "done" ? "current" : "upcoming"),
  );
  let feedback = "";
  if (s.status === "done") feedback = "✓ Progression complete";
  else if (s.status === "wrong" && s.attempt) feedback = "✗ " + describeMiss(s.prompt.chords[s.index], s.attempt, key);
  const score = s.chordsAnswered
    ? `${s.chordsFirstTry} / ${s.chordsAnswered} chords right first time` +
      (s.completed ? ` · ${s.completed} progression${s.completed > 1 ? "s" : ""}` : "")
    : "";
  return {
    label: "Play this progression, one chord at a time",
    promptHtml: steps.join('<span class="sep">–</span>'),
    size: "progression",
    sub: `${prettyAcc(s.prompt.name)} in ${prettyAcc(key.label)}`,
    status: s.status === "done" ? "correct" : s.status === "wrong" ? "wrong" : "waiting",
    feedback,
    score,
  };
}

/** The chord once named: "D♭ minor", "C dominant seventh, 1st inversion" */
function chordEarName(s: ChordEarState): string {
  const t = templateById(s.prompt.type);
  return t
    ? `${prettyAcc(s.prompt.root)} ${t.name}` + (s.prompt.inversion ? `, ${inversionName(s.prompt.inversion)}` : "")
    : "";
}

/**
 * Ear training, chord qualities, the answer board: one box per allowed type in the filter's order, numbered (the
 * number keys answer too). A wrong answer's box is struck through and can't be pressed again; once right, its box
 * names the chord.
 */
export function chordEarAnswers(s: ChordEarState, types: readonly string[], running: boolean): AnswerBox[] {
  return answerOrder(types).map((type, i) => {
    const right = s.status === "correct" && type === s.prompt.type,
      wrong = s.wrong.includes(type);
    return {
      id: type,
      label: qualityLabel(type),
      key: i < 9 ? i + 1 : undefined,
      state: right ? "right" : wrong ? "wrong" : "",
      detail: right ? chordEarName(s) : undefined,
      disabled: !running || s.status === "correct" || wrong,
    };
  });
}

/** Ear training, chord qualities, the practice panel: the answers are on the board, so just the instruction,
 *  feedback and score */
export function chordEarDisplay(
  s: ChordEarState,
  types: readonly string[],
  soundBlocked: boolean,
  running: boolean,
): PracticeDisplay {
  if (!running) {
    return {
      label: soundBlocked ? "Ready" : "Stopped",
      promptHtml: "",
      size: "chord",
      sub: soundBlocked ? SOUND_WAITING : "Press Start to hear the chord again",
      status: "waiting",
      feedback: "",
      score: scoreText(s),
      stopLabel: "Start",
    };
  }
  let feedback = "";
  if (s.status === "correct") feedback = `✓ ${chordEarName(s)}`;
  else if (s.status === "wrong")
    feedback = `✗ Not ${qualityLabel(s.wrong[s.wrong.length - 1]).toLowerCase()}. Listen again`;
  return {
    label: "Which kind of chord is it?",
    promptHtml: "",
    size: "chord",
    sub: soundBlocked ? SOUND_WAITING : `Choose on the left, or press its number · ${answerOrder(types).length} kinds`,
    status: s.status,
    feedback,
    score: scoreText(s),
    stopLabel: "Stop",
  };
}
