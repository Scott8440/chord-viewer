// Practice panel: label, prompt, feedback and score. Each exercise has a presenter that turns its
// state into a PracticeDisplay; the view only renders that.
import { Note } from "tonal";
import { chordCorrections, hasBass, hasChordTones, type ChordPracticeState, type ChordPrompt, type PromptStyle } from "../exercises/chordPractice";
import type { NotePracticeState } from "../exercises/notePractice";
import type { ProgressionState } from "../exercises/progressions";
import { itemExercise, itemLabel, mixesExercises, routineSummary, type RoutineState } from "../exercises/routines";
import { bestRun, type RunResult, type SequenceState, type SequenceStep, type WrongStep } from "../exercises/sequence";
import { analyze, buildKey, FLAT, pcName, prettyAcc, SHARP, templateById, type KeyContext } from "../theory";
import { chordSymbolHtml } from "./chordName";
import { esc } from "./html";

export interface PracticeDisplay {
  label: string;
  /** Prompt as HTML */
  promptHtml: string;
  /** Prompt font size: one big note, a chord symbol, a row of chords, or a titled row of notes */
  size: "note" | "chord" | "progression" | "sequence";
  /** Line under the prompt, e.g. "D♭ major seventh" */
  sub: string;
  status: "waiting" | "wrong" | "correct";
  feedback: string;
  score: string;
  /** Text of the button under the prompt; defaults to "Skip" */
  skipLabel?: string;
}

export interface PracticeView {
  render(d: PracticeDisplay): void;
}

export function createPracticeView(els: {
  label: HTMLElement; prompt: HTMLElement; sub: HTMLElement; feedback: HTMLElement; score: HTMLElement; skip: HTMLElement;
}): PracticeView {
  return {
    render(d) {
      els.label.textContent = d.label;
      els.prompt.innerHTML = d.promptHtml;
      els.prompt.className = d.size;
      els.sub.textContent = d.sub;
      els.feedback.className = d.status;
      els.feedback.textContent = d.feedback;
      els.score.textContent = d.score;
      els.skip.textContent = d.skipLabel ?? "Skip";
    },
  };
}

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

export const inversionName = (n: number) => n === 0 ? "root position" : `${["1st", "2nd", "3rd"][n - 1]} inversion`;

/**
 * Figured-bass figures for an inversion: triads "", 6, 6/4; sevenths 7, 6/5, 4/3, 4/2.
 * Returns the stacked numbers, top first.
 */
export function inversionFigures(seventh: boolean, n: number): string[] {
  return (seventh ? [["7"], ["6", "5"], ["4", "3"], ["4", "2"]] : [[], ["6"], ["6", "4"]])[n] ?? [];
}

function splitNumeral(numeral: string) {
  const m = numeral.match(/^([b#♭♯]?[IViv]+[°ø+]?)(maj)?(7)?$/)!;
  return { base: m[1], quality: m[2] ?? "", seventh: !!m[3] };
}

/** Roman numeral as HTML: figures raised, and stacked when there are two (V⁶₅). */
function romanHtml(numeral: string, inversion?: number): string {
  const { base, quality, seventh } = splitNumeral(numeral);
  const figures = inversion == null ? (seventh ? ["7"] : []) : inversionFigures(seventh, inversion);
  const raised = quality + (figures.length === 1 ? figures[0] : "");
  let html = esc(base);
  if (raised) html += `<span class="ext">${esc(raised)}</span>`;
  if (figures.length === 2) html += `<span class="fig"><span>${figures[0]}</span><span>${figures[1]}</span></span>`;
  return html;
}

/** "That was C. Replace E with E♭": what was played instead of `prompt`, and what to change. */
function describeMiss(prompt: ChordPrompt, notes: number[], key: KeyContext | null): string {
  const root = prompt.root;
  // Chord tones are spelled as in the prompted chord; wrong notes like the key, or the prompt's sharps/flats
  const tone = (interval: string) => prettyAcc(Note.transpose(root, interval));
  const wrong = (pc: number) => prettyAcc(pcName(pc, key, root.includes("b") ? true : root.includes("#") ? false : undefined));
  const fix = chordCorrections(notes, prompt);
  const actions = [
    ...fix.replace.map(r => `replace ${wrong(r.from)} with ${tone(r.to.interval)}`),
    ...(fix.add.length ? [`add ${and(fix.add.map(t => tone(t.interval)))}`] : []),
    ...(fix.remove.length ? [`remove ${and(fix.remove.map(wrong))}`] : []),
  ];
  // With a required inversion, the bass is one more thing to fix
  const inv = prompt.inversion;
  const bassFix = inv && !hasBass(notes, prompt) ? `put ${prettyAcc(inv.bass)} in the bass` : "";
  if (bassFix && hasChordTones(notes, prompt)) return "Right notes, wrong bass. " + capitalize(bassFix);
  if (bassFix) actions.push(bassFix);
  const todo = capitalize(and(actions)) || "Not quite";
  // Name what was played, unless it already is the chord with a tone left out; with Roman prompts add its numeral
  const played = analyze(notes, key);
  const numeral = prompt.roman && played?.roman ? ` (${played.roman})` : "";
  const that = played && played.kind !== "unknown" && !hasChordTones(notes, prompt, { allowOmissions: true })
    ? `That was ${prettyAcc(played.text)}${numeral}. ` : "";
  return that + todo;
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

/* ---------------------------------------------------------------
   Rows of steps, shared by progressions and sequence exercises
   --------------------------------------------------------------- */
/** done: played (or clean, in a routine); flawed: finished with mistakes; skipped: passed over */
type StepState = "done" | "current" | "upcoming" | "flawed" | "skipped";

/** One step in a row: green when done, underlined when current; an optional second line underneath. */
function stepHtml(state: StepState, mainHtml: string, otherHtml?: string): string {
  return `<span class="step ${state}"><span class="main">${mainHtml}</span>` +
    (otherHtml === undefined ? "" : `<span class="other">${otherHtml || "&nbsp;"}</span>`) + "</span>";
}

/** A chord's name with its required bass, e.g. "Cmaj7/E" */
function chordName(c: ChordPrompt): string {
  return c.root + templateById(c.type)!.symbol + (c.inversion && c.inversion.number > 0 ? "/" + c.inversion.bass : "");
}

/** How a chord is asked for in a prompt style: "Cmaj7/E" or "Imaj7" (with figures when an inversion is required) */
function chordPromptText(c: ChordPrompt, style: PromptStyle): string {
  return prettyAcc(style === "roman" && c.roman ? c.roman.numeral : chordName(c));
}

/**
 * A chord as a step: in the prompt's notation (chord name or Roman numeral), with the other notation revealed
 * underneath once it has been played.
 */
function chordStepHtml(c: ChordPrompt, style: PromptStyle, state: StepState): string {
  const t = templateById(c.type)!;
  const slash = c.inversion && c.inversion.number > 0 ? c.inversion.bass : "";
  const roman = style === "roman" && c.roman;
  const main = roman ? romanHtml(c.roman!.numeral, c.inversion?.number) : chordSymbolHtml(c.root, t.symbol, slash);
  const other = roman ? esc(prettyAcc(chordName(c))) : c.roman ? esc(prettyAcc(c.roman.numeral)) : "";
  return stepHtml(state, main, state === "done" ? other : "");
}


/** Scale (and other note-sequence) exercise: the notes in a row, live feedback, and run results. */
/** A sequence exercise (scale, diatonic chords …): the steps in a row, live feedback, and run results. */
export function sequenceDisplay(s: SequenceState, style: PromptStyle): PracticeDisplay {
  const ex = s.exercise;
  const key = buildKey(ex.keyValue);
  const steps = ex.steps.map((st, i) => {
    const state = s.status === "done" || (s.status === "playing" && i < s.index) ? "done"
      : i === (s.status === "playing" ? s.index : 0) ? "current" : "upcoming";
    return st.kind === "note" ? stepHtml(state, esc(prettyAcc(st.name))) : chordStepHtml(st.chord, style, state);
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
    label: prettyNames(ex.instruction),
    promptHtml: `<div class="seqTitle">${esc(prettyNames(ex.title))}</div><div class="seqRow">${steps.join("")}</div>`,
    size: "sequence", sub, status, feedback,
    score: s.runs.length
      ? `${s.runs.length} run${s.runs.length > 1 ? "s" : ""} · ${clean} clean · best: ${best!.mistakes ? `${best!.mistakes} mistake${best!.mistakes > 1 ? "s" : ""}, ` : ""}${Math.round(best!.evenness * 100)}% even`
      : "",
    skipLabel: "Restart",
  };
}

/** A routine: the overview of its items, then the item in progress (shown as on its own), or a summary at the end. */
export function routineDisplay(r: RoutineState, style: PromptStyle): PracticeDisplay {
  // One entry per key: a routine that plays several exercises in a key groups them
  const groups: { key: string; items: number[] }[] = [];
  r.items.forEach((_, i) => {
    const { key } = itemLabel(r, i);
    if (groups.length && groups[groups.length - 1].key === key) groups[groups.length - 1].items.push(i);
    else groups.push({ key, items: [i] });
  });
  const mixed = mixesExercises(r);
  const overview = groups.map(g => {
    const outcomes = g.items.map(i => r.outcomes[i]);
    const inProgress = r.status !== "done" && g.items.includes(r.index);
    const state: StepState = inProgress ? "current"
      : outcomes.some(o => o === undefined) ? "upcoming"
      : outcomes.every(o => o === "skipped") ? "skipped"
      : outcomes.some(o => o !== "skipped" && o!.mistakes) ? "flawed" : "done";
    // In a mixed routine, the key in progress says which of its exercises is up
    const part = mixed ? (inProgress ? esc(itemLabel(r, r.index).exercise) : "") : undefined;
    return stepHtml(state, esc(prettyAcc(g.key)), part);
  }).join("");
  const row = `<div class="routineRow">${overview}</div>`;
  const total = r.items.length;

  if (r.status === "done") {
    const sum = routineSummary(r);
    const weakest = sum.weakest.map(w => {
      const what = w.result.mistakes ? `${w.result.mistakes} mistake${w.result.mistakes > 1 ? "s" : ""}` : `${Math.round(w.result.evenness * 100)}% even`;
      return `${prettyAcc(itemExercise(r.items[w.index], r.base).title)} (${what})`;
    });
    return {
      label: r.routine.name,
      promptHtml: row + `<div class="seqTitle">Routine complete</div>`,
      size: "sequence",
      sub: weakest.length ? `Weakest: ${weakest.join(", ")}` : sum.finished ? "Every item clean and even" : "",
      status: sum.clean === sum.finished && sum.finished > 0 ? "correct" : "waiting",
      feedback: `${sum.finished} of ${total} played · ${sum.clean} clean · ${sum.totalMistakes} mistake${sum.totalMistakes === 1 ? "" : "s"}` +
        (sum.durationMs ? ` · ${formatDuration(sum.durationMs)}` : "") + (sum.skipped ? ` · ${sum.skipped} skipped` : ""),
      score: "",
      skipLabel: "Start again",
    };
  }

  const inner = sequenceDisplay(r.current, style);
  let { feedback, status } = inner;
  // Until the next item starts, show how the previous one went
  if (r.previous && r.current.status !== "playing" && !r.current.startHint) {
    const title = prettyNames(itemExercise(r.items[r.previous.index], r.base).title);
    feedback = (r.previous.result.mistakes ? `${title}: ${r.previous.result.mistakes} mistake${r.previous.result.mistakes > 1 ? "s" : ""}`
      : `✓ ${title}: clean`) + " · " + runText(r.previous.result);
    status = r.previous.result.mistakes ? "waiting" : "correct";
  }
  const clean = r.outcomes.filter(o => o !== "skipped" && !o.mistakes).length;
  return {
    ...inner,
    promptHtml: row + inner.promptHtml,
    sub: `${r.index + 1} / ${total}` + (inner.sub && r.current.status === "playing" ? ` · ${inner.sub}` : ""),
    feedback, status,
    score: r.outcomes.length ? `${r.outcomes.length} / ${total} done · ${clean} clean` : "",
    skipLabel: "Skip",
  };
}

/** "3m 05s" or "42 s" */
function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
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

/** Pretty accidentals on note names inside prose ("Eb major" -> "E♭ major"), leaving words like "back" alone. */
const prettyNames = (text: string) => text.replace(/\b([A-G])(#{1,2}|b{1,2})(?![a-z])/g, (_, l, acc) => l + prettyAcc(acc));

/** "4.2 s · 132 BPM · 91% even" */
function runText(r: RunResult): string {
  return `${(r.durationMs / 1000).toFixed(1)} s · ${Math.round(r.bpm)} BPM · ${Math.round(r.evenness * 100)}% even`;
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** "a", "a and b", "a, b and c" */
const and = (items: string[]) => items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
