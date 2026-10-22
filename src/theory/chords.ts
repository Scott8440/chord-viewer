// Chord recognition: candidates from tonal's Chord.detect, re-ranked by our scoring.
import { Chord } from "tonal";
import type { KeyContext } from "./key";
import { romanFor } from "./roman";
import { chromaOf, pcName, ROOT_MAJOR, ROOT_MINOR, SHARP } from "./spelling";

/* ---------------------------------------------------------------
   Chord detection
   tonal's Chord.detect finds every chord whose pitch-class set
   matches exactly; we re-rank so common chords beat exotic ones
   (e.g. E-G-C -> "C/E", not "Em#5").
   --------------------------------------------------------------- */
const TYPE_COST: Record<string, number> = {};
([
  [0,   "M m"],
  [1,   "7 maj7 m7 5"],
  [2,   "dim aug sus4 sus2 6 m6 m7b5 dim7 7sus4 Madd9 madd9 9 maj9 m9 7add6 m7add11"],
  [3,   "6add9 m69 11 m11 13 maj13 m13 7b9 7#9 7#11 7b5 7#5 maj7#5 m/ma7 7no5 9sus4 alt7 maj#4 9#11 maj9#11 13b9 13#11 7b13 b9sus 7#5#9 7#5b9 mM9 m9b5"],
] as const).forEach(([cost, list]) => list.split(" ").forEach(t => (TYPE_COST[t] = cost)));
const DEFAULT_TYPE_COST = 4.5;
const SLASH_COST = 1.5;
// "Chord over an unrelated bass" (G/C): costs a bit more than an inversion,
// and is only tried when no exact reading is reasonably simple.
const HYBRID_EXTRA = 0.5;
const HYBRID_MAX_UPPER_COST = 2;
const HYBRID_TRY_ABOVE = 3;
// Reject far-fetched readings (mostly clusters forced into a name)
const MAX_COST = 6;

// Nicer display for a few of tonal's type aliases
const TYPE_DISPLAY: Record<string, string> = {
  "M": "", "m/ma7": "m(maj7)", "maj#4": "maj7#11", "Madd9": "add9", "madd9": "m(add9)",
  "mM9": "m(maj9)", "alt7": "7alt", "m69": "m6/9", "6add9": "6/9", "b9sus": "7sus4b9",
  "5": "5", "4": "sus4(quartal)",
  // voicings that skip the 9th still get their usual names
  "7add6": "13", "7b6": "7b13", "m7add11": "m11", "M7add13": "maj13", "m11A": "m11#5",
};

export interface ChordReading {
  root: string;
  type: string;
  bass: string;
  cost: number;
  /** Spelling of each chord tone, indexed by pitch class (null where not a chord tone) */
  spell: (string | null)[];
  alias: string;
  tonePcs: number[];
  flats: boolean;
  /** Pitch class of a non-chord tone that was ignored to find this reading */
  extra: number | null;
  text: string;
  fullName: string;
}

export type Analysis =
  | { kind: "note" | "interval" | "unknown"; pcs: number[]; text: string; sub: string; alts: string[];
      spell: null; best?: undefined; roman?: undefined; flats?: undefined }
  | { kind: "chord"; pcs: number[]; best: ChordReading; text: string; sub: string; roman: string;
      alts: string[]; spell: (string | null)[]; flats: boolean };

function interpret(symbol: string, penalty: number, key: KeyContext | null,
                   extraPc?: number | null, hybrid?: boolean): ChordReading | null {
  const c = Chord.get(symbol);
  if (c.empty) return null;
  const alias = c.aliases[0];
  if (hybrid && (TYPE_COST[alias] ?? 99) > HYBRID_MAX_UPPER_COST) return null;
  // A power chord only makes sense with its root in the bass; an inverted
  // fifth (C below F) is just a fourth, so let the interval naming handle it.
  if (alias === "5" && c.bass) return null;
  const rootPc = chromaOf(c.tonic!);
  const minorish = /minor|diminish|half/i.test(c.name) || c.quality === "Minor" || c.quality === "Diminished";
  const root = key ? key.spell[rootPc] : (minorish ? ROOT_MINOR : ROOT_MAJOR)[rootPc];
  // Spell every chord tone relative to the respelled root
  const tones = Chord.getChord(alias, root).notes;
  const spell: (string | null)[] = new Array(12).fill(null);
  tones.forEach(t => { spell[chromaOf(t)] = t; });
  let bass = "";
  if (c.bass) {
    const bpc = chromaOf(c.bass);
    bass = spell[bpc] || (key ? key.spell[bpc] : root.includes("b") ? ROOT_MAJOR[bpc] : SHARP[bpc]);
    if (/##|bb/.test(bass)) bass = key ? key.spell[bpc] : ROOT_MAJOR[bpc];
    if (key && key.inKey.has(bpc)) bass = key.spell[bpc];
  }
  const type = alias in TYPE_DISPLAY ? TYPE_DISPLAY[alias] : alias.replace(/^M(?=\d)/, "maj");
  let cost = (TYPE_COST[alias] ?? DEFAULT_TYPE_COST) + (bass ? SLASH_COST : 0) + penalty;
  const tonePcs = tones.map(chromaOf);
  if (key) {
    // Prefer readings that fit the key: in-key root, in-key tones, and the tonic itself
    if (!key.inKey.has(rootPc)) cost += 1.0;
    cost += 0.4 * tonePcs.filter(pc => !key.inKey.has(pc)).length;
    if (rootPc === key.tonicPc) cost -= 0.7;
  }
  return {
    root, type, bass, cost, spell, alias, tonePcs,
    flats: root.includes("b"),
    extra: extraPc == null ? null : extraPc,
    text: root + type + (bass ? "/" + bass : ""),
    fullName: (alias === "5" ? `${root} power chord (perfect 5th)` : c.type ? `${root} ${c.type}` : root + type) + (bass ? ` over ${bass}` : ""),
  };
}

const INTERVAL_NAMES = ["Unison", "Minor 2nd", "Major 2nd", "Minor 3rd", "Major 3rd", "Perfect 4th",
  "Tritone", "Perfect 5th", "Minor 6th", "Major 6th", "Minor 7th", "Major 7th"];

/** Names the chord formed by `notes` (MIDI numbers, sorted low to high) in the given key. */
export function analyze(notes: readonly number[], key: KeyContext | null): Analysis | null {
  if (notes.length === 0) return null;
  // Unique pitch classes, ordered from the bass up
  const pcs: number[] = [];
  for (const n of notes) { const pc = n % 12; if (!pcs.includes(pc)) pcs.push(pc); }
  const names = pcs.map(pc => SHARP[pc]);

  if (pcs.length === 1) {
    return { kind: "note", pcs, text: pcName(pcs[0], key), sub: "Single note", alts: [], spell: null };
  }

  const seen = new Map<string, ChordReading>();
  const add = (symbols: string[], penalty: number, extraPc?: number | null, hybrid?: boolean) => {
    symbols.forEach((sym, i) => {
      const r = interpret(sym, penalty + i * 0.01, key, extraPc, hybrid);
      if (!r) return;
      const prev = seen.get(r.text);
      if (!prev || prev.cost > r.cost) seen.set(r.text, r);
    });
  };

  add(Chord.detect(names), 0);
  add(Chord.detect(names, { assumePerfectFifth: true }), 0.5);  // allow an omitted 5th

  // Upper-structure slash chords (G/C, Bb/C, C/D): name the chord above the bass,
  // then put the bass under it, when the exact readings are all awkward.
  const bestExact = Math.min(Infinity, ...[...seen.values()].map(r => r.cost));
  if (pcs.length >= 4 && bestExact > HYBRID_TRY_ABOVE) {
    const upper = names.slice(1);
    const over = (sym: string) => sym + "/" + names[0];
    add(Chord.detect(upper).filter(x => !x.includes("/")).map(over), HYBRID_EXTRA, null, true);
    add(Chord.detect(upper, { assumePerfectFifth: true }).filter(x => !x.includes("/")).map(over), HYBRID_EXTRA + 0.5, null, true);
  }

  // Nothing exact? Try ignoring one non-bass note (passing / added tone).
  if (seen.size === 0 && pcs.length >= 4) {
    for (let i = 1; i < pcs.length; i++) {
      const sub = names.filter((_, j) => j !== i);
      add(Chord.detect(sub), 3, pcs[i]);
      add(Chord.detect(sub, { assumePerfectFifth: true }), 3.5, pcs[i]);
    }
  }

  const ranked = [...seen.values()].filter(r => r.cost <= MAX_COST).sort((a, b) => a.cost - b.cost);

  if (ranked.length === 0) {
    if (pcs.length === 2) {
      const iv = (pcs[1] - pcs[0] + 12) % 12;
      return { kind: "interval", pcs, text: pcName(pcs[0], key) + "–" + pcName(pcs[1], key),
               sub: INTERVAL_NAMES[iv], alts: [], spell: null };
    }
    return { kind: "unknown", pcs, text: "?", sub: "No chord match", alts: [], spell: null };
  }

  const best = ranked[0];
  let sub = best.fullName ? capitalize(best.fullName) : "";
  if (best.extra != null) {
    const ex = best.spell[best.extra] || pcName(best.extra, key, best.flats);
    sub = (sub ? sub + " " : "") + "with added " + ex;
  }
  return { kind: "chord", pcs, best, text: best.text, sub,
           roman: key ? romanFor(best, key) : "",
           alts: ranked.slice(1).filter(r => r.cost <= best.cost + 2.5).slice(0, 3).map(r => r.text + (r.extra != null ? "*" : "")), spell: best.spell, flats: best.flats };
}

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
