// Practice panel: label, prompt, feedback and score. Each exercise has a presenter that turns its
// state into a PracticeDisplay; the view only renders that.
import { Note } from "tonal";
import { chordCorrections, isChord, type ChordPracticeState } from "../exercises/chordPractice";
import type { NotePracticeState } from "../exercises/notePractice";
import { analyze, FLAT, pcName, prettyAcc, SHARP, templateById, type KeyContext } from "../theory";
import { chordSymbolHtml } from "./chordName";
import { esc } from "./html";

export interface PracticeDisplay {
  label: string;
  /** Prompt as HTML */
  promptHtml: string;
  /** Smaller prompt font, for chord symbols */
  compact: boolean;
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
      els.prompt.classList.toggle("compact", d.compact);
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
    label: "Play this note, in any octave", promptHtml: esc(prettyAcc(s.prompt.name)), compact: false, sub: "",
    status: s.status, feedback, score: scoreText(s),
  };
}

export function chordPracticeDisplay(s: ChordPracticeState, key: KeyContext | null): PracticeDisplay {
  const t = templateById(s.prompt.type)!;
  let feedback = "";
  if (s.status === "correct") feedback = "✓ Correct";
  else if (s.status === "wrong" && s.attempt) feedback = "✗ " + describeMiss(s, key);
  return {
    label: "Play this chord, any voicing or inversion",
    promptHtml: chordSymbolHtml(s.prompt.root, t.symbol),
    compact: true,
    sub: prettyAcc(`${s.prompt.root} ${t.name}`),
    status: s.status, feedback, score: scoreText(s),
  };
}

/** "That was C. Replace E with E♭": what was played, and what to change. */
function describeMiss(s: ChordPracticeState, key: KeyContext | null): string {
  const notes = s.attempt!;
  const root = s.prompt.root;
  // Chord tones are spelled as in the prompted chord; wrong notes like the key, or the prompt's sharps/flats
  const tone = (interval: string) => prettyAcc(Note.transpose(root, interval));
  const wrong = (pc: number) => prettyAcc(pcName(pc, key, root.includes("b") ? true : root.includes("#") ? false : undefined));
  const fix = chordCorrections(notes, s.prompt);
  const actions = [
    ...fix.replace.map(r => `replace ${wrong(r.from)} with ${tone(r.to.interval)}`),
    ...(fix.add.length ? [`add ${and(fix.add.map(t => tone(t.interval)))}`] : []),
    ...(fix.remove.length ? [`remove ${and(fix.remove.map(wrong))}`] : []),
  ];
  const todo = capitalize(and(actions)) || "Not quite";
  // Name what was played, unless it already is the chord with a tone left out
  const played = analyze(notes, key);
  const that = played && played.kind !== "unknown" && !isChord(notes, s.prompt, { allowOmissions: true })
    ? `That was ${prettyAcc(played.text)}. ` : "";
  return that + todo;
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** "a", "a and b", "a, b and c" */
const and = (items: string[]) => items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
