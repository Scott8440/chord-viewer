// Chord recognition: match the played pitch classes against our chord templates on every
// root, score each fit with the weights in chordTemplates.ts, and keep the cheapest.
import { Interval, Note } from "tonal";
import { CHORD_TEMPLATES, RECOGNIZER_WEIGHTS, type ChordTemplate, type RecognizerWeights } from "./chordTemplates";
import type { KeyContext } from "./key";
import { romanFor } from "./roman";
import { chromaOf, pcName, ROOT_MAJOR, ROOT_MINOR, SHARP } from "./spelling";

/* ---------------------------------------------------------------
   Templates
   --------------------------------------------------------------- */
export interface TemplateTone {
  /** Interval from the root, in tonal notation ("3M", "13M") */
  interval: string;
  /** Pitch class relative to the root (0–11) */
  pc: number;
  /** Scale degree (3, 5, 9, 13) */
  degree: number;
  optional: boolean;
}

interface CompiledTemplate {
  template: ChordTemplate;
  tones: TemplateTone[];
}

function compile(template: ChordTemplate): CompiledTemplate {
  const tones = template.tones.split(" ").map(spec => {
    const optional = spec.startsWith("(");
    const interval = optional ? spec.slice(1, -1) : spec;
    return { interval, pc: ((Interval.semitones(interval) % 12) + 12) % 12, degree: parseInt(interval, 10), optional };
  });
  return { template, tones };
}

const COMPILED = CHORD_TEMPLATES.map(compile);
const COMPILED_BY_ID = new Map(COMPILED.map(c => [c.template.id, c]));

export function templateById(id: string): ChordTemplate | undefined {
  return COMPILED_BY_ID.get(id)?.template;
}

/* ---------------------------------------------------------------
   Matching one template on one root
   --------------------------------------------------------------- */
export interface TemplateMatch {
  template: ChordTemplate;
  rootPc: number;
  /** Optional tones that were left out */
  omitted: TemplateTone[];
  /** Required tones that were not played */
  missing: TemplateTone[];
  /** Played pitch classes that are not in the chord */
  extra: number[];
}

/**
 * How well a set of pitch classes fits a chord type on a given root. The recognizer
 * only accepts matches with nothing missing; exercise matchers can apply their own tolerances.
 */
export function matchTemplate(pcs: readonly number[], rootPc: number, template: ChordTemplate | string): TemplateMatch {
  const c = typeof template === "string" ? COMPILED_BY_ID.get(template) : COMPILED_BY_ID.get(template.id);
  if (!c) throw new Error(`Unknown chord template: ${typeof template === "string" ? template : template.id}`);
  return matchCompiled(new Set(pcs), rootPc, c);
}

function matchCompiled(played: ReadonlySet<number>, rootPc: number, c: CompiledTemplate): TemplateMatch {
  const omitted: TemplateTone[] = [], missing: TemplateTone[] = [];
  const inChord = new Set<number>();
  for (const tone of c.tones) {
    const pc = (rootPc + tone.pc) % 12;
    inChord.add(pc);
    if (!played.has(pc)) (tone.optional ? omitted : missing).push(tone);
  }
  const extra = [...played].filter(pc => !inChord.has(pc));
  return { template: c.template, rootPc, omitted, missing, extra };
}

/* ---------------------------------------------------------------
   Readings
   --------------------------------------------------------------- */
export interface CostReason {
  label: string;
  cost: number;
  /** Part of the key bias rather than the voicing itself */
  fromKey?: boolean;
}

export interface ChordReading {
  /** "plain": all notes are chord tones. "upper": a chord over a foreign bass (G/C).
      "added": one non-chord tone ignored. */
  kind: "plain" | "upper" | "added";
  root: string;
  rootPc: number;
  /** Lead-sheet suffix, e.g. "m7" */
  type: string;
  /** Spelled bass if it is not the root, else "" */
  bass: string;
  cost: number;
  /** Cost of the voicing alone, without the key adjustments; checked against maxCost */
  voicingCost: number;
  /** Why the reading costs what it does; the costs add up to `cost` */
  reasons: CostReason[];
  /** Spelling of each chord tone, indexed by pitch class (null where not a chord tone) */
  spell: (string | null)[];
  /** Template id */
  alias: string;
  /** Pitch classes of every tone in the chord type, including ones left out */
  tonePcs: number[];
  /** Optional tones that were left out, by degree */
  omitted: number[];
  flats: boolean;
  /** Pitch class of a non-chord tone that was ignored to find this reading */
  extra: number | null;
  text: string;
  fullName: string;
}

export type Analysis =
  | { kind: "note" | "interval" | "unknown"; pcs: number[]; text: string; sub: string; alts: string[];
      spell: null; best?: undefined; roman?: undefined; flats?: undefined; ranked?: undefined }
  | { kind: "chord"; pcs: number[]; best: ChordReading; text: string; sub: string; roman: string;
      alts: string[]; spell: (string | null)[]; flats: boolean;
      /** Every accepted reading, best first */
      ranked: ChordReading[] };

const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

function buildReading(m: TemplateMatch, kind: ChordReading["kind"], bassPc: number, key: KeyContext | null,
                      w: RecognizerWeights, extraPc: number | null = null): ChordReading {
  const t = m.template;
  const c = COMPILED_BY_ID.get(t.id)!;
  const root = key ? key.spell[m.rootPc] : (t.minor ? ROOT_MINOR : ROOT_MAJOR)[m.rootPc];
  // Spell every chord tone relative to the respelled root
  const spell: (string | null)[] = new Array(12).fill(null);
  const tonePcs: number[] = [];
  for (const tone of c.tones) {
    const name = Note.transpose(root, tone.interval);
    spell[chromaOf(name)] = name;
    tonePcs.push(chromaOf(name));
  }
  let bass = "";
  if (bassPc !== m.rootPc) {
    bass = spell[bassPc] || (key ? key.spell[bassPc] : root.includes("b") ? ROOT_MAJOR[bassPc] : SHARP[bassPc]);
    if (/##|bb/.test(bass)) bass = key ? key.spell[bassPc] : ROOT_MAJOR[bassPc];
    if (key && key.inKey.has(bassPc)) bass = key.spell[bassPc];
  }

  const reasons: CostReason[] = [{ label: t.name, cost: t.cost }];
  for (const tone of m.omitted) reasons.push({ label: `no ${ordinal(tone.degree)}`, cost: w.omit[tone.degree] ?? 0 });
  if (kind === "upper") {
    reasons.push({ label: `over ${bass}, which is not in the chord`, cost: w.inversion + w.upperStructure });
  } else if (bass) {
    reasons.push({ label: `${bass} in the bass (inversion)`, cost: w.inversion });
  }
  if (extraPc != null) reasons.push({ label: `ignores ${spell[extraPc] || pcName(extraPc, key, root.includes("b"))} as an added tone`, cost: w.addedNote });
  if (key) {
    // Prefer readings that fit the key: in-key root, in-key tones, and the tonic itself
    if (!key.inKey.has(m.rootPc)) reasons.push({ label: `root outside ${key.label}`, cost: w.key.rootOutside, fromKey: true });
    const omittedPcs = new Set(m.omitted.map(tone => (m.rootPc + tone.pc) % 12));
    const outside = tonePcs.filter(pc => !omittedPcs.has(pc) && !key.inKey.has(pc)).length;
    if (outside) reasons.push({ label: `${outside} chord tone${outside > 1 ? "s" : ""} outside ${key.label}`, cost: w.key.toneOutside * outside, fromKey: true });
    if (m.rootPc === key.tonicPc) reasons.push({ label: "root is the tonic", cost: w.key.tonicRoot, fromKey: true });
  }
  for (const r of reasons) r.cost = Math.round(r.cost * 100) / 100;
  const cost = reasons.reduce((sum, r) => sum + r.cost, 0);
  const voicingCost = reasons.reduce((sum, r) => sum + (r.fromKey ? 0 : r.cost), 0);

  return {
    kind, root, rootPc: m.rootPc, type: t.symbol, bass, cost, voicingCost, reasons, spell, alias: t.id, tonePcs,
    omitted: m.omitted.map(tone => tone.degree),
    flats: root.includes("b"),
    extra: extraPc,
    text: root + t.symbol + (bass ? "/" + bass : ""),
    fullName: `${root} ${t.name}` + (bass ? ` over ${bass}` : ""),
  };
}

/** Every exact reading of `pcs` (bass first): each template on each played root, nothing missing or extra. */
function exactReadings(pcs: readonly number[], kind: ChordReading["kind"], bassPc: number, key: KeyContext | null,
                       w: RecognizerWeights, filter: (c: CompiledTemplate, rootPc: number) => boolean,
                       extraPc: number | null = null): ChordReading[] {
  const played = new Set(pcs);
  const out: ChordReading[] = [];
  for (const rootPc of pcs) {
    for (const c of COMPILED) {
      if (!filter(c, rootPc)) continue;
      const m = matchCompiled(played, rootPc, c);
      if (m.missing.length || m.extra.length) continue;
      out.push(buildReading(m, kind, bassPc, key, w, extraPc));
    }
  }
  return out;
}

const KIND_ORDER = { plain: 0, upper: 1, added: 2 };
const TEMPLATE_ORDER = new Map(CHORD_TEMPLATES.map((t, i) => [t.id, i]));

/** Ranks readings: cheapest first; ties go to root position, then the more common chord type. */
function compareReadings(a: ChordReading, b: ChordReading): number {
  return a.cost - b.cost
    || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || Number(!!a.bass) - Number(!!b.bass)
    || TEMPLATE_ORDER.get(a.alias)! - TEMPLATE_ORDER.get(b.alias)!
    || a.rootPc - b.rootPc;
}

/** All readings of the pitch classes (bass first), cheapest first, before the max-cost cut. */
export function chordReadings(pcs: readonly number[], key: KeyContext | null,
                              w: RecognizerWeights = RECOGNIZER_WEIGHTS): ChordReading[] {
  const bassPc = pcs[0];
  const readings = exactReadings(pcs, "plain", bassPc, key, w,
    (c, rootPc) => !c.template.rootPosition || rootPc === bassPc);

  // Upper-structure slash chords (G/C, Bb/C, C/D): a simple chord in root position above
  // the bass, with the bass under it, when the plain readings are all awkward.
  const bestPlain = Math.min(Infinity, ...readings.map(r => r.cost));
  if (pcs.length >= 4 && bestPlain > w.upperOnlyAbove) {
    const upper = pcs.slice(1);
    readings.push(...exactReadings(upper, "upper", bassPc, key, w,
      (c, rootPc) => rootPc === upper[0] && !c.template.rootPosition && c.template.cost <= w.upperMaxBaseCost));
  }

  // Nothing fits? Try ignoring one non-bass note (passing / added tone).
  if (!readings.some(r => r.voicingCost <= w.maxCost) && pcs.length >= 4) {
    for (let i = 1; i < pcs.length; i++) {
      const sub = pcs.filter((_, j) => j !== i);
      readings.push(...exactReadings(sub, "added", bassPc, key, w,
        (c, rootPc) => !c.template.rootPosition || rootPc === bassPc, pcs[i]));
    }
  }

  // One reading per name, keeping the cheapest
  const byText = new Map<string, ChordReading>();
  for (const r of readings) {
    const prev = byText.get(r.text);
    if (!prev || compareReadings(r, prev) < 0) byText.set(r.text, r);
  }
  return [...byText.values()].sort(compareReadings);
}

/* ---------------------------------------------------------------
   Analysis for display
   --------------------------------------------------------------- */
const INTERVAL_NAMES = ["Unison", "Minor 2nd", "Major 2nd", "Minor 3rd", "Major 3rd", "Perfect 4th",
  "Tritone", "Perfect 5th", "Minor 6th", "Major 6th", "Minor 7th", "Major 7th"];

/** Names the chord formed by `notes` (MIDI numbers, sorted low to high) in the given key. */
export function analyze(notes: readonly number[], key: KeyContext | null,
                        w: RecognizerWeights = RECOGNIZER_WEIGHTS): Analysis | null {
  if (notes.length === 0) return null;
  // Unique pitch classes, ordered from the bass up
  const pcs: number[] = [];
  for (const n of notes) { const pc = n % 12; if (!pcs.includes(pc)) pcs.push(pc); }

  if (pcs.length === 1) {
    return { kind: "note", pcs, text: pcName(pcs[0], key), sub: "Single note", alts: [], spell: null };
  }

  const ranked = chordReadings(pcs, key, w).filter(r => r.voicingCost <= w.maxCost);

  if (ranked.length === 0) {
    if (pcs.length === 2) {
      const iv = (pcs[1] - pcs[0] + 12) % 12;
      return { kind: "interval", pcs, text: pcName(pcs[0], key) + "–" + pcName(pcs[1], key),
               sub: INTERVAL_NAMES[iv], alts: [], spell: null };
    }
    return { kind: "unknown", pcs, text: "?", sub: "No chord match", alts: [], spell: null };
  }

  const best = ranked[0];
  let sub = capitalize(best.fullName);
  if (best.extra != null) {
    const ex = best.spell[best.extra] || pcName(best.extra, key, best.flats);
    sub += " with added " + ex;
  }
  return { kind: "chord", pcs, best, text: best.text, sub,
           roman: key ? romanFor(best, key) : "",
           alts: ranked.slice(1).filter(r => r.cost <= best.cost + w.altWindow).slice(0, w.maxAlts)
             .map(r => r.text + (r.extra != null ? "*" : "")),
           spell: best.spell, flats: best.flats, ranked };
}

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
