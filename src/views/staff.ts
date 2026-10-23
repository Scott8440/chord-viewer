// Grand staff rendering (VexFlow).
import * as VF from "vexflow/bravura";
import { spellNote, type Analysis, type KeyContext } from "../theory";

const STAFF_W = 300;
const LINE_SP = 10;
// Both chords share one tick context pinned at a fixed x, so noteheads never
// slide sideways (accidentals extend to the left of that point instead).
const NOTE_X = 120;
const STAVE_X = 26;

// Fixed layout: always reserve ledger-line room for the full piano range
// (C8 = step 56 above the treble's top line F5 = 38; A0 = step 5 below the bass's bottom line G2 = 18),
// so the staff never moves when a very high or low note appears.
const TOP = 34 + (56 - 38) * (LINE_SP / 2);
const BOTTOM = 34 + (18 - 5) * (LINE_SP / 2);
const GAP = 72;
const TREBLE_Y = TOP, BASS_Y = TREBLE_Y + 4 * LINE_SP + GAP;
const VIEW_H = BASS_Y + 4 * LINE_SP + BOTTOM;
const VIEW_W = STAFF_W + 40;
/** The note column's width from its x: a cluster puts seconds side by side (two whole-note heads), and ledger lines
 *  reach past them (measured in the browser) */
const COLUMN_W = 48;

export interface StaffCorner {
  /** The drawing's size (viewBox units) */
  viewWidth: number;
  viewHeight: number;
  /** The corner is right of this x and above this y */
  left: number;
  bottom: number;
}

let corner: StaffCorner | null = null;
/**
 * The top-right corner of the staff left free for the circle of fifths, in viewBox units: right of the note column
 * (with a cluster's displaced noteheads, and no key signature) and above the treble staff. A key signature moves the
 * column right, so very high notes (above the treble staff) in keys with many accidentals can reach into it; nothing
 * else does. The same for every key, so the circle keeps its size.
 */
export function staffCorner(): StaffCorner {
  if (!corner) {
    const startX = Math.max(...["treble", "bass"].map(clef => new VF.Stave(STAVE_X, 0, STAFF_W).addClef(clef).getNoteStartX()));
    corner = { viewWidth: VIEW_W, viewHeight: VIEW_H, left: startX + NOTE_X + COLUMN_W, bottom: TREBLE_Y };
  }
  return corner;
}

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

      const renderer = new VF.Renderer(el as HTMLDivElement, VF.Renderer.Backends.SVG);
      renderer.resize(VIEW_W, VIEW_H);
      const ctx = renderer.getContext();
      const svg = el.querySelector("svg")!;
      svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.style.width = "min(100%, 620px)";
      svg.style.height = "auto";

      const opts = { space_above_staff_ln: 0, space_below_staff_ln: 0 };
      const tStave = new VF.Stave(STAVE_X, TREBLE_Y, STAFF_W, opts).addClef("treble");
      const bStave = new VF.Stave(STAVE_X, BASS_Y, STAFF_W, opts).addClef("bass");
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
