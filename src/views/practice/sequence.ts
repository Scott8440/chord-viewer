// Presenter for sequence exercises (scales, diatonic chords ...), and how a run's result reads.

import type { PromptStyle } from "../../exercises/chordPrompt";
import { bestRun, type RunResult, type SequenceState, type SequenceStep, type WrongStep } from "../../exercises/sequence";
import { buildKey, pcName, prettyAcc, type KeyContext } from "../../theory";
import { timingVerdict, type TimingSummary } from "../../timing/grid";
import { esc } from "../html";
import { chordPromptText, chordStepHtml, describeMiss } from "./chords";
import { stepHtml } from "./steps";
import { prettyNames } from "./text";
import type { PracticeDisplay } from "./view";

/** A sequence exercise (scale, diatonic chords …): the steps in a row, live feedback, and run results. */
export function sequenceDisplay(s: SequenceState, style: PromptStyle): PracticeDisplay {
  const ex = s.exercise;
  const key = buildKey(ex.keyValue);
  const steps = ex.steps.map((st, i) => {
    const state = s.status === "done" || (s.status === "playing" && i < s.index) ? "done"
      : i === (s.status === "playing" ? s.index : 0) ? "current" : "upcoming";
    // Played to the metronome: steps that missed their beat say which way
    const timing = state === "done" && s.grid && s.timings[i];
    const verdict = timing ? timingVerdict(s.grid!, timing) : "onTime";
    const extra = verdict === "onTime" ? "" : verdict;
    // Note steps are dots, not names: the exercise is to know the notes; chord steps name the chord to play
    return st.kind === "note" ? stepHtml(state, "•", undefined, extra) : chordStepHtml(st.chord, style, state, extra);
  });
  const stepText = (st: SequenceStep) => st.kind === "note" ? prettyAcc(st.name) : chordPromptText(st.chord, style);
  const first = ex.steps[0];
  let feedback = "", status: PracticeDisplay["status"] = "waiting", sub = "";
  if (s.status === "playing" && s.lastWrong) {
    feedback = "✗ " + describeWrongStep(ex.steps[s.index], s.lastWrong, key);
    status = "wrong";
  } else if (s.startHint) {
    feedback = `Start ${first.kind === "note" ? "on" : "with"} ${stepText(first)}`;
  } else if (s.status === "done" && s.result) {
    feedback = (s.result.mistakes ? `Done · ${s.result.mistakes} mistake${s.result.mistakes > 1 ? "s" : ""}` : "✓ Clean run") +
      " · " + runText(s.result);
    status = s.result.mistakes ? "waiting" : "correct";
  }
  if (s.status === "done") sub = `Play ${stepText(first)} to go again`;
  else if (s.status === "playing" && s.mistakes) sub = `${s.mistakes} mistake${s.mistakes > 1 ? "s" : ""} so far`;
  const best = bestRun(s.runs);
  const clean = s.runs.filter(r => !r.mistakes).length;
  return {
    label: prettyNames(ex.instruction) + (s.grid ? ` · ${tempoText(s.grid.transport.bpm, s.grid.subdivision)}` : ""),
    promptHtml: `<div class="seqTitle">${esc(prettyNames(ex.title))}</div><div class="seqRow">${steps.join("")}</div>`,
    size: "sequence", sub, status, feedback,
    score: s.runs.length
      ? `${s.runs.length} run${s.runs.length > 1 ? "s" : ""} · ${clean} clean · best: ${best!.mistakes ? `${best!.mistakes} mistake${best!.mistakes > 1 ? "s" : ""}, ` : ""}${steadinessText(best!)}`
      : "",
    skipLabel: "Restart",
  };
}

/** What went wrong at a step: a wrong note (or the right note in the wrong octave), or a chord's corrections. */
function describeWrongStep(step: SequenceStep, wrong: WrongStep, key: KeyContext | null): string {
  if (step.kind === "chord" && wrong.kind === "chord") return describeMiss(step.chord, wrong.notes, key);
  if (step.kind !== "note" || wrong.kind !== "note") return "Not quite";
  const expected = prettyAcc(step.name), { played } = wrong;
  if (wrong.expected != null && played % 12 === wrong.expected % 12) {
    return `Right note, wrong octave: ${expected} ${played > wrong.expected ? "lower" : "higher"}`;
  }
  return `Expected ${expected}, not ${prettyAcc(pcName(played % 12, key))}`;
}

/** How a run went: "132 BPM · 91% even", or against the metronome "92% on time · rushing 18 ms" (no duration) */
export function runText(r: RunResult): string {
  if (r.timing) return timingText(r.timing);
  return `${Math.round(r.bpm)} BPM · ${Math.round(r.evenness * 100)}% even`;
}

/** How steady a run was, briefly: "92% on time" against the metronome, else "95% even" */
export const steadinessText = (r: RunResult) => r.timing ? `${Math.round(r.timing.onTime * 100)}% on time` : `${Math.round(r.evenness * 100)}% even`;

const SUBDIVISION_NAMES: Record<number, string> = { 1: "quarters", 2: "eighths", 4: "sixteenths" };
/** "96 BPM, eighths" */
export const tempoText = (bpm: number, subdivision: number) => `${Math.round(bpm)} BPM, ${SUBDIVISION_NAMES[subdivision]}`;

/** "92% on time · rushing 18 ms · 1 slip" — rushing/dragging only when it's more than a few ms */
export function timingText(t: TimingSummary): string {
  const lean = Math.round(t.meanOffsetMs);
  return `${Math.round(t.onTime * 100)}% on time` +
    (Math.abs(lean) >= 5 ? ` · ${lean < 0 ? "rushing" : "dragging"} ${Math.abs(lean)} ms` : "") +
    (t.slips ? ` · ${t.slips} slip${t.slips > 1 ? "s" : ""}` : "");
}
