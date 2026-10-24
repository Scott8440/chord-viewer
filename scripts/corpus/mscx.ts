// Reads the voice part of a MuseScore score (.mscx, versions 2 and 3) into bars of notes and rests, as written.
// Anything this can't represent faithfully (a chord in the voice part, a second voice, a time jump, a bar that
// doesn't add up) is noted on the bar, so the excerpts can avoid it.
import type { ExcerptEvent, NoteValue } from "../../src/exercises/excerpts.ts";
import { eventLength } from "../../src/exercises/excerpts.ts";
import { child, kids, parseXml, textOf, type XmlElement } from "./xml.ts";

export interface LineBar {
  /** 1-based, in score order (pickups and repeats as they appear) */
  number: number;
  /** Actual length, as a fraction of a whole note (a pickup is shorter than the time signature) */
  length: number;
  key: number;
  time: [number, number];
  /** "G", "G8vb" (tenor: sounds an octave below the written note), "F" … */
  clef: string;
  events: ExcerptEvent[];
  /** Why the bar can't be used, if it can't */
  problems: string[];
}

export interface MelodyLine {
  title: string;
  scoreId: string;
  bars: LineBar[];
}

const VALUES: Record<string, NoteValue> = {
  whole: "w", half: "h", quarter: "q", eighth: "8", "16th": "16", "32nd": "32", "64th": "64",
};
const GRACE = /^(grace\d+(after)?|acciaccatura|appoggiatura)$/;

const fraction = (s: string | undefined) => {
  if (!s) return null;
  const [n, d] = s.split("/").map(Number);
  return d ? n / d : null;
};

/** The voice part's staff: the first staff of the first part whose instrument is a voice */
function voiceStaff(score: XmlElement): { id: string; clef: string } | null {
  for (const part of kids(score, "Part")) {
    const inst = child(part, "Instrument");
    const id = textOf(inst, "instrumentId") ?? "";
    const name = (textOf(part, "trackName") ?? textOf(inst, "trackName") ?? "").toLowerCase();
    if (!id.startsWith("voice") && !/voice|soprano|alto|tenor|bass|baritone|mezzo|singstimme|gesang/.test(name)) continue;
    const staff = child(part, "Staff");
    if (!staff) return null;
    return { id: staff.attrs.id, clef: textOf(staff, "defaultClef") ?? textOf(inst, "clef") ?? "G" };
  }
  return null;
}

export function readMscx(src: string, scoreId: string): MelodyLine | null {
  const doc = parseXml(src);
  const score = child(child(doc, "museScore"), "Score");
  if (!score) return null;
  const voice = voiceStaff(score);
  if (!voice) return null;
  const staff = kids(score, "Staff").find(s => s.attrs.id === voice.id);
  if (!staff) return null;
  const title = kids(child(staff, "VBox"), "Text").find(t => textOf(t, "style") === "Title")
    ?.children.find(c => c.name === "text")?.text.replace(/\s+/g, " ").trim() ?? "";

  const bars: LineBar[] = [];
  let key = 0, time: [number, number] = [4, 4], clef = voice.clef;
  /** Tuplets defined by id (version 2), and the ones open now (version 3: until <endTuplet/>) */
  const tupletDefs = new Map<string, [number, number]>();
  const open: [number, number][] = [];

  for (const measure of kids(staff, "Measure")) {
    const problems: string[] = [];
    const events: ExcerptEvent[] = [];
    // Version 3 wraps each voice in <voice>; version 2 lists everything in the bar, voices told apart by <track>
    const voices = kids(measure, "voice");
    if (voices.length > 1 && voices.slice(1).some(v => v.children.some(c => c.name === "Chord"))) problems.push("second voice");
    const items = voices.length ? [...measure.children.filter(c => c.name !== "voice"), ...voices[0].children]
      : measure.children.filter(c => (textOf(c, "track") ?? "0") === "0");
    if (!voices.length && measure.children.some(c => c.name === "Chord" && (textOf(c, "track") ?? "0") !== "0")) problems.push("second voice");

    for (const el of items) {
      switch (el.name) {
        case "KeySig": key = Number(textOf(el, "accidental") ?? textOf(el, "concertKey") ?? key); break;
        case "TimeSig": time = [Number(textOf(el, "sigN")), Number(textOf(el, "sigD"))]; break;
        case "Clef": clef = textOf(el, "concertClefType") ?? clef; break;
        case "Tuplet": {
          const ratio: [number, number] = [Number(textOf(el, "actualNotes")), Number(textOf(el, "normalNotes"))];
          if (el.attrs.id) tupletDefs.set(el.attrs.id, ratio);
          else if (ratio[0]) open.push(ratio);
          break;
        }
        case "endTuplet": open.pop(); break;
        case "location": case "tick": problems.push("time jump"); break;
        case "Chord": case "Rest": {
          if (el.children.some(c => GRACE.test(c.name))) break;   // ornaments: left out
          const type = textOf(el, "durationType") ?? "";
          const ref = textOf(el, "Tuplet");
          const tuplet = ref ? tupletDefs.get(ref) : open[open.length - 1];
          if (open.length > 1) problems.push("nested tuplet");
          if (type === "measure") { events.push({ v: "w", bar: 1 }); break; }
          const v = VALUES[type];
          if (!v) { problems.push(`value ${type}`); break; }
          const e: ExcerptEvent = { v };
          const dots = Number(textOf(el, "dots") ?? 0);
          if (dots) e.d = dots;
          if (tuplet) e.t = tuplet;
          if (el.name === "Chord") {
            const notes = kids(el, "Note");
            if (notes.length !== 1) problems.push("chord");
            // The top note, for a chord
            const note = notes.reduce((a, b) => Number(textOf(b, "pitch")) > Number(textOf(a, "pitch")) ? b : a);
            e.p = Number(textOf(note, "pitch"));
            e.s = Number(textOf(note, "tpc"));
            const tied = child(note, "Tie") ||
              kids(note, "Spanner").some(sp => sp.attrs.type === "Tie" && child(sp, "next"));
            if (tied) e.tie = 1;
          }
          events.push(e);
          break;
        }
      }
    }
    const nominal = time[0] / time[1];
    const length = fraction(measure.attrs.len) ?? nominal;
    const filled = events.reduce((sum, e) => sum + (e.bar ? length : eventLength(e)), 0);
    if (Math.abs(filled - length) > 1e-6) problems.push("doesn't add up");
    bars.push({ number: bars.length + 1, length, key, time, clef, events, problems });
  }
  return { title, scoreId, bars };
}
