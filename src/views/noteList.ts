// List of sounding notes; pedal-only notes are dimmed.
import { prettyAcc, spellNote, type Analysis, type KeyContext } from "../theory";
import { esc } from "./html";

export interface NoteListView {
  render(notes: number[], result: Analysis | null, key: KeyContext | null, isHeld: (note: number) => boolean): void;
}

export function createNoteListView(el: HTMLElement): NoteListView {
  return {
    render(notes, result, key, isHeld) {
      if (!notes.length) { el.innerHTML = ""; return; }
      el.innerHTML = notes.map(n => {
        const s = spellNote(n, result, key);
        const label = esc(prettyAcc(s.letter + s.acc) + s.octave);
        return isHeld(n) ? `<b>${label}</b>` : `<span class="sus">${label}</span>`;
      }).join("  ");
    },
  };
}
