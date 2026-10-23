// Chords in prompts: names, Roman numerals with figured bass, chords as steps, and "replace E with E♭" corrections.

import { Note } from "tonal";
import { chordCorrections, hasBass, hasChordTones } from "../../exercises/chordMatch";
import type { ChordPrompt, PromptStyle } from "../../exercises/chordPrompt";
import { analyze, pcName, prettyAcc, templateById, type KeyContext } from "../../theory";
import { chordSymbolHtml } from "../chordName";
import { esc } from "../html";
import { stepHtml, type StepState } from "./steps";
import { and, capitalize } from "./text";

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
export function romanHtml(numeral: string, inversion?: number): string {
  const { base, quality, seventh } = splitNumeral(numeral);
  const figures = inversion == null ? (seventh ? ["7"] : []) : inversionFigures(seventh, inversion);
  const raised = quality + (figures.length === 1 ? figures[0] : "");
  let html = esc(base);
  if (raised) html += `<span class="ext">${esc(raised)}</span>`;
  if (figures.length === 2) html += `<span class="fig"><span>${figures[0]}</span><span>${figures[1]}</span></span>`;
  return html;
}

/** "That was C. Replace E with E♭": what was played instead of `prompt`, and what to change. */
export function describeMiss(prompt: ChordPrompt, notes: number[], key: KeyContext | null): string {
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

/** A chord's name with its required bass, e.g. "Cmaj7/E" */
export function chordName(c: ChordPrompt): string {
  return c.root + templateById(c.type)!.symbol + (c.inversion && c.inversion.number > 0 ? "/" + c.inversion.bass : "");
}

/** How a chord is asked for in a prompt style: "Cmaj7/E" or "Imaj7" (with figures when an inversion is required) */
export function chordPromptText(c: ChordPrompt, style: PromptStyle): string {
  return prettyAcc(style === "roman" && c.roman ? c.roman.numeral : chordName(c));
}

/**
 * A chord as a step: in the prompt's notation (chord name or Roman numeral), with the other notation revealed
 * underneath once it has been played.
 */
export function chordStepHtml(c: ChordPrompt, style: PromptStyle, state: StepState, extra = ""): string {
  const t = templateById(c.type)!;
  const slash = c.inversion && c.inversion.number > 0 ? c.inversion.bass : "";
  const roman = style === "roman" && c.roman;
  const main = roman ? romanHtml(c.roman!.numeral, c.inversion?.number) : chordSymbolHtml(c.root, t.symbol, slash);
  const other = roman ? esc(prettyAcc(chordName(c))) : c.roman ? esc(prettyAcc(c.roman.numeral)) : "";
  return stepHtml(state, main, state === "done" ? other : "", extra);
}
