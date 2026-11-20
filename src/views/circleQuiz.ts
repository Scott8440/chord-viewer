// The circle of fifths for the key-relationships quiz: major keys on the outer ring, their relative minors on the
// inner, turned to any angle. Each place is open (blank), the key given (amber), found (green), revealed by a skip
// (grey), asked about (marked "?"), or tried wrongly; open places can be picked while the question is answered on the
// circle. A strip above it shows a key signature on a treble staff for the signature questions (its room kept while
// those can come up, so the circle doesn't jump). DOM only: the presenter (practice/theory.ts) says what each shows.
import * as VF from "vexflow/bravura";
import { esc } from "./html";

export interface CircleQuizSpot {
  /** Passed to `onSpot` when picked */
  id: string;
  ring: "major" | "minor";
  /** 0 = top, clockwise */
  slot: number;
  /** The key's name, where it's shown; empty while open */
  label: string;
  state: "open" | "given" | "found" | "revealed" | "asked" | "wrong";
}

export interface CircleQuizModel {
  spots: readonly CircleQuizSpot[];
  /** In the middle */
  center: string;
  /** The open places can be picked */
  pickable: boolean;
  /** A key signature to show above the circle (VexFlow key, e.g. "Eb" or "C#m"), or none */
  signature: string | null;
  /** Keep the signature strip's room even with no signature (signature questions can come up) */
  sigRow: boolean;
  /** Keep room for the board of chords under the circle (chain questions can come up) */
  board: boolean;
}

export interface CircleQuizView {
  render(model: CircleQuizModel): void;
  /** Called with a place's id when an open one is picked; returns a function that stops it */
  onSpot(listener: (id: string) => void): () => void;
}

const RINGS = { major: [70, 104], minor: [40, 70] } as const;
const point = (r: number, pos: number): [number, number] => {
  const a = ((pos * 30 - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
};
const f = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
const segment = (pos: number, r1: number, r2: number) =>
  `M${f(point(r2, pos - 0.5))}A${r2} ${r2} 0 0 1 ${f(point(r2, pos + 0.5))}` +
  `L${f(point(r1, pos + 0.5))}A${r1} ${r1} 0 0 0 ${f(point(r1, pos - 0.5))}Z`;

export function circleQuizSvg(m: CircleQuizModel): string {
  // The places asked about are drawn last, so their outlines aren't half covered by the places drawn after them
  const order = [...m.spots].sort((a, b) => Number(a.state === "asked") - Number(b.state === "asked"));
  const spots = order
    .map(s => {
      const [r1, r2] = RINGS[s.ring];
      const [x, y] = point((r1 + r2) / 2, s.slot);
      const pick = m.pickable && s.state === "open";
      const text = s.state === "asked" ? "?" : s.state === "wrong" ? "✗" : s.label;
      return (
        `<g class="cqSpot ${s.ring} ${s.state}${pick ? " pick" : ""}" data-spot="${esc(s.id)}"${pick ? ` role="button" aria-label="${s.ring} key, place ${s.slot + 1}"` : ""}>` +
        `<path d="${segment(s.slot, r1, r2)}"/>` +
        (text
          ? `<text x="${x.toFixed(1)}" y="${(y + (s.ring === "major" ? 5.5 : 4.5)).toFixed(1)}">${esc(text)}</text>`
          : "") +
        `</g>`
      );
    })
    .join("");
  return (
    `<svg class="circleQuiz" viewBox="-108 -108 216 216" role="img" aria-label="Circle of fifths">` +
    spots +
    `<text class="cqCenter" x="0" y="5">${esc(m.center)}</text></svg>`
  );
}

/** A treble staff with the key signature only */
function drawSignature(el: HTMLElement, vfKey: string) {
  el.innerHTML = "";
  const renderer = new VF.Renderer(el as HTMLDivElement, VF.Renderer.Backends.SVG);
  renderer.resize(200, 112);
  const svg = el.querySelector("svg")!;
  svg.setAttribute("viewBox", "0 0 200 112");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  // The clef reaches below the bottom line: room for it under the staff
  const stave = new VF.Stave(10, 0, 180).addClef("treble").addKeySignature(vfKey);
  stave.setContext(renderer.getContext()).draw();
}

export function createCircleQuizView(el: HTMLElement): CircleQuizView {
  el.innerHTML = `<div class="cqSig"></div><div class="cqRing"></div>`;
  const sig = el.querySelector<HTMLElement>(".cqSig")!,
    ring = el.querySelector<HTMLElement>(".cqRing")!;
  const listeners = new Set<(id: string) => void>();
  ring.addEventListener("click", e => {
    const g = (e.target as Element).closest<SVGGElement>(".cqSpot.pick");
    if (g) for (const l of listeners) l(g.dataset.spot!);
  });
  let shownRing = "",
    shownSig: string | null = null;
  return {
    render(model) {
      const html = circleQuizSvg(model);
      if (html !== shownRing) ring.innerHTML = shownRing = html;
      if (model.signature !== shownSig) {
        shownSig = model.signature;
        if (model.signature) drawSignature(sig, model.signature);
        else sig.innerHTML = "";
      }
      sig.hidden = !model.sigRow;
      el.dataset.board = String(model.board);
    },
    onSpot(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
