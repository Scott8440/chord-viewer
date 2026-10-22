// Practice panel: label, prompt, feedback and score. Each exercise has a presenter that turns its
// state into a PracticeDisplay; the view only renders that.
import { Note } from "tonal";
import { chordCorrections, hasBass, hasChordTones, type ChordPracticeState, type ChordPrompt, type PromptStyle } from "../exercises/chordPractice";
import type { NotePracticeState } from "../exercises/notePractice";
import type { ProgressionState } from "../exercises/progressions";
import { analyze, buildKey, FLAT, pcName, prettyAcc, SHARP, templateById, type KeyContext } from "../theory";
import { chordSymbolHtml } from "./chordName";
import { esc } from "./html";

export interface PracticeDisplay {
  label: string;
  /** Prompt as HTML */
  promptHtml: string;
  /** Prompt font size: one big note, a chord symbol, or a row of chords */
  size: "note" | "chord" | "progression";
  /** Line under the prompt, e.g. "D♭ major seventh" */
  sub: string;
  status: "waiting" | "wrong" | "correct";
  feedback: string;
  score: string;
}

export interface PracticeView {
  render(d: PracticeDisplay): void;
}

export function createPracticeView(els: {
  label: HTMLElement; prompt: HTMLElement; sub: HTMLElement; feedback: HTMLElement; score: HTMLElement;
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
  // Each chord in the row: the prompt notation, plus the other notation once it has been played
  const steps = s.prompt.chords.map((c, i) => {
    const t = templateById(c.type)!;
    const done = i < s.index;
    const state = done ? "done" : i === s.index && s.status !== "done" ? "current" : "upcoming";
    const main = style === "roman" ? romanHtml(c.roman!.numeral) : chordSymbolHtml(c.root, t.symbol);
    const other = style === "roman" ? esc(prettyAcc(c.root + t.symbol)) : esc(prettyAcc(c.roman!.numeral));
    return `<span class="step ${state}"><span class="main">${main}</span><span class="other">${done ? other : "&nbsp;"}</span></span>`;
  });
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
    sub: `${prettyAcc(s.prompt.name)} in ${prettyAcc(key.label)}` +
      (s.prompt.filterIgnored ? " · none of the selected progressions is in this mode, so any" : ""),
    status: s.status === "done" ? "correct" : s.status === "wrong" ? "wrong" : "waiting",
    feedback, score,
  };
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** "a", "a and b", "a, b and c" */
const and = (items: string[]) => items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
