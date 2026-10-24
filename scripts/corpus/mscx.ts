// Reads a MuseScore score (.mscx, versions 2 and 3): the voice part and the piano part's two staves, each into bars
// of voices of notes, chords and rests, as written. Anything this can't represent faithfully (a cross-staff note, a
// tremolo, a voice that runs back over itself, a bar that doesn't add up …) is noted on the bar, so the excerpts can
// avoid it.
import type { ExcerptEvent, ExcerptNote, NoteValue } from "../../src/exercises/excerpts.ts";
import { eventLength } from "../../src/exercises/excerpts.ts";
import { child, kids, parseXml, textOf, type XmlElement } from "./xml.ts";

export interface StaffBar {
  /** 1-based, in score order (pickups and repeats as they appear) */
  number: number;
  /** Actual length, as a fraction of a whole note (a pickup is shorter than the time signature) */
  length: number;
  key: number;
  time: [number, number];
  /** The clef at the start of the bar: "G", "G8vb" (tenor: sounds an octave below the written note), "F" … */
  clef: string;
  /** Voice 1, then any others that have notes in this bar (one sitting out part of the bar has hidden spaces) */
  voices: ExcerptEvent[][];
  /** Why the bar can't be used, if it can't */
  problems: string[];
}

export interface ScoreParts {
  title: string;
  scoreId: string;
  /** The voice part's staff */
  voice: StaffBar[] | null;
  /** The piano's right- and left-hand staves */
  piano: [StaffBar[], StaffBar[]] | null;
}

const VALUES: Record<string, NoteValue> = {
  whole: "w", half: "h", quarter: "q", eighth: "8", "16th": "16", "32nd": "32", "64th": "64",
};
const GRACE = /^(grace\d+(after)?|acciaccatura|appoggiatura)$/;
const EPS = 1e-6;

const fraction = (s: string | undefined) => {
  if (!s) return null;
  const [n, d] = s.split("/").map(Number);
  return d ? n / d : null;
};

const partName = (part: XmlElement) => {
  const inst = child(part, "Instrument");
  return { id: textOf(inst, "instrumentId") ?? "", name: (textOf(part, "trackName") ?? textOf(inst, "trackName") ?? "").toLowerCase() };
};
const staffOf = (part: XmlElement, i: number) => {
  const staff = kids(part, "Staff")[i];
  // The instrument's clef for this staff: <clef> for the first, <clef staff="2"> for the second …
  const instClef = kids(child(part, "Instrument"), "clef").find(c => (c.attrs.staff ?? "1") === String(i + 1))?.text.trim();
  return staff && { id: staff.attrs.id, clef: textOf(staff, "defaultClef") ?? instClef ?? "G" };
};

/** Plain values filling a gap, longest first (a voice sitting out part of a bar: drawn as nothing) */
function spaces(length: number): ExcerptEvent[] | null {
  const out: ExcerptEvent[] = [];
  const plain: [NoteValue, number][] = [["w", 1], ["h", 1 / 2], ["q", 1 / 4], ["8", 1 / 8], ["16", 1 / 16], ["32", 1 / 32], ["64", 1 / 64]];
  for (let left = length; left > EPS;) {
    const p = plain.find(([, len]) => len <= left + EPS);
    if (!p) return null;
    out.push({ v: p[0], hide: 1 });
    left -= p[1];
  }
  return out;
}

/** Reads one staff, bar by bar */
function readStaff(staff: XmlElement, defaultClef: string): StaffBar[] {
  const bars: StaffBar[] = [];
  let key = 0, time: [number, number] = [4, 4], clef = defaultClef;
  /** Tuplets defined by id (version 2), and the ones open now (version 3: until <endTuplet/>) */
  const tupletDefs = new Map<string, [number, number]>();

  for (const measure of kids(staff, "Measure")) {
    const problems: string[] = [];
    let startClef = clef;
    // Version 3 wraps each voice in <voice>; version 2 lists everything in the bar, voices told apart by <track>
    // (track mod 4); only its first voice is read, since the others are placed by absolute ticks
    const v3 = kids(measure, "voice");
    const voiceItems: XmlElement[][] = v3.length
      ? v3.map((v, i) => i ? v.children : [...measure.children.filter(c => c.name !== "voice"), ...v.children])
      : [measure.children.filter(c => Number(textOf(c, "track") ?? 0) % 4 === 0)];
    if (!v3.length && measure.children.some(c => c.name === "Chord" && Number(textOf(c, "track") ?? 0) % 4 !== 0)) problems.push("second voice");

    const voices: ExcerptEvent[][] = [];
    voiceItems.forEach((items, vi) => {
      const events: ExcerptEvent[] = [];
      const open: [number, number][] = [];
      /** Where the next element goes, and where the last note or rest ended */
      let at = 0, filled = 0;
      for (const el of items) {
        switch (el.name) {
          case "KeySig": if (!vi) key = Number(textOf(el, "accidental") ?? textOf(el, "concertKey") ?? key); break;
          case "TimeSig": if (!vi) time = [Number(textOf(el, "sigN")), Number(textOf(el, "sigD"))]; break;
          case "Clef": {
            clef = textOf(el, "concertClefType") ?? clef;
            // One at the end of a bar is for the next; one in the middle can't be drawn here
            const barLength = fraction(measure.attrs.len) ?? time[0] / time[1];
            if (filled > EPS && filled < barLength - EPS) problems.push("clef change");
            // One before the first note is this bar's clef
            else if (filled <= EPS) startClef = clef;
            break;
          }
          case "Tuplet": {
            const ratio: [number, number] = [Number(textOf(el, "actualNotes")), Number(textOf(el, "normalNotes"))];
            if (el.attrs.id) tupletDefs.set(el.attrs.id, ratio);
            else if (ratio[0]) open.push(ratio);
            break;
          }
          case "endTuplet": open.pop(); break;
          case "location": {
            if (textOf(el, "measures")) { problems.push("time jump"); break; }
            at += fraction(textOf(el, "fractions")) ?? 0;
            break;
          }
          case "tick": problems.push("time jump"); break;
          case "Chord": case "Rest": {
            if (el.children.some(c => GRACE.test(c.name))) break;   // ornaments: left out
            if (child(el, "staffMove") || child(el, "move")) problems.push("cross-staff");
            if (child(el, "Tremolo")) problems.push("tremolo");
            const type = textOf(el, "durationType") ?? "";
            const ref = textOf(el, "Tuplet");
            const tuplet = ref ? tupletDefs.get(ref) : open[open.length - 1];
            if (open.length > 1) problems.push("nested tuplet");
            if (at < filled - EPS) { problems.push("overlap"); break; }
            if (at > filled + EPS) {
              const gap = spaces(at - filled);
              if (!gap) { problems.push("gap"); break; }
              events.push(...gap);
              filled = at;
            }
            let e: ExcerptEvent;
            if (type === "measure") e = { v: "w", bar: 1 };
            else {
              const v = VALUES[type];
              if (!v) { problems.push(`value ${type}`); break; }
              e = { v };
              const dots = Number(textOf(el, "dots") ?? 0);
              if (dots) e.d = dots;
              if (tuplet) e.t = tuplet;
            }
            if (el.name === "Chord") {
              const notes = kids(el, "Note").map((note): ExcerptNote => {
                const n: ExcerptNote = { p: Number(textOf(note, "pitch")), s: Number(textOf(note, "tpc")) };
                if (child(note, "Tie") || kids(note, "Spanner").some(sp => sp.attrs.type === "Tie" && child(sp, "next"))) n.tie = 1;
                return n;
              });
              // Low to high, and a pitch once (a unison written twice is struck once)
              e.n = notes.sort((a, b) => a.p - b.p).filter((n, i, all) => !i || n.p !== all[i - 1].p);
            }
            events.push(e);
            const len = e.bar ? fraction(measure.attrs.len) ?? time[0] / time[1] : eventLength(e);
            at = filled = at + len;
            break;
          }
        }
      }
      // A later voice that's only rests (or nothing) isn't there
      if (!vi || events.some(e => e.n)) voices.push(events);
    });

    const length = fraction(measure.attrs.len) ?? time[0] / time[1];
    voices.forEach((events, vi) => {
      const filled = events.reduce((sum, e) => sum + (e.bar ? length : eventLength(e)), 0);
      // The first voice fills the bar; another may stop early (the rest of the bar is the first voice's)
      if (vi === 0 ? Math.abs(filled - length) > EPS : filled > length + EPS) problems.push("doesn't add up");
    });
    bars.push({ number: bars.length + 1, length, key, time, clef: startClef, voices, problems });
  }
  return bars;
}

export function readMscx(src: string, scoreId: string): ScoreParts | null {
  const doc = parseXml(src);
  const score = child(child(doc, "museScore"), "Score");
  if (!score) return null;
  const staffById = (id: string) => kids(score, "Staff").find(s => s.attrs.id === id);
  let voice: StaffBar[] | null = null, piano: [StaffBar[], StaffBar[]] | null = null, titleStaff: XmlElement | undefined;
  for (const part of kids(score, "Part")) {
    const { id, name } = partName(part);
    const isVoice = id.startsWith("voice") || /voice|soprano|alto|tenor|bass|baritone|mezzo|singstimme|gesang/.test(name);
    const isPiano = id.startsWith("keyboard.piano") || /piano|klavier|pianoforte/.test(name);
    if (isVoice && !voice) {
      const s = staffOf(part, 0), staff = s && staffById(s.id);
      if (staff) { voice = readStaff(staff, s.clef); titleStaff ??= staff; }
    } else if (isPiano && !piano && kids(part, "Staff").length === 2) {
      const [r, l] = [staffOf(part, 0), staffOf(part, 1)];
      const [rs, ls] = [staffById(r.id), staffById(l.id)];
      if (rs && ls) { piano = [readStaff(rs, r.clef), readStaff(ls, l.clef)]; titleStaff ??= rs; }
    }
  }
  if (!voice && !piano) return null;
  const first = kids(score, "Staff")[0] ?? titleStaff;
  const title = kids(child(first, "VBox"), "Text").find(t => textOf(t, "style") === "Title")
    ?.children.find(c => c.name === "text")?.text.replace(/\s+/g, " ").trim() ?? "";
  return { title, scoreId, voice, piano };
}
