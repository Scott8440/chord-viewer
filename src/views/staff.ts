// Grand staff rendering (VexFlow).
import * as VF from "vexflow/bravura";
import { spellNote, type Analysis, type KeyContext } from "../theory";

const STAFF_W = 300;
const LINE_SP = 10;
// Both chords share one tick context pinned at a fixed x, so noteheads never
// slide sideways (accidentals extend to the left of that point instead).
const NOTE_X = 120;

export interface StaffView {
  render(notes: number[], result: Analysis | null, key: KeyContext | null, pedalOnly: ReadonlySet<number>): void;
}

export function createStaffView(el: HTMLElement): StaffView {
  return {
    render(notes, result, key, pedalOnly) {
      el.innerHTML = "";
      const spelled = notes.map(n => ({ ...spellNote(n, result, key), sus: pedalOnly.has(n) }));
      const treble = spelled.filter(n => n.midi >= 60);
      const bass = spelled.filter(n => n.midi < 60);

      // Fixed layout: always reserve ledger-line room for the full piano range
      // (C8 = step 56 above the treble's top line F5 = 38; A0 = step 5 below the bass's bottom line G2 = 18),
      // so the staff never moves when a very high or low note appears.
      const top = 34 + (56 - 38) * (LINE_SP / 2);
      const bottom = 34 + (18 - 5) * (LINE_SP / 2);
      const gap = 72;
      const trebleY = top, bassY = trebleY + 4 * LINE_SP + gap;
      const height = bassY + 4 * LINE_SP + bottom;
      const width = STAFF_W + 40;

      const renderer = new VF.Renderer(el as HTMLDivElement, VF.Renderer.Backends.SVG);
      renderer.resize(width, height);
      const ctx = renderer.getContext();
      const svg = el.querySelector("svg")!;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.style.width = "min(100%, 620px)";
      svg.style.height = "auto";

      const opts = { space_above_staff_ln: 0, space_below_staff_ln: 0 };
      const tStave = new VF.Stave(26, trebleY, STAFF_W, opts).addClef("treble");
      const bStave = new VF.Stave(26, bassY, STAFF_W, opts).addClef("bass");
      if (key) { tStave.addKeySignature(key.vfKey); bStave.addKeySignature(key.vfKey); }
      const startX = Math.max(tStave.getNoteStartX(), bStave.getNoteStartX());
      tStave.setNoteStartX(startX);
      bStave.setNoteStartX(startX);
      tStave.setContext(ctx).draw();
      bStave.setContext(ctx).draw();
      new VF.StaveConnector(tStave, bStave).setType("brace").setContext(ctx).draw();
      new VF.StaveConnector(tStave, bStave).setType("singleLeft").setContext(ctx).draw();
      new VF.StaveConnector(tStave, bStave).setType("singleRight").setContext(ctx).draw();

      const tc = new VF.TickContext();
      const built: VF.StaveNote[] = [];
      const makeChord = (list: typeof spelled, clef: string, stave: VF.Stave) => {
        if (!list.length) return;
        const note = new VF.StaveNote({
          clef, duration: "w",
          keys: list.map(n => `${n.letter.toLowerCase()}${n.acc}/${n.octave}`),
        });
        list.forEach((n, i) => {
          // Show an accidental only where the note differs from the key signature
          const sig = key ? (key.sigAlter[n.letter] || 0) : 0;
          if (n.alter !== sig) note.addModifier(new VF.Accidental(n.alter === 0 ? "n" : n.acc), i);
          if (n.sus) note.setKeyStyle(i, { fillStyle: "#9a968c", strokeStyle: "#9a968c" });
        });
        note.setStave(stave).setContext(ctx);
        note.addToModifierContext(new VF.ModifierContext());
        tc.addTickable(note);
        built.push(note);
      };
      makeChord(treble, "treble", tStave);
      makeChord(bass, "bass", bStave);
      if (built.length) {
        tc.preFormat().setX(NOTE_X);
        built.forEach(n => n.draw());
      }
    },
  };
}
