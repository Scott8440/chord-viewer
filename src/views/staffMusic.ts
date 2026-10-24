// A phrase of written music on one staff (VexFlow): clef, key and time signature, then its bars as written, with
// rests, dots, ties, beams, tuplets and accidentals as the bar needs them. Used by sight reading in place of the
// grand staff.
import * as VF from "vexflow/bravura";
import { staffStep, tpcName, tupletGroups, type ExcerptEvent } from "../exercises/excerpts";
import type { KeyContext } from "../theory";

export type MusicStyle = "done" | "wrong";

export interface StaffMusic {
  clef: "treble" | "bass";
  time: [number, number];
  bars: readonly (readonly ExcerptEvent[])[];
  /** How to colour each event, in the same shape as `bars` (undefined: black) */
  styles: readonly (readonly (MusicStyle | undefined)[])[];
}

const STYLES: Record<MusicStyle, VF.ElementStyle> = {
  done: { fillStyle: "#2e8b57", strokeStyle: "#2e8b57" },
  wrong: { fillStyle: "#c8553d", strokeStyle: "#c8553d" },
};

/** The drawing's least width and its height (viewBox units); room above and below the staff for ledger lines,
 *  stems, beams and tuplet numbers, so the staff stays put from one phrase to the next */
const MIN_W = 640, ABOVE = 80, BELOW = 80, STAFF_H = 40, VIEW_H = ABOVE + STAFF_H + BELOW, MARGIN = 8;
/** Room a bar keeps after its notes, and before them in bars after the first */
const BAR_PAD = 22;

const REST_KEY = { treble: "b/4", bass: "d/3" };

function staveNote(e: ExcerptEvent, clef: StaffMusic["clef"], style: MusicStyle | undefined): VF.StaveNote {
  const rest = e.p == null;
  const note = new VF.StaveNote({
    clef, auto_stem: true, dots: e.d ?? 0,
    duration: e.bar ? "wr" : e.v + (rest ? "r" : ""),
    keys: [rest ? REST_KEY[clef] : `${tpcName(e.s!).toLowerCase()}/${Math.floor(staffStep(e.p!, e.s!) / 7)}`],
    align_center: !!e.bar,
  });
  for (let i = 0; i < (e.d ?? 0); i++) VF.Dot.buildAndAttach([note], { all: true });
  if (style) note.setStyle(STYLES[style]);
  return note;
}

export function drawMusic(el: HTMLElement, m: StaffMusic, key: KeyContext | null) {
  el.innerHTML = "";
  const timeSpec = `${m.time[0]}/${m.time[1]}`;
  const notes = m.bars.map((bar, b) => bar.map((e, i) => staveNote(e, m.clef, m.styles[b]?.[i])));
  // Tuplets change their notes' lengths, so they come before the voices
  const tuplets = m.bars.flatMap((bar, b) => tupletGroups(bar).map(g =>
    new VF.Tuplet(notes[b].slice(g.from, g.to), { num_notes: g.t[0], notes_occupied: g.t[1] })));
  // Soft: a pickup bar is shorter than the time signature, and a whole-bar rest is a whole note in any time
  const voices = notes.map(list => new VF.Voice({ num_beats: m.time[0], beat_value: m.time[1] })
    .setMode(VF.Voice.Mode.SOFT).addTickables(list));
  voices.forEach(v => VF.Accidental.applyAccidentals([v], key?.vfKey ?? "C"));
  const beams = notes.flatMap(list => VF.Beam.generateBeams(list, { groups: VF.Beam.getDefaultBeamGroups(timeSpec) }));

  // Each bar as wide as its notes need, plus a share of what's left over
  const opts = { space_above_staff_ln: 0, space_below_staff_ln: 0 };
  const first = new VF.Stave(0, 0, 100, opts).addClef(m.clef);
  if (key) first.addKeySignature(key.vfKey);
  first.addTimeSignature(timeSpec);
  const header = first.getNoteStartX();
  const plainHeader = new VF.Stave(0, 0, 100, opts).getNoteStartX();
  const need = voices.map(v => new VF.Formatter().joinVoices([v]).preCalculateMinTotalWidth([v]) + BAR_PAD);
  const fixed = header + (voices.length - 1) * plainHeader;
  const total = Math.max(MIN_W - 2 * MARGIN, fixed + need.reduce((a, b) => a + b, 0));
  const spare = total - fixed - need.reduce((a, b) => a + b, 0);
  const sumNeed = need.reduce((a, b) => a + b, 0) || 1;
  const viewW = total + 2 * MARGIN;

  const renderer = new VF.Renderer(el as HTMLDivElement, VF.Renderer.Backends.SVG);
  renderer.resize(viewW, VIEW_H);
  const ctx = renderer.getContext();
  const svg = el.querySelector("svg")!;
  svg.setAttribute("viewBox", `0 0 ${viewW} ${VIEW_H}`);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.width = "100%";
  svg.style.height = "auto";

  let x = MARGIN;
  voices.forEach((voice, b) => {
    const width = (b ? plainHeader : header) + need[b] + spare * need[b] / sumNeed;
    const stave = new VF.Stave(x, ABOVE, width, opts);
    if (!b) {
      stave.addClef(m.clef);
      if (key) stave.addKeySignature(key.vfKey);
      stave.addTimeSignature(timeSpec);
    }
    stave.setContext(ctx).draw();
    voice.setStave(stave);
    new VF.Formatter().joinVoices([voice]).formatToStave([voice], stave);
    voice.draw(ctx, stave);
    x += width;
  });
  beams.forEach(beam => beam.setContext(ctx).draw());
  tuplets.forEach(t => t.setContext(ctx).draw());
  // Ties: from a tied note to the next note, across a bar line too
  const flat = m.bars.flatMap((bar, b) => bar.map((e, i) => ({ e, note: notes[b][i] })));
  flat.forEach(({ e, note }, k) => {
    const next = flat[k + 1];
    if (!e.tie || !next || next.e.p == null) return;
    new VF.StaveTie({ first_note: note, last_note: next.note, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
  });
}
