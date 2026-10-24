// A passage of written music (VexFlow): one staff, or a grand staff for both hands. Clef, key and time signature,
// then its bars as written: chords, a second voice (stems up and down), rests, dots, ties, beams, tuplets, and
// accidentals as each bar needs them. Used by sight reading in place of the grand staff of held notes.
import * as VF from "vexflow/bravura";
import {
  excerptTimeline, staffStep, tpcName, tupletGroups, type Clef, type ExcerptEvent, type ExcerptStaff,
} from "../exercises/excerpts";
import type { KeyContext } from "../theory";

export type MusicStyle = "done" | "wrong";

export interface StaffMusic {
  staves: readonly ExcerptStaff[];
  time: [number, number];
  /** How to colour each note: `[staff][voice][bar][event][note]` (undefined: black) */
  styles: readonly (readonly (readonly (readonly (readonly (MusicStyle | undefined)[])[])[])[])[];
}

const STYLES: Record<MusicStyle, VF.ElementStyle> = {
  done: { fillStyle: "#2e8b57", strokeStyle: "#2e8b57" },
  wrong: { fillStyle: "#c8553d", strokeStyle: "#c8553d" },
};

/** Room above and below the staves (viewBox units) for ledger lines, stems, beams and tuplet numbers, and between
 *  the two staves of a grand staff; fixed, so the staff stays put from one passage to the next */
const ABOVE = 80, BELOW = 80, STAFF_H = 40, GAP = 80, MIN_W = 640;
/** Room either side; a grand staff's brace needs more on the left */
const MARGIN = 8, BRACE = 14;
/** Room a bar keeps after its notes */
const BAR_PAD = 22;

/** Where rests sit: centred alone; with two voices, the upper voice's high and the lower's low */
const REST_KEYS: Record<Clef, string[]> = { treble: ["b/4", "e/5", "f/4", "e/5", "f/4"], bass: ["d/3", "g/3", "a/2", "g/3", "a/2"] };

function makeNote(e: ExcerptEvent, clef: Clef, voice: number, voices: number,
                  styles: readonly (MusicStyle | undefined)[] | undefined): VF.StemmableNote {
  const dots = e.d ?? 0;
  if (e.hide) return new VF.GhostNote({ duration: e.v, dots });
  const stem = voices > 1 ? { stem_direction: voice % 2 ? -1 : 1 } : { auto_stem: true };
  const note = new VF.StaveNote({
    clef, dots, ...stem,
    duration: e.bar ? "wr" : e.v + (e.n ? "" : "r"),
    keys: e.n ? e.n.map(n => `${tpcName(n.s).toLowerCase()}/${Math.floor(staffStep(n.p, n.s) / 7)}`)
      : [REST_KEYS[clef][voices > 1 ? voice + 1 : 0]],
    align_center: !!e.bar,
  });
  for (let i = 0; i < dots; i++) VF.Dot.buildAndAttach([note], { all: true });
  if (styles?.length) {
    const first = styles[0];
    // All one colour: the stem and flag too; otherwise just the noteheads
    if (first && styles.every(s => s === first)) note.setStyle(STYLES[first]);
    styles.forEach((s, i) => { if (s) note.setKeyStyle(i, STYLES[s]); });
  }
  return note;
}

export function drawMusic(el: HTMLElement, m: StaffMusic, key: KeyContext | null) {
  el.innerHTML = "";
  const timeSpec = `${m.time[0]}/${m.time[1]}`;
  const barCount = m.staves[0].voices[0].length;
  const keySpec = key?.vfKey ?? "C";

  // Notes: [staff][voice][bar][event]; a voice missing from a bar has none there
  const notes = m.staves.map((st, si) => st.voices.map((voice, vi) => voice.map((bar, b) => {
    const voices = st.voices.filter(v => v[b]?.length).length;
    const shown = st.voices.slice(0, vi).filter(v => v[b]?.length).length;
    return bar.map((e, i) => makeNote(e, st.clef, shown, voices, m.styles[si]?.[vi]?.[b]?.[i]));
  })));
  const tuplets = m.staves.flatMap((st, si) => st.voices.flatMap((voice, vi) => voice.flatMap((bar, b) =>
    tupletGroups(bar).map(g => new VF.Tuplet(notes[si][vi][b].slice(g.from, g.to), { num_notes: g.t[0], notes_occupied: g.t[1] })))));
  // Each bar: a VexFlow voice per written voice there, per staff (soft: a pickup bar is short, a whole-bar rest is a
  // whole note in any time, and a second voice may stop early)
  const bars = Array.from({ length: barCount }, (_, b) => m.staves.map((st, si) => st.voices
    .map((_, vi) => notes[si][vi][b])
    .filter(list => list?.length)
    .map(list => new VF.Voice({ num_beats: m.time[0], beat_value: m.time[1] }).setMode(VF.Voice.Mode.SOFT).addTickables(list))));
  for (const bar of bars) for (const staffVoices of bar) VF.Accidental.applyAccidentals(staffVoices, keySpec);
  // Beams within each voice, never across a space; stems stay as set when a staff has two voices
  const beams = m.staves.flatMap((st, si) => st.voices.flatMap((voice, vi) => voice.flatMap((_, b) => {
    const list = notes[si][vi][b];
    const runs: VF.StemmableNote[][] = [[]];
    for (const n of list) { if (n instanceof VF.GhostNote) runs.push([]); else runs[runs.length - 1].push(n); }
    const multi = st.voices.filter(v => v[b]?.length).length > 1;
    return runs.flatMap(run => run.length > 1 ? VF.Beam.generateBeams(run, {
      groups: VF.Beam.getDefaultBeamGroups(timeSpec),
      ...(multi ? { maintain_stem_directions: true } : {}),
    }) : []);
  })));

  // Each bar as wide as its notes need (all staves together), plus a share of what's left over
  const opts = { space_above_staff_ln: 0, space_below_staff_ln: 0 };
  const firstStave = (clef: Clef) => {
    const s = new VF.Stave(0, 0, 100, opts).addClef(clef);
    if (key) s.addKeySignature(key.vfKey);
    return s.addTimeSignature(timeSpec);
  };
  const header = Math.max(...m.staves.map(st => firstStave(st.clef).getNoteStartX()));
  const plainHeader = new VF.Stave(0, 0, 100, opts).getNoteStartX();
  const formatters = bars.map(bar => {
    const f = new VF.Formatter();
    for (const staffVoices of bar) f.joinVoices(staffVoices);
    return f;
  });
  const need = bars.map((bar, b) => formatters[b].preCalculateMinTotalWidth(bar.flat()) + BAR_PAD);
  const sumNeed = need.reduce((a, x) => a + x, 0);
  const fixed = header + (barCount - 1) * plainHeader;
  const left = MARGIN + (m.staves.length > 1 ? BRACE : 0);
  const total = Math.max(MIN_W - left - MARGIN, fixed + sumNeed);
  const spare = total - fixed - sumNeed;
  const viewW = left + total + MARGIN;
  const staffY = m.staves.map((_, si) => ABOVE + si * (STAFF_H + GAP));
  const viewH = staffY[staffY.length - 1] + STAFF_H + BELOW;

  const renderer = new VF.Renderer(el as HTMLDivElement, VF.Renderer.Backends.SVG);
  renderer.resize(viewW, viewH);
  const ctx = renderer.getContext();
  const svg = el.querySelector("svg")!;
  svg.setAttribute("viewBox", `0 0 ${viewW} ${viewH}`);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.width = "100%";
  svg.style.height = "auto";

  let x = left;
  bars.forEach((bar, b) => {
    const width = (b ? plainHeader : header) + need[b] + spare * need[b] / (sumNeed || 1);
    const staves = m.staves.map((st, si) => {
      const stave = new VF.Stave(x, staffY[si], width, opts);
      if (!b) {
        stave.addClef(st.clef);
        if (key) stave.addKeySignature(key.vfKey);
        stave.addTimeSignature(timeSpec);
      }
      return stave;
    });
    // The notes start at the same x on both staves
    const start = Math.max(...staves.map(s => s.getNoteStartX()));
    staves.forEach(s => s.setNoteStartX(start).setContext(ctx).draw());
    if (staves.length > 1) {
      if (!b) new VF.StaveConnector(staves[0], staves[1]).setType("brace").setContext(ctx).draw();
      new VF.StaveConnector(staves[0], staves[1]).setType("singleLeft").setContext(ctx).draw();
      new VF.StaveConnector(staves[0], staves[1]).setType("singleRight").setContext(ctx).draw();
    }
    bar.forEach((staffVoices, si) => staffVoices.forEach(v => v.setStave(staves[si])));
    formatters[b].format(bar.flat(), staves[0].getNoteEndX() - start - 10);
    bar.forEach((staffVoices, si) => staffVoices.forEach(v => v.draw(ctx, staves[si])));
    x += width;
  });
  beams.forEach(beam => beam.setContext(ctx).draw());
  tuplets.forEach(t => t.setContext(ctx).draw());
  // Ties: the same ones the steps use (into the same pitch starting as the note ends, across voices and bar lines)
  for (const tie of excerptTimeline(m.staves, m.time).ties) {
    const [fs, fv, fb, fi] = tie.from, [ts, tv, tb, ti] = tie.to;
    const from = m.staves[fs].voices[fv][fb][fi].n!, to = m.staves[ts].voices[tv][tb][ti].n!;
    new VF.StaveTie({
      first_note: notes[fs][fv][fb][fi] as VF.StaveNote, last_note: notes[ts][tv][tb][ti] as VF.StaveNote,
      first_indices: tie.pitches.map(p => from.findIndex(n => n.p === p)),
      last_indices: tie.pitches.map(p => to.findIndex(n => n.p === p)),
    }).setContext(ctx).draw();
  }
}
