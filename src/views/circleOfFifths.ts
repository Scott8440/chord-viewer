// Circle of fifths: major keys on the outer ring, their relative minors on the inner ring, C at the top.
// `circleSvg` is pure (model in, SVG out); `createCircleView` shows it, or hides it when a mode has nothing to show.
import type { KeyProgressState, RoutineOrder } from "../exercises/routines";
import {
  buildKey, circlePosition, CIRCLE_OF_FIFTHS_MAJOR, CIRCLE_OF_FIFTHS_MINOR, keySignature, matchTemplate, prettyAcc,
  templateById, type Analysis,
} from "../theory";
import { esc } from "./html";

export interface CircleModel {
  /** Key in focus, e.g. "G:major": highlighted, with its neighbours shaded and labelled with Roman numerals */
  keyValue?: string | null;
  /** Shade and label the focused key's neighbourhood (default true); off where colours already mean progress */
  neighbours?: boolean;
  /** A chord to mark (e.g. the one being played): its root's segment on the major or minor ring */
  chord?: { rootPc: number; minor: boolean } | null;
  /** Routine progress by key value; keys not listed are drawn plainly */
  progress?: Record<string, KeyProgressState>;
  /** Routine progress shown in the middle, e.g. "4 / 12", with the direction of travel round the circle (none for a
   *  chromatic order, which jumps across it) */
  center?: { text: string; order?: RoutineOrder };
}

const R_OUT = 96, R_MID = 64, R_IN = 38;
const pcOf = (name: string) => ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as Record<string, number>)[name[0]] +
  (name.includes("#") ? 1 : name.includes("b") ? -1 : 0);
const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Point at `r` along the angle of circle position `pos` (+ `offset` positions), 0 = top, clockwise. */
function point(r: number, pos: number, offset = 0): [number, number] {
  const a = ((pos + offset) * 30 - 90) * Math.PI / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

/** Ring segment for a position, between radii r1 < r2. */
function segment(pos: number, r1: number, r2: number): string {
  const f = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  return `M${f(point(r2, pos, -0.5))}A${r2} ${r2} 0 0 1 ${f(point(r2, pos, 0.5))}` +
         `L${f(point(r1, pos, 0.5))}A${r1} ${r1} 0 0 0 ${f(point(r1, pos, -0.5))}Z`;
}

/**
 * Roman numerals of the six neighbouring segments of a key: for a major key IV I V outside and ii vi iii inside;
 * for a minor key VI III VII outside and iv i v inside (natural minor). Keyed by "outer:pos" / "inner:pos".
 */
function neighbourNumerals(keyValue: string): Map<string, string> {
  const pos = circlePosition(keyValue);
  const minor = keyValue.endsWith(":minor");
  const out = minor ? ["VI", "III", "VII"] : ["IV", "I", "V"];
  const inn = minor ? ["iv", "i", "v"] : ["ii", "vi", "iii"];
  const m = new Map<string, string>();
  [-1, 0, 1].forEach((d, i) => {
    m.set(`outer:${mod12(pos + d)}`, out[i]);
    m.set(`inner:${mod12(pos + d)}`, inn[i]);
  });
  return m;
}

export function circleSvg(model: CircleModel): string {
  const focus = model.keyValue && circlePosition(model.keyValue) >= 0 ? model.keyValue : null;
  const numerals = focus && model.neighbours !== false ? neighbourNumerals(focus) : new Map<string, string>();
  const focusRing = focus?.endsWith(":minor") ? "inner" : "outer";
  const focusPos = focus ? circlePosition(focus) : -1;
  const markRing = model.chord ? (model.chord.minor ? "inner" : "outer") : null;
  const markPos = model.chord
    ? (model.chord.minor ? CIRCLE_OF_FIFTHS_MINOR : CIRCLE_OF_FIFTHS_MAJOR).findIndex(t => mod12(pcOf(t)) === model.chord!.rootPc)
    : -1;

  const parts: string[] = [];
  for (const ring of ["outer", "inner"] as const) {
    const names = ring === "outer" ? CIRCLE_OF_FIFTHS_MAJOR : CIRCLE_OF_FIFTHS_MINOR;
    const [r1, r2] = ring === "outer" ? [R_MID, R_OUT] : [R_IN, R_MID];
    names.forEach((tonic, pos) => {
      const keyValue = `${tonic}:${ring === "outer" ? "major" : "minor"}`;
      const numeral = numerals.get(`${ring}:${pos}`);
      const classes = ["seg", ring,
        ring === focusRing && pos === focusPos ? "focus" : numeral ? "inkey" : "",
        model.progress?.[keyValue] ?? "",
        ring === markRing && pos === markPos ? "mark" : ""].filter(Boolean).join(" ");
      const label = prettyAcc(tonic) + (ring === "inner" ? "m" : "");
      const [lx, ly] = point((r1 + r2) / 2, pos);
      // The name sits a little above the middle when a numeral goes under it
      const nameY = numeral ? ly - 3 : ly + 1;
      parts.push(`<g class="${classes}"><path d="${segment(pos, r1, r2)}"/>` +
        `<text class="name" x="${lx.toFixed(1)}" y="${nameY.toFixed(1)}">${esc(label)}</text>` +
        (numeral ? `<text class="num" x="${lx.toFixed(1)}" y="${(ly + 7).toFixed(1)}">${esc(numeral)}</text>` : "") + "</g>");
    });
  }

  // Middle: routine progress, or the focused key and its signature
  let center = "";
  if (model.center) {
    const arrow = model.center.order === "flats" ? "↺" : model.center.order === "sharps" ? "↻" : "";
    center = `<text class="c1" x="0" y="-2">${esc(model.center.text)}</text>` +
             (arrow ? `<text class="c2" x="0" y="12">${arrow}</text>` : "");
  } else if (focus) {
    const [tonic, mode] = focus.split(":");
    const sig = keySignature(buildKey(focus)!);
    center = `<text class="c1" x="0" y="-2">${esc(prettyAcc(tonic) + (mode === "minor" ? "m" : ""))}</text>` +
             `<text class="c2" x="0" y="11">${sig.count ? sig.count + prettyAcc(sig.accidental) : "no ♯/♭"}</text>`;
  }
  return `<svg class="cof" viewBox="-100 -100 200 200" role="img" aria-label="Circle of fifths">${parts.join("")}${center}</svg>`;
}

/** Where a chord sits on the circle: major-family chords on the outer ring, minor-family (with a 5th) inside. */
export function chordOnCircle(result: Analysis | null): CircleModel["chord"] {
  if (!result || result.kind !== "chord") return null;
  const t = templateById(result.best.alias);
  if (!t) return null;
  const m = matchTemplate([], 0, t.id);
  const pcs = new Set([...m.missing, ...m.omitted].map(x => x.pc));
  if (pcs.has(4) && pcs.has(7)) return { rootPc: result.best.rootPc, minor: false };
  if (pcs.has(3) && pcs.has(7)) return { rootPc: result.best.rootPc, minor: true };
  return null;   // diminished, augmented, sus …: not on the circle
}

export interface CircleView {
  /** Draws the circle, or hides it when there is nothing relevant to show (null) */
  render(model: CircleModel | null): void;
}

export function createCircleView(el: HTMLElement): CircleView {
  let last = "";
  return {
    render(model) {
      el.hidden = !model;
      if (!model) return;
      const svg = circleSvg(model);
      if (svg !== last) el.innerHTML = last = svg;
    },
  };
}
