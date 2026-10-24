// Easy both-hands pieces made from song melodies: the melody in the right hand, and a simple left hand added under
// it, one bass note on beats 1 and 3 (a half note in 4/4 or 2/2; on beat 1 only in 2/4 and 3/4), each the root of the
// chord in the key that best fits the melody sounding over it. Not as written: excerpts made this way say so
// (`arranged: "bass"`).
import { eventLength, type Excerpt, type ExcerptEvent, type ExcerptStaff } from "../../src/exercises/excerpts.ts";
import { restsFor } from "./excerpts.ts";

/** How each time signature's bar is split for the bass: the value of each bass note */
const SPLITS: Record<string, ExcerptEvent> = {
  "4/4": { v: "h" }, "2/2": { v: "h" }, "2/4": { v: "h" }, "3/4": { v: "h", d: 1 },
};

/** The major scale's degrees as fifths from the tonic: I ii iii IV V vi vii */
const DEGREE_FIFTHS = [0, 2, 4, -1, 1, 3, 5];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

interface Chord {
  /** Root spelling (tpc) */
  root: number;
  pcs: number[];
  /** How likely, all else equal */
  prior: number;
  /** I or vi: a place to start and end */
  tonic: boolean;
}

/** The chords a bass can come from in a key signature (in fifths): its major key's I ii iii IV V vi, and the
 *  relative minor's major V (E major in C), only when the melody has its raised note */
function chordsIn(fifths: number): Chord[] {
  const tonicPc = ((fifths * 7) % 12 + 12) % 12;
  const scale = MAJOR.map(i => (tonicPc + i) % 12);
  const priors = [0.3, 0.1, 0, 0.2, 0.25, 0.15];
  const out: Chord[] = priors.map((prior, d) => ({
    root: 14 + fifths + DEGREE_FIFTHS[d], prior, tonic: d === 0 || d === 5,
    pcs: [scale[d], scale[(d + 2) % 7], scale[(d + 4) % 7]],
  }));
  const iii = scale[2];
  out.push({ root: 14 + fifths + DEGREE_FIFTHS[2], prior: 0.05, tonic: false, pcs: [iii, (iii + 4) % 12, (iii + 7) % 12] });
  return out;
}

const pcOf = (p: number) => ((p % 12) + 12) % 12;
const tpcPc = (tpc: number) => (((tpc - 14) * 7) % 12 + 12) % 12;

/** The lowest and highest bass notes: the bass staff without ledger lines (F2–G3) */
const LOW = 41, HIGH = 55;

/**
 * A left hand for a melody excerpt (one treble staff, one voice), or null when its time signature or bars don't
 * suit (compound time, a short bar other than a pickup at the start).
 */
export function bassFor(e: Pick<Excerpt, "key" | "time" | "staves">): ExcerptStaff | null {
  const melody = e.staves[0];
  if (e.staves.length !== 1 || melody.clef !== "treble" || melody.voices.length !== 1) return null;
  const value = SPLITS[e.time.join("/")];
  if (!value) return null;
  const bar = e.time[0] / e.time[1], span = eventLength(value);
  const bars = melody.voices[0];
  const lengths = bars.map(b => b.reduce((sum, x) => sum + (x.bar ? bar : eventLength(x)), 0));
  if (lengths.some((len, i) => (i > 0 || len > bar + 1e-9) && Math.abs(len - bar) > 1e-9)) return null;

  // The melody's notes, each with when it sounds; spans of the bass, each with where it starts
  const notes: { pc: number; from: number; to: number }[] = [];
  const spans: { from: number; to: number }[] = [];
  let at = 0;
  bars.forEach((b, i) => {
    // A pickup bar's notes are at the end of its bar: it gets no bass
    let t = at;
    for (const x of b) {
      const len = x.bar ? bar : eventLength(x);
      for (const n of x.n ?? []) notes.push({ pc: pcOf(n.p), from: t, to: t + len });
      t += len;
    }
    if (i > 0 || lengths[0] >= bar - 1e-9) for (let s = 0; s + span <= bar + 1e-9; s += span) spans.push({ from: at + s, to: at + s + span });
    at += lengths[i];
  });
  if (!spans.length) return null;

  // Each span's chord: the one whose notes best cover the melody sounding then (longer notes, and a note sounding as
  // the bass starts, count most), leaning to the tonic at the start and end and to staying put
  const chords = chordsIn(e.key);
  const picked: Chord[] = [];
  spans.forEach((sp, i) => {
    const sounding = notes.filter(n => n.to > sp.from + 1e-9 && n.from < sp.to - 1e-9);
    let best = chords[0], bestScore = -Infinity;
    for (const c of chords) {
      if (c === chords[6] && !sounding.some(n => n.pc === c.pcs[1])) continue;
      let score = c.prior;
      for (const n of sounding) {
        const w = (Math.min(n.to, sp.to) - Math.max(n.from, sp.from)) / span * (n.from <= sp.from + 1e-9 ? 1.5 : 1);
        score += c.pcs.includes(n.pc) ? w : -0.6 * w;
      }
      if (c.tonic && (i === 0 || i === spans.length - 1)) score += 0.3;
      if (picked[i - 1] === c) score += 0.1;
      if (score > bestScore) { best = c; bestScore = score; }
    }
    picked.push(best);
  });

  // The roots, each in the octave nearest the last, on the staff
  let last = 48;
  const bass = picked.map(c => {
    const pc = tpcPc(c.root);
    const options = [];
    for (let p = LOW; p <= HIGH; p++) if (pcOf(p) === pc) options.push(p);
    const p = options.reduce((a, b) => Math.abs(b - last) < Math.abs(a - last) ? b : a);
    last = p;
    return { p, s: c.root };
  });

  // Bar by bar: a pickup gets rests; every other bar its bass notes
  let k = 0;
  const lh: ExcerptEvent[][] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0 && lengths[0] < bar - 1e-9) {
      const rests = restsFor(bar - lengths[0], bar, e.time);
      if (!rests) return null;
      lh.push(rests);
      continue;
    }
    const events: ExcerptEvent[] = [];
    for (let s = 0; s + span <= bar + 1e-9; s += span) events.push({ ...value, n: [bass[k++]] });
    lh.push(events);
  }
  return { clef: "bass", voices: [lh] };
}
