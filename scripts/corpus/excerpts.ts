// Cuts a song into sight-reading excerpts and measures how hard each is to read. A phrase is a run of notes in the
// melody between rests (where a singer breathes); a melody excerpt is the whole bars one phrase, or two neighbouring
// ones, covers, up to MAX_BARS, as long as every bar is clean: one voice, no chords, the same key, time and clef
// throughout, and bars that add up. A piano excerpt is the piano's two staves over the same bars, with whatever they
// hold (chords, a second voice), read as the right hand, the left hand, or both.
import {
  barLengths, eventLength, excerptSteps, ledgerLines, staffStep, tpcAlter, type Clef, type Excerpt, type ExcerptEvent,
  type ExcerptFeatures, type ExcerptStaff, type ReadingPart,
} from "../../src/exercises/excerpts.ts";
import type { ScoreParts, StaffBar } from "./mscx.ts";

export const MAX_BARS = 4;

const CLEFS: Record<string, { clef: Clef; shift: number }> = {
  G: { clef: "treble", shift: 0 },
  // Tenor parts: written an octave above how they sound; the excerpt is the written notes, on a plain treble staff
  G8vb: { clef: "treble", shift: 12 },
  F: { clef: "bass", shift: 0 },
};

/** Bars that can't share an excerpt: a change of key, time or clef */
const sameSetting = (a: StaffBar, b: StaffBar) =>
  a.key === b.key && a.time[0] === b.time[0] && a.time[1] === b.time[1] && a.clef === b.clef;

/** Fewer notes than this isn't a phrase worth reading */
export const MIN_NOTES = 4;

/** A melody's bars: its first voice, and a problem for a chord or a second voice */
export function asMelody(bars: readonly StaffBar[]): StaffBar[] {
  return bars.map(bar => {
    const problems = [...bar.problems];
    if (bar.voices.length > 1) problems.push("second voice");
    if (bar.voices[0].some(e => e.n && e.n.length > 1)) problems.push("chord");
    return { ...bar, voices: [bar.voices[0]], problems };
  });
}

/** A place in the melody: [bar index, event index] */
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
export function phrases(bars: readonly StaffBar[]): Phrase[] {
  const out: Phrase[] = [];
  let current: Phrase | null = null, tiedOn = false;
  bars.forEach((bar, b) => {
    if (bar.problems.length || (b > 0 && !sameSetting(bars[b - 1], bar))) current = null;
    if (bar.problems.length) return;
    bar.voices[0].forEach((e, i) => {
      if (!e.n) {
        if (current) out.push(current);
        current = null;
        tiedOn = false;
        return;
      }
      current ??= { from: [b, i], to: [b, i], notes: 0 };
      current.to = [b, i];
      if (!tiedOn) current.notes++;
      tiedOn = !!e.n[0].tie;
    });
  });
  if (current) out.push(current);
  return out;
}

/** The candidate excerpts: each phrase, and each pair of neighbouring phrases, within MAX_BARS and with MIN_NOTES */
export function excerptRanges(bars: readonly StaffBar[]): Phrase[] {
  const ps = phrases(bars);
  const out: Phrase[] = [];
  const add = (p: Phrase) => {
    const [a, b] = [p.from[0], p.to[0]];
    if (b - a + 1 > MAX_BARS || p.notes < MIN_NOTES) return;
    for (let i = a + 1; i <= b; i++) if (bars[i].problems.length || !sameSetting(bars[i - 1], bars[i])) return;
    // A whole bar's rest inside is a gap between phrases, not part of one
    for (let i = a; i <= b; i++) if (bars[i].voices[0].some(e => e.bar)) return;
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

export function measure(staves: readonly ExcerptStaff[], key: number, time: [number, number]): ExcerptFeatures {
  const compound = time[1] === 8 && time[0] % 3 === 0 && time[0] > 3;
  const beat = compound ? 3 / 8 : 1 / time[1];
  const lengths = barLengths(staves, time);
  const starts = lengths.map((_, b) => lengths.slice(0, b).reduce((a, x) => a + x, 0));
  const all = staves.flatMap(st => st.voices.flatMap(voice => voice.flatMap((bar, b) => {
    let at = starts[b];
    return bar.map(e => {
      const len = e.bar ? lengths[b] : eventLength(e);
      const item = { e, at, len };
      at += len;
      return item;
    });
  })));
  const timed = all.filter(x => !x.e.bar && !x.e.hide);
  const valueKey = (e: ExcerptEvent) => `${e.v}.${e.d ?? 0}.${e.t?.join(":") ?? ""}`;

  let chromatic = 0, range = 0, ledger = 0, chord = 0, span = 0, voices = 0, rests = 0, syncopations = 0;
  const leaps: number[] = [];
  for (const st of staves) {
    const struck = excerptSteps([st], time).steps;
    const notes = struck.flatMap(s => s.notes);
    chromatic += notes.filter(n => tpcAlter(n.s) !== signatureAlter(key, n.s)).length;
    for (const n of notes) ledger = Math.max(ledger, ledgerLines(staffStep(n.p, n.s), st.clef));
    if (notes.length) range = Math.max(range, Math.max(...notes.map(n => n.p)) - Math.min(...notes.map(n => n.p)));
    for (const s of struck) {
      chord = Math.max(chord, s.notes.length);
      span = Math.max(span, s.notes[s.notes.length - 1].p - s.notes[0].p);
    }
    for (let b = 0; b < lengths.length; b++) voices = Math.max(voices, st.voices.filter(v => v[b]?.length).length);
    for (const voice of st.voices) {
      // The voice's line: its top note in treble, bottom in bass
      const line = excerptSteps([{ clef: st.clef, voices: [voice] }], time).steps
        .map(s => st.clef === "treble" ? s.notes[s.notes.length - 1].p : s.notes[0].p);
      leaps.push(...line.slice(1).map((p, i) => Math.abs(p - line[i])));
      // Rests between its notes, and notes off the beat held over the next one (through ties)
      const events = voice.flatMap((bar, b) => {
        let at = starts[b];
        return bar.map(e => { const len = e.bar ? lengths[b] : eventLength(e); const x = { e, at, len }; at += len; return x; });
      });
      const first = events.findIndex(x => x.e.n), last = events.length - 1 - [...events].reverse().findIndex(x => x.e.n);
      rests += events.filter((x, i) => !x.e.n && !x.e.hide && i > first && i < last).length;
      events.forEach((x, i) => {
        if (!x.e.n || (i && events[i - 1].e.n?.some(n => n.tie && x.e.n!.some(m => m.p === n.p)))) return;
        let end = x.at + x.len;
        for (let j = i; events[j]?.e.n?.some(n => n.tie) && events[j + 1]?.e.n; j++) end += events[j + 1].len;
        const offBeat = Math.abs(x.at / beat - Math.round(x.at / beat)) > 1e-6;
        const nextBeat = (Math.floor(x.at / beat + 1e-6) + 1) * beat;
        if (offBeat && end > nextBeat + 1e-6) syncopations++;
      });
    }
  }
  return {
    notes: excerptSteps(staves, time).steps.length,
    bars: lengths.length,
    keyAccidentals: Math.abs(key),
    chromatic, range, ledger,
    maxLeap: leaps.length ? Math.max(...leaps) : 0,
    stepShare: leaps.length ? leaps.filter(l => l > 0 && l <= 2).length / leaps.length : 1,
    values: new Set(timed.map(x => valueKey(x.e))).size,
    shortest: timed.length ? Math.min(...timed.map(x => x.len)) : time[0] / time[1],
    dotted: timed.filter(x => x.e.d).length,
    ties: all.reduce((sum, x) => sum + (x.e.n?.filter(n => n.tie).length ?? 0), 0),
    tuplets: timed.filter(x => x.e.t).length,
    rests, syncopations, compound, chord, span, voices,
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
    if (events[i].n) { out.push(events[i]); at += eventLength(events[i]); i++; continue; }
    let j = i, end = at, any = false;
    for (; j < events.length && !events[j].n; j++) { end += events[j].bar ? time[0] / time[1] : eventLength(events[j]); any ||= made[j]; }
    const tidy = any ? restsFor(at, end, time) : null;
    out.push(...(tidy ?? events.slice(i, j)));
    at = end;
    i = j;
  }
  return out;
}

const shifted = (e: ExcerptEvent, shift: number): ExcerptEvent => e.n && shift ? { ...e, n: e.n.map(n => ({ ...n, p: n.p + shift })) } : e;

/** The melody's excerpts, with `source` left for the caller to fill in */
export function cutExcerpts(melody: readonly StaffBar[], scoreId: string): Omit<Excerpt, "source">[] {
  const out: Omit<Excerpt, "source">[] = [];
  for (const { from, to } of excerptRanges(melody)) {
    const [a, b] = [from[0], to[0]];
    const first = melody[a];
    const notation = CLEFS[first.clef];
    if (!notation) continue;
    // The phrase's own notes, written; a neighbouring phrase's notes sharing its first or last bar become rests of
    // the same length, so the bars still add up
    const bars = melody.slice(a, b + 1).map((bar, k) => {
      const events = bar.voices[0];
      const outside = (i: number) => (k === 0 && i < from[1]) || (a + k === b && i > to[1]);
      const kept = events.map((e, i): ExcerptEvent => {
        if (!e.n || outside(i)) {
          const { n: _n, ...rest } = e;
          return rest;
        }
        // A tie out of the phrase has nothing to land on here
        if (a + k === b && i === to[1]) return shifted({ ...e, n: e.n.map(({ tie: _tie, ...n }) => n) }, notation.shift);
        return shifted(e, notation.shift);
      });
      return tidyBar(kept, events.map((e, i) => !!e.n && outside(i)), first.time);
    });
    const staves: ExcerptStaff[] = [{ clef: notation.clef, voices: [bars] }];
    out.push({
      id: `${scoreId}:${first.number}.${from[1]}-${melody[b].number}.${to[1]}`,
      key: first.key, time: first.time, staves,
      parts: { voice: measure(staves, first.key, first.time) },
    });
  }
  return out;
}

/** Piano clefs: plain treble and bass only */
const PIANO_CLEFS: Record<string, Clef> = { G: "treble", F: "bass" };

/**
 * The piano part's excerpts: its two staves over the same bars as each melody excerpt (the song's phrases make
 * musical places to start and stop), when every bar of both is clean. Each is offered as the right hand, the left
 * hand and both, where there's enough to play (MIN_NOTES strikes, and for both, some in each hand).
 */
export function cutPianoExcerpts(song: ScoreParts): Omit<Excerpt, "source">[] {
  if (!song.voice || !song.piano) return [];
  const melody = asMelody(song.voice);
  const [rh, lh] = song.piano;
  const out: Omit<Excerpt, "source">[] = [];
  const done = new Set<string>();
  for (const { from, to } of excerptRanges(melody)) {
    const [a, b] = [from[0], to[0]];
    if (done.has(`${a}-${b}`)) continue;
    done.add(`${a}-${b}`);
    const hands = [rh.slice(a, b + 1), lh.slice(a, b + 1)];
    if (hands.some(h => h.length !== b - a + 1 || h.some(bar => bar.problems.length))) continue;
    if (hands.some(h => h.some((bar, i) => i && !sameSetting(h[i - 1], bar)))) continue;
    const [r0, l0] = [hands[0][0], hands[1][0]];
    if (r0.key !== l0.key || r0.time.join() !== l0.time.join() || r0.time.join() !== melody[a].time.join()) continue;
    const clefs = hands.map(h => PIANO_CLEFS[h[0].clef]);
    if (!clefs[0] || !clefs[1]) continue;
    const staves: ExcerptStaff[] = hands.map((h, i) => {
      const most = Math.max(...h.map(bar => bar.voices.length));
      return { clef: clefs[i], voices: Array.from({ length: most }, (_, v) => h.map(bar => bar.voices[v] ?? [])) };
    });
    const strikes = staves.map(st => excerptSteps([st], r0.time).steps.length);
    const parts: Partial<Record<ReadingPart, ExcerptFeatures>> = {};
    if (strikes[0] >= MIN_NOTES) parts.rh = measure([staves[0]], r0.key, r0.time);
    if (strikes[1] >= MIN_NOTES) parts.lh = measure([staves[1]], r0.key, r0.time);
    if (strikes[0] >= 2 && strikes[1] >= 2 && strikes[0] + strikes[1] >= MIN_NOTES) parts.both = measure(staves, r0.key, r0.time);
    if (!Object.keys(parts).length) continue;
    out.push({ id: `${song.scoreId}:${hands[0][0].number}-${hands[0][hands[0].length - 1].number}`, key: r0.key, time: r0.time, staves, parts });
  }
  return out;
}
