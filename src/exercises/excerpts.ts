// Sight-reading excerpts from real music: a few bars of a song exactly as written, rhythm included: the singer's
// melody, or the piano part (either hand, or both). Made at build time by scripts/corpus (from the OpenScore Lieder
// corpus, CC0) and read by the app as JSON; this file is the shape both sides share, plus the pure helpers: durations,
// spelling, transposing, levels, and the steps a player strikes.

/** A note value as written (VexFlow's names): whole, half, quarter, 8th … */
export type NoteValue = "w" | "h" | "q" | "8" | "16" | "32" | "64";

export interface ExcerptNote {
  /** Written pitch (MIDI) */
  p: number;
  /** Spelling as a tonal pitch class (MuseScore's tpc: 14 is C, +1 per fifth up, so 15 G, 13 F, 20 F♯, 12 B♭…) */
  s: number;
  /** Tied to the same pitch in the voice's next event (so that one isn't struck again) */
  tie?: 1;
}

/** One note, chord or rest, as written */
export interface ExcerptEvent {
  /** Note value */
  v: NoteValue;
  /** Dots */
  d?: number;
  /** Tuplet as [actual, normal]: [3, 2] is a triplet (three in the time of two) */
  t?: [number, number];
  /** The notes, low to high (one, or a chord); absent for a rest */
  n?: ExcerptNote[];
  /** A whole-bar rest (drawn centred, whatever the time signature) */
  bar?: 1;
  /** Not a rest but space: a second voice sitting out part of a bar (drawn as nothing) */
  hide?: 1;
}

export type Clef = "treble" | "bass";

/** One staff: its voices, each written bar by bar (an empty bar: that voice isn't there) */
export interface ExcerptStaff {
  clef: Clef;
  voices: ExcerptEvent[][][];
}

/** What a player reads: a song's melody, or its piano part's right hand, left hand or both */
export type ReadingPart = "voice" | "rh" | "lh" | "both";

/** What makes an excerpt easier or harder to read, measured from its notes */
export interface ExcerptFeatures {
  /** Times the player strikes (a chord, or a tied note, once) */
  notes: number;
  bars: number;
  /** Sharps or flats in the key signature */
  keyAccidentals: number;
  /** Notes with an accidental outside the key */
  chromatic: number;
  /** Lowest to highest in one staff (the widest staff), in semitones */
  range: number;
  /** Most ledger lines any note needs (middle C on the treble staff: 1) */
  ledger: number;
  /** Widest interval from one note to the next in a voice (its top note in treble, bottom in bass), in semitones */
  maxLeap: number;
  /** Share of those intervals that are steps (a tone or semitone); 1 when there are none */
  stepShare: number;
  /** Different note values used (dotted and tuplet values count as their own) */
  values: number;
  /** Shortest note or rest, as a fraction of a whole note */
  shortest: number;
  dotted: number;
  ties: number;
  tuplets: number;
  /** Rests between the notes (not before the first or after the last) */
  rests: number;
  /** Notes starting off the beat and held over the next one */
  syncopations: number;
  /** 6/8, 9/8, 12/8 … */
  compound: boolean;
  /** Most notes struck at once in one staff (one hand) */
  chord: number;
  /** Widest of those, lowest to highest, in semitones */
  span: number;
  /** Most voices in one staff in a bar */
  voices: number;
}

export interface Excerpt {
  /** "<score id>:<bar>-<bar>", plus where the phrase starts and ends in a melody ("<bar>.<event>-<bar>.<event>") */
  id: string;
  /** Index into the file's `sources` */
  source: number;
  /** Key signature, in fifths: 2 is D major or B minor, −3 E♭ major or C minor */
  key: number;
  time: [number, number];
  /** One staff for a melody; the right hand's and the left hand's for piano */
  staves: ExcerptStaff[];
  /** Measured for each part it can be read as (a melody: "voice"; piano: whichever hands have enough to play) */
  parts: Partial<Record<ReadingPart, ExcerptFeatures>>;
}

export interface ExcerptSource {
  composer: string;
  title: string;
  /** MuseScore score id: the score is at https://musescore.com/score/<id> */
  scoreId: string;
}

export interface ExcerptFile {
  version: 2;
  /** Shown with the excerpts */
  credit: string;
  sources: ExcerptSource[];
  excerpts: Excerpt[];
}

const BASE: Record<NoteValue, number> = { w: 1, h: 1 / 2, q: 1 / 4, "8": 1 / 8, "16": 1 / 16, "32": 1 / 32, "64": 1 / 64 };

/** How long an event lasts, as a fraction of a whole note (a whole-bar rest is given its bar's length by the caller) */
export function eventLength(e: Pick<ExcerptEvent, "v" | "d" | "t">): number {
  let len = BASE[e.v] * (2 - 1 / 2 ** (e.d ?? 0));
  if (e.t) len *= e.t[1] / e.t[0];
  return len;
}

/** Each bar's length: the longest voice in it (a pickup is short; a whole-bar rest is the time signature's) */
export function barLengths(staves: readonly ExcerptStaff[], time: readonly [number, number]): number[] {
  const bars = staves[0].voices[0].length;
  return Array.from({ length: bars }, (_, b) => Math.max(0, ...staves.flatMap(st => st.voices.map(v =>
    (v[b] ?? []).reduce((sum, e) => sum + (e.bar ? time[0] / time[1] : eventLength(e)), 0)))));
}

/** A tonal pitch class (tpc) as a note name: 14 → "C", 20 → "F#", 12 → "Bb" */
export function tpcName(tpc: number): string {
  const letter = "FCGDAEB"[((tpc + 1) % 7 + 7) % 7];
  const alter = Math.floor((tpc + 1) / 7) - 2;
  return letter + (alter > 0 ? "#".repeat(alter) : "b".repeat(-alter));
}

/** The alteration a tpc carries: −1 flat, 0 natural, 1 sharp … */
export const tpcAlter = (tpc: number) => Math.floor((tpc + 1) / 7) - 2;

const LETTERS = "CDEFGAB";
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const tpcLetter = (tpc: number) => "FCGDAEB"[((tpc + 1) % 7 + 7) % 7];

/** A written note's staff step: C4 is 28, each letter one step */
export function staffStep(p: number, tpc: number): number {
  const letter = tpcLetter(tpc);
  const octave = (p - tpcAlter(tpc) - LETTER_PC[LETTERS.indexOf(letter)]) / 12 - 1;
  return LETTERS.indexOf(letter) + 7 * octave;
}

/** A written note's name with its octave: "F#4", "Bb3", "B#3" (the octave goes with the letter, as written) */
export const writtenName = (p: number, tpc: number) => `${tpcName(tpc)}${Math.floor(staffStep(p, tpc) / 7)}`;

/** The staff steps a clef holds without ledger lines, a step past the outer lines included (treble D4–G5, bass F2–B3) */
export const LEDGER: Record<Clef, [number, number]> = { treble: [29, 39], bass: [17, 27] };

/** Ledger lines a note needs on a staff: 0 on it, 1 for middle C or A5 on the treble staff, 2 for A3 or C6 … */
export function ledgerLines(step: number, clef: Clef): number {
  const [low, high] = LEDGER[clef];
  return step < low ? Math.floor((low + 1 - step) / 2) : step > high ? Math.floor((step - high + 1) / 2) : 0;
}

/** The staves a part reads: a melody's one, or the piano's right hand, left hand or both */
export function partStaves(e: Excerpt, part: ReadingPart): ExcerptStaff[] {
  return part === "rh" ? [e.staves[0]] : part === "lh" ? [e.staves[1]] : e.staves;
}

const mapNotes = (staves: readonly ExcerptStaff[], f: (n: ExcerptNote) => ExcerptNote): ExcerptStaff[] =>
  staves.map(st => ({ ...st, voices: st.voices.map(v => v.map(bar => bar.map(e => e.n ? { ...e, n: e.n.map(f) } : e))) }));

/**
 * Staves moved from one key signature to another (in fifths), spelled for it, all by the same interval, in the octave
 * that keeps them on their staves best (the fewest ledger lines, then the smallest move). Null when a note would need
 * more than a double sharp or double flat.
 */
export function transposeStaves(staves: readonly ExcerptStaff[], from: number, to: number): ExcerptStaff[] | null {
  const shift = to - from;
  const notes = staves.flatMap(st => st.voices.flat(2).flatMap(e => (e.n ?? []).map(n => ({ n, clef: st.clef }))));
  if (notes.some(({ n }) => Math.abs(tpcAlter(n.s + shift)) > 2)) return null;
  const base = ((shift * 7) % 12 + 12) % 12;
  let best = 0, bestCost = Infinity;
  for (const semitones of [base - 24, base - 12, base, base + 12]) {
    const cost = notes.reduce((sum, { n, clef }) => {
      const step = staffStep(n.p + semitones, n.s + shift), [low, high] = LEDGER[clef];
      return sum + Math.max(0, low - step, step - high);
    }, 0);
    if (cost < bestCost || (cost === bestCost && Math.abs(semitones) < Math.abs(best))) { best = semitones; bestCost = cost; }
  }
  if (!shift && !best) return [...staves];
  return mapNotes(staves, n => ({ ...n, p: n.p + best, s: n.s + shift }));
}

/** What the player strikes at one moment: every note starting then, in any voice or staff (a tied-over note isn't) */
export interface ExcerptStep {
  /** From the start of the excerpt, as a fraction of a whole note */
  at: number;
  /** Low to high, a pitch once */
  notes: { p: number; s: number }[];
}

/** Where an event is: [staff, voice, bar, event] */
export type EventPos = [number, number, number, number];

/** A tie from one event's notes to the same pitches in an event starting as it ends */
export interface ExcerptTie {
  from: EventPos;
  to: EventPos;
  pitches: number[];
}

/**
 * When each event starts (`at[staff][voice][bar][event]`, from the start of the excerpt), and its ties: a tied note
 * lands on the same pitch starting as it ends, in its own voice or, failing that, another voice of the same staff
 * (a chord tied from one voice into another, as piano parts often are).
 */
export function excerptTimeline(staves: readonly ExcerptStaff[], time: readonly [number, number]):
  { at: number[][][][]; ties: ExcerptTie[] } {
  const lengths = barLengths(staves, time);
  const starts = lengths.map((_, b) => lengths.slice(0, b).reduce((a, x) => a + x, 0));
  const key = (t: number) => Math.round(t * 1e6);
  const ties: ExcerptTie[] = [];
  const at = staves.map((st, si) => {
    const placed: { pos: EventPos; e: ExcerptEvent; at: number; end: number }[] = [];
    const times = st.voices.map((voice, vi) => voice.map((bar, b) => {
      let t = starts[b];
      return bar.map((e, i) => {
        const len = e.bar ? lengths[b] : eventLength(e);
        placed.push({ pos: [si, vi, b, i], e, at: t, end: t + len });
        t += len;
        return t - len;
      });
    }));
    const byStart = new Map<number, typeof placed>();
    for (const x of placed) if (x.e.n) byStart.set(key(x.at), [...byStart.get(key(x.at)) ?? [], x]);
    for (const x of placed) {
      const tied = x.e.n?.filter(n => n.tie) ?? [];
      if (!tied.length) continue;
      const next = byStart.get(key(x.end)) ?? [];
      const targets = new Map<(typeof placed)[number], number[]>();
      for (const n of tied) {
        const has = (c: (typeof placed)[number]) => c.e.n!.some(m => m.p === n.p);
        const target = next.find(c => c.pos[1] === x.pos[1] && has(c)) ?? next.find(has);
        if (target) targets.set(target, [...targets.get(target) ?? [], n.p]);
      }
      for (const [target, pitches] of targets) ties.push({ from: x.pos, to: target.pos, pitches });
    }
    return times;
  });
  return { at, ties };
}

/**
 * The steps to play, in order, and for each event (`stepOf[staff][voice][bar][event]`) the step that strikes it:
 * a tied-over chord's is the step that struck what it continues; −1 for rests.
 */
export function excerptSteps(staves: readonly ExcerptStaff[], time: readonly [number, number]):
  { steps: ExcerptStep[]; stepOf: number[][][][] } {
  const { at, ties } = excerptTimeline(staves, time);
  const id = (p: EventPos) => p.join();
  const continued = new Map<string, Set<number>>(), source = new Map<string, EventPos>();
  for (const t of ties) {
    continued.set(id(t.to), new Set([...continued.get(id(t.to)) ?? [], ...t.pitches]));
    if (!source.has(id(t.to))) source.set(id(t.to), t.from);
  }
  const key = (t: number) => Math.round(t * 1e6);
  const struck = new Map<number, { at: number; notes: Map<number, number> }>();
  staves.forEach((st, si) => st.voices.forEach((voice, vi) => voice.forEach((bar, b) => bar.forEach((e, i) => {
    const fresh = (e.n ?? []).filter(n => !continued.get(id([si, vi, b, i]))?.has(n.p));
    if (!fresh.length) return;
    const t = at[si][vi][b][i];
    const s = struck.get(key(t)) ?? { at: t, notes: new Map() };
    for (const n of fresh) s.notes.set(n.p, n.s);
    struck.set(key(t), s);
  }))));
  const steps = [...struck.values()].sort((a, b) => a.at - b.at)
    .map(s => ({ at: s.at, notes: [...s.notes].sort((a, b) => a[0] - b[0]).map(([p, s]) => ({ p, s })) }));
  const index = new Map(steps.map((s, i) => [key(s.at), i]));
  const stepAt = (pos: EventPos): number => {
    const [si, vi, b, i] = pos;
    const e = staves[si].voices[vi][b][i];
    if (!e.n) return -1;
    const fresh = e.n.some(n => !continued.get(id(pos))?.has(n.p));
    return fresh ? index.get(key(at[si][vi][b][i]))! : stepAt(source.get(id(pos))!);
  };
  return {
    steps,
    stepOf: staves.map((st, si) => st.voices.map((voice, vi) => voice.map((bar, b) => bar.map((_, i) => stepAt([si, vi, b, i]))))),
  };
}

/**
 * A bar's tuplets, as [from, to) event ranges: runs of events with the same ratio, each closed once it fills a whole
 * number of tuplet units (a triplet of 8ths, or a quarter and an 8th, is three 8ths).
 */
export function tupletGroups(bar: readonly ExcerptEvent[]): { from: number; to: number; t: [number, number] }[] {
  const out: { from: number; to: number; t: [number, number] }[] = [];
  let from = -1, sum = 0, smallest = Infinity;
  const close = (to: number) => { out.push({ from, to, t: bar[from].t! }); from = -1; };
  bar.forEach((e, i) => {
    if (from >= 0 && (!e.t || e.t[0] !== bar[from].t![0] || e.t[1] !== bar[from].t![1])) close(i);
    if (!e.t) return;
    if (from < 0) { from = i; sum = 0; smallest = Infinity; }
    sum += eventLength({ v: e.v, d: e.d });
    smallest = Math.min(smallest, BASE[e.v]);
    const units = sum / (e.t[0] * smallest);
    if (Math.abs(units - Math.round(units)) < 1e-6) close(i + 1);
  });
  if (from >= 0) close(bar.length);
  return out;
}

/**
 * The most each level allows; an excerpt's level is the first one it fits. Pitch, rhythm and texture (chords, voices,
 * how many strikes a bar) all get harder; a melody is always single notes in one voice. Melodies and piano have
 * their own levels: a piano hand covers more ground than a singer. The key signature isn't part of it: an excerpt can be
 * transposed to any key, so the key is a setting of its own. (Ledger lines are measured in the original key, so a
 * transposed excerpt can have a few more or fewer.)
 */
export interface LevelLimits {
  bars: number;
  chromatic: number;
  range: number;
  maxLeap: number;
  ledger: number;
  values: number;
  /** Shortest value allowed, as a fraction of a whole note */
  shortest: number;
  dotted: number;
  ties: number;
  tuplets: number;
  syncopations: number;
  compound: boolean;
  chord: number;
  span: number;
  voices: number;
  /** Strikes a bar, on average */
  perBar: number;
}

const ANYTHING: LevelLimits = {
  bars: Infinity, chromatic: Infinity, range: Infinity, maxLeap: Infinity, ledger: Infinity, values: Infinity, shortest: 0,
  dotted: Infinity, ties: Infinity, tuplets: Infinity, syncopations: Infinity, compound: true, chord: Infinity,
  span: Infinity, voices: Infinity, perBar: Infinity,
};

export const READING_LEVELS: readonly { name: string; limits: LevelLimits }[] = [
  { name: "Steps, simple rhythm",
    limits: { bars: 2, chromatic: 0, range: 7, maxLeap: 4, ledger: 0, values: 2, shortest: 1 / 8,
              dotted: 0, ties: 0, tuplets: 0, syncopations: 0, compound: false, chord: 1, span: 0, voices: 1, perBar: Infinity } },
  { name: "Small leaps, dotted notes",
    limits: { bars: 4, chromatic: 1, range: 9, maxLeap: 7, ledger: 1, values: 3, shortest: 1 / 8,
              dotted: 2, ties: 1, tuplets: 0, syncopations: 0, compound: false, chord: 1, span: 0, voices: 1, perBar: Infinity } },
  { name: "Wider range, compound time",
    limits: { bars: 4, chromatic: 1, range: 12, maxLeap: 9, ledger: 2, values: 4, shortest: 1 / 16,
              dotted: 4, ties: 2, tuplets: 0, syncopations: 1, compound: true, chord: 1, span: 0, voices: 1, perBar: Infinity } },
  { name: "Accidentals, triplets",
    limits: { bars: 4, chromatic: 3, range: 16, maxLeap: 12, ledger: 3, values: 5, shortest: 1 / 16,
              dotted: 8, ties: 4, tuplets: 6, syncopations: 2, compound: true, chord: 1, span: 0, voices: 1, perBar: Infinity } },
  { name: "Anything", limits: ANYTHING },
];

export const PIANO_LEVELS: readonly { name: string; limits: LevelLimits }[] = [
  { name: "Single notes, simple rhythm",
    limits: { bars: 2, chromatic: 1, range: 12, maxLeap: 7, ledger: 1, values: 3, shortest: 1 / 8,
              dotted: 1, ties: 1, tuplets: 0, syncopations: 0, compound: false, chord: 1, span: 0, voices: 1, perBar: 6 } },
  { name: "Two-note chords",
    limits: { bars: 4, chromatic: 2, range: 16, maxLeap: 12, ledger: 2, values: 3, shortest: 1 / 8,
              dotted: 2, ties: 2, tuplets: 0, syncopations: 1, compound: true, chord: 2, span: 12, voices: 1, perBar: 8 } },
  { name: "Triads, two voices",
    limits: { bars: 4, chromatic: 3, range: 19, maxLeap: 12, ledger: 3, values: 4, shortest: 1 / 16,
              dotted: 4, ties: 4, tuplets: 0, syncopations: 2, compound: true, chord: 3, span: 12, voices: 2, perBar: 12 } },
  { name: "Fuller chords, triplets",
    limits: { bars: 4, chromatic: 6, range: 24, maxLeap: 16, ledger: 4, values: 5, shortest: 1 / 16,
              dotted: 8, ties: 8, tuplets: 12, syncopations: 4, compound: true, chord: 4, span: 14, voices: 2, perBar: 16 } },
  { name: "Anything", limits: ANYTHING },
];

/** The level table for a part */
export const levelsFor = (part: ReadingPart) => part === "voice" ? READING_LEVELS : PIANO_LEVELS;

export function fitsLevel(f: ExcerptFeatures, l: LevelLimits): boolean {
  return f.bars <= l.bars && f.chromatic <= l.chromatic && f.range <= l.range &&
    f.maxLeap <= l.maxLeap && f.ledger <= l.ledger && f.values <= l.values && f.shortest >= l.shortest - 1e-9 &&
    f.dotted <= l.dotted && f.ties <= l.ties && f.tuplets <= l.tuplets && f.syncopations <= l.syncopations &&
    (l.compound || !f.compound) && f.chord <= l.chord && f.span <= l.span && f.voices <= l.voices &&
    f.notes / f.bars <= l.perBar + 1e-9;
}

/** An excerpt's level in a part: 1 for the easiest */
export const readingLevel = (f: ExcerptFeatures, part: ReadingPart = "voice") =>
  levelsFor(part).findIndex(l => fitsLevel(f, l.limits)) + 1;
