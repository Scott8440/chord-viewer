// Practice panel: label, prompt, feedback and score. Each exercise has a presenter that turns its
// state into a PracticeDisplay; the view only renders that.
import { Note } from "tonal";
import { isChord, type ChordPracticeState } from "../exercises/chordPractice";
import type { NotePracticeState } from "../exercises/notePractice";
import { analyze, FLAT, matchTemplate, pcName, prettyAcc, SHARP, templateById, type KeyContext } from "../theory";
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
const list = (names: string[]) => names.map(prettyAcc).join(" ");

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
  else if (s.status === "wrong" && s.attempt) feedback = "✗ " + describeMiss(s, key) + " — try again";
  return {
    label: "Play this chord, any voicing or inversion",
    promptHtml: chordSymbolHtml(s.prompt.root, t.symbol),
    compact: true,
    sub: prettyAcc(`${s.prompt.root} ${t.name}`),
    status: s.status, feedback, score: scoreText(s),
  };
}

/** "That was C · missing B♭ · extra D": what was played, and how it differs from the prompt. */
function describeMiss(s: ChordPracticeState, key: KeyContext | null): string {
  const notes = s.attempt!;
  const parts: string[] = [];
  const played = analyze(notes, key);
  if (played && played.kind !== "unknown" && !isChord(notes, s.prompt, { allowOmissions: true })) parts.push(`That was ${prettyAcc(played.text)}`);
  const m = matchTemplate(notes.map(n => n % 12), s.prompt.rootPc, s.prompt.type);
  // Name missing tones as they are spelled in the prompted chord
  const spell = (pc: number) => {
    const tone = [...m.missing, ...m.omitted].find(x => (s.prompt.rootPc + x.pc) % 12 === pc);
    return tone ? Note.transpose(s.prompt.root, tone.interval) : pcName(pc, key, s.prompt.root.includes("b") ? true : s.prompt.root.includes("#") ? false : undefined);
  };
  const missing = [...m.missing, ...m.omitted].map(x => spell((s.prompt.rootPc + x.pc) % 12));
  if (missing.length) parts.push(`missing ${list(missing)}`);
  if (m.extra.length) parts.push(`extra ${list(m.extra.map(spell))}`);
  const text = parts.join(" · ") || "Not quite";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
