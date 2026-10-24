// Cuts a melody into sight-reading excerpts and measures how hard each is to read. A phrase is a run of notes
// between rests (where a singer breathes); an excerpt is the whole bars one phrase, or two neighbouring ones,
// covers, up to MAX_BARS, as long as every bar is clean: one voice, no chords, the same key, time and clef
// throughout, and bars that add up.
import {
  eventLength, LEDGER, staffStep, tpcAlter, type Excerpt, type ExcerptEvent, type ExcerptFeatures,
} from "../../src/exercises/excerpts.ts";
import type { LineBar, MelodyLine } from "./mscx.ts";

export const MAX_BARS = 4;

const CLEFS: Record<string, { clef: Excerpt["clef"]; shift: number }> = {
  G: { clef: "treble", shift: 0 },
  // Tenor parts: written an octave above how they sound; the excerpt is the written notes, on a plain treble staff
  G8vb: { clef: "treble", shift: 12 },
  F: { clef: "bass", shift: 0 },
};

/** Bars that can't share an excerpt: a change of key, time or clef, or a bar with a problem */
const sameSetting = (a: LineBar, b: LineBar) =>
  a.key === b.key && a.time[0] === b.time[0] && a.time[1] === b.time[1] && a.clef === b.clef;

/** Fewer notes than this isn't a phrase worth reading */
export const MIN_NOTES = 4;

/** A place in the line: [bar index, event index] */
export type Pos = [number, number];

export interface Phrase {
  from: Pos;
  to: Pos;
  /** Notes to play (a tied note counts once) */
  notes: number;
}

/**
 * Phrases: runs of notes, each ended by a rest (or the end of the song). One cut short by a bar that can't be used,
 * or by a change of key, time or clef, is left out: it isn't whole.
 */
export function phrases(bars: readonly LineBar[]): Phrase[] {
  const out: Phrase[] = [];
  let current: Phrase | null = null, tiedOn = false;
  bars.forEach((bar, b) => {
    if (bar.problems.length || (b > 0 && !sameSetting(bars[b - 1], bar))) current = null;
    if (bar.problems.length) return;
    bar.events.forEach((e, i) => {
      if (e.p == null) {
        if (current) out.push(current);
        current = null;
        tiedOn = false;
        return;
      }
      current ??= { from: [b, i], to: [b, i], notes: 0 };
      current.to = [b, i];
      if (!tiedOn) current.notes++;
      tiedOn = !!e.tie;
    });
  });
  if (current) out.push(current);
  return out;
}

/** The candidate excerpts: each phrase, and each pair of neighbouring phrases, within MAX_BARS and with MIN_NOTES */
export function excerptRanges(bars: readonly LineBar[]): Phrase[] {
  const ps = phrases(bars);
  const out: Phrase[] = [];
  const add = (p: Phrase) => {
    const [a, b] = [p.from[0], p.to[0]];
    if (b - a + 1 > MAX_BARS || p.notes < MIN_NOTES) return;
    for (let i = a + 1; i <= b; i++) if (bars[i].problems.length || !sameSetting(bars[i - 1], bars[i])) return;
    // A whole bar's rest inside is a gap between phrases, not part of one
    for (let i = a; i <= b; i++) if (bars[i].events.some(e => e.bar)) return;
    out.push(p);
  };
  ps.forEach((p, i) => {
    add(p);
    const next = ps[i + 1];
    if (next) add({ from: p.from, to: next.to, notes: p.notes + next.notes });
  });
  return out;
}

/** The alteration the key signature gives a letter */
function signatureAlter(key: number, tpc: number): number {
  const letter = "FCGDAEB"[((tpc + 1) % 7 + 7) % 7];
  if (key > 0) return "FCGDAEB".indexOf(letter) < key ? 1 : 0;
  if (key < 0) return "BEADGCF".indexOf(letter) < -key ? -1 : 0;
  return 0;
}

export function measure(bars: readonly ExcerptEvent[][], key: number, time: [number, number], clef: Excerpt["clef"]): ExcerptFeatures {
  const compound = time[1] === 8 && time[0] % 3 === 0 && time[0] > 3;
  const beat = compound ? 3 / 8 : 1 / time[1];
  const barLength = time[0] / time[1];
  // Notes to play, with tied notes joined, and where they start
  const played: { p: number; s: number; at: number; len: number }[] = [];
  const all = bars.flatMap((bar, b) => {
    let at = 0;
    return bar.map(e => {
      const len = e.bar ? barLength : eventLength(e);
      const item = { e, at, b, len };
      at += len;
      return item;
    });
  });
  let tiedOn = false;
  for (const { e, at, len } of all) {
    if (e.p == null) { tiedOn = false; continue; }
    if (tiedOn) played[played.length - 1].len += len;
    else played.push({ p: e.p, s: e.s!, at, len });
    tiedOn = !!e.tie;
  }
  const pitches = played.map(n => n.p);
  const leaps = pitches.slice(1).map((p, i) => Math.abs(p - pitches[i]));
  const [low, high] = LEDGER[clef];
  const firstNote = all.findIndex(x => x.e.p != null);
  const lastNote = all.length - 1 - [...all].reverse().findIndex(x => x.e.p != null);
  const valueKey = (e: ExcerptEvent) => `${e.v}.${e.d ?? 0}.${e.t?.join(":") ?? ""}`;
  const timed = all.filter(x => !x.e.bar);
  return {
    notes: played.length,
    bars: bars.length,
    keyAccidentals: Math.abs(key),
    chromatic: played.filter(n => tpcAlter(n.s) !== signatureAlter(key, n.s)).length,
    range: pitches.length ? Math.max(...pitches) - Math.min(...pitches) : 0,
    ledger: played.filter(n => { const st = staffStep(n.p, n.s); return st < low || st > high; }).length,
    maxLeap: leaps.length ? Math.max(...leaps) : 0,
    stepShare: leaps.length ? leaps.filter(l => l > 0 && l <= 2).length / leaps.length : 1,
    values: new Set(timed.map(x => valueKey(x.e))).size,
    shortest: timed.length ? Math.min(...timed.map(x => x.len)) : barLength,
    dotted: timed.filter(x => x.e.d).length,
    ties: all.filter(x => x.e.tie).length,
    tuplets: timed.filter(x => x.e.t).length,
    rests: all.filter((x, i) => x.e.p == null && i > firstNote && i < lastNote).length,
    // Off the beat, and still sounding at the next beat
    syncopations: played.filter(n => {
      const offBeat = Math.abs(n.at / beat - Math.round(n.at / beat)) > 1e-6;
      const nextBeat = (Math.floor(n.at / beat + 1e-6) + 1) * beat;
      return offBeat && n.at + n.len > nextBeat + 1e-6;
    }).length,
    compound,
  };
}

const PLAIN: { v: ExcerptEvent["v"]; d?: number; len: number }[] = [
  { v: "w", len: 1 }, { v: "h", d: 1, len: 3 / 4 }, { v: "h", len: 1 / 2 }, { v: "q", d: 1, len: 3 / 8 }, { v: "q", len: 1 / 4 },
  { v: "8", d: 1, len: 3 / 16 }, { v: "8", len: 1 / 8 }, { v: "16", len: 1 / 16 }, { v: "32", len: 1 / 32 }, { v: "64", len: 1 / 64 },
];
const EPS = 1e-9;
const onGrid = (x: number, step: number) => Math.abs(x / step - Math.round(x / step)) < 1e-6;

/**
 * Rests to fill [from, to) of a bar the way they're written: each as long as it can be while starting on a multiple
 * of its own length (dotted ones on the beat, and only in compound time), so a gap reads beat by beat. A whole
 * bar's rest is the whole-bar rest. Null if the gap isn't on the plain-value grid (part of a tuplet).
 */
export function restsFor(from: number, to: number, time: [number, number]): ExcerptEvent[] | null {
  const barLength = time[0] / time[1];
  if (Math.abs(from) < EPS && Math.abs(to - barLength) < EPS) return [{ v: "w", bar: 1 }];
  if (!onGrid(from, 1 / 64) || !onGrid(to, 1 / 64)) return null;
  const compound = time[1] === 8 && time[0] % 3 === 0 && time[0] > 3;
  const beat = compound ? 3 / 8 : 1 / time[1];
  const out: ExcerptEvent[] = [];
  for (let at = from; at < to - EPS;) {
    const r = PLAIN.find(r => at + r.len <= to + EPS && (r.d ? compound && onGrid(at, beat) && r.len <= beat * 2 + EPS : onGrid(at, r.len)) &&
      // Across a beat only from a beat and for whole beats
      (Math.floor(at / beat + 1e-6) === Math.floor((at + r.len) / beat - 1e-6) || (onGrid(at, beat) && onGrid(r.len, beat))) &&
      // Never across the middle of a 4/4 bar, unless it's the whole bar
      !(time[0] === 4 && time[1] === 4 && at < 1 / 2 - EPS && at + r.len > 1 / 2 + EPS));
    if (!r) return null;
    out.push(r.d ? { v: r.v, d: r.d } : { v: r.v });
    at += r.len;
  }
  return out;
}

/** Merges each run of rests that contains a `made` one (a note turned into a rest) into tidy rests; others as written */
function tidyBar(events: ExcerptEvent[], made: boolean[], time: [number, number]): ExcerptEvent[] {
  const out: ExcerptEvent[] = [];
  let at = 0;
  for (let i = 0; i < events.length;) {
    if (events[i].p != null) { out.push(events[i]); at += eventLength(events[i]); i++; continue; }
    let j = i, end = at, any = false;
    for (; j < events.length && events[j].p == null; j++) { end += events[j].bar ? time[0] / time[1] : eventLength(events[j]); any ||= made[j]; }
    const tidy = any ? restsFor(at, end, time) : null;
    out.push(...(tidy ?? events.slice(i, j)));
    at = end;
    i = j;
  }
  return out;
}

/** A line's excerpts, with `source` left for the caller to fill in */
export function cutExcerpts(line: MelodyLine): Omit<Excerpt, "source">[] {
  const out: Omit<Excerpt, "source">[] = [];
  for (const { from, to } of excerptRanges(line.bars)) {
    const [a, b] = [from[0], to[0]];
    const first = line.bars[a];
    const notation = CLEFS[first.clef];
    if (!notation) continue;
    // The phrase's own notes, written; a neighbouring phrase's notes sharing its first or last bar become rests of
    // the same length, so the bars still add up
    const bars = line.bars.slice(a, b + 1).map((bar, k) => {
      const outside = (i: number) => (k === 0 && i < from[1]) || (a + k === b && i > to[1]);
      const events = bar.events.map((e, i): ExcerptEvent => {
        if (e.p == null || outside(i)) {
          const { p: _p, s: _s, tie: _tie, ...rest } = e;
          return rest;
        }
        // A tie out of the phrase has nothing to land on here
        if (a + k === b && i === to[1]) { const { tie: _tie, ...last } = e; return { ...last, p: e.p + notation.shift }; }
        return { ...e, p: e.p + notation.shift };
      });
      return tidyBar(events, bar.events.map((e, i) => e.p != null && outside(i)), first.time);
    });
    out.push({
      id: `${line.scoreId}:${first.number}.${from[1]}-${line.bars[b].number}.${to[1]}`,
      key: first.key, time: first.time, clef: notation.clef, bars,
      features: measure(bars, first.key, first.time, notation.clef),
    });
  }
  return out;
}
