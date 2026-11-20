// The circle of fifths to fill in (the theory quiz): twelve places in a ring, each empty, filled in (the given key,
// found, or revealed by a skip), asked about (marked) or tried wrongly. While a "where" question is open the empty
// places can be picked. DOM only: the presenter (practice/theory.ts) says what each place shows.
import { esc } from "./html";

export interface CircleQuizSpot {
  /** The key's name, once it's in; empty while open */
  label: string;
  state: "open" | "given" | "found" | "revealed" | "asked" | "wrong";
}

export interface CircleQuizModel {
  /** Twelve places, clockwise from the top */
  spots: readonly CircleQuizSpot[];
  /** In the middle, e.g. "4 / 12" */
  center: string;
  /** The open places can be picked (a "where" question) */
  pickable: boolean;
}

export interface CircleQuizView {
  render(model: CircleQuizModel): void;
  /** Called with a place (0 = top, clockwise) when an open one is picked; returns a function that stops it */
  onSpot(listener: (spot: number) => void): () => void;
}

const R_OUT = 100,
  R_IN = 54,
  R_LABEL = 78;
const point = (r: number, pos: number): [number, number] => {
  const a = ((pos * 30 - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
};
const f = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
const segment = (pos: number) =>
  `M${f(point(R_OUT, pos - 0.5))}A${R_OUT} ${R_OUT} 0 0 1 ${f(point(R_OUT, pos + 0.5))}` +
  `L${f(point(R_IN, pos + 0.5))}A${R_IN} ${R_IN} 0 0 0 ${f(point(R_IN, pos - 0.5))}Z`;

export function circleQuizSvg(m: CircleQuizModel): string {
  // The place asked about is drawn last, so its outline isn't half covered by the places drawn after it
  const order = m.spots
    .map((_, i) => i)
    .sort((a, b) => Number(m.spots[a].state === "asked") - Number(m.spots[b].state === "asked"));
  const spots = order
    .map(i => {
      const s = m.spots[i];
      const [x, y] = point(R_LABEL, i);
      const pick = m.pickable && (s.state === "open" || s.state === "asked");
      const text = s.state === "asked" ? "?" : s.state === "wrong" ? "✗" : s.label;
      return (
        `<g class="cqSpot ${s.state}${pick ? " pick" : ""}" data-spot="${i}"${pick ? ` role="button" aria-label="Place ${i + 1}"` : ""}>` +
        `<path d="${segment(i)}"/>` +
        (text ? `<text x="${x.toFixed(1)}" y="${(y + 6).toFixed(1)}">${esc(text)}</text>` : "") +
        `</g>`
      );
    })
    .join("");
  return (
    `<svg class="circleQuiz" viewBox="-108 -108 216 216" role="img" aria-label="Circle of fifths to fill in">` +
    spots +
    `<text class="cqCenter" x="0" y="6">${esc(m.center)}</text></svg>`
  );
}

export function createCircleQuizView(el: HTMLElement): CircleQuizView {
  const listeners = new Set<(spot: number) => void>();
  el.addEventListener("click", e => {
    const g = (e.target as Element).closest<SVGGElement>(".cqSpot.pick");
    if (!g) return;
    for (const l of listeners) l(Number(g.dataset.spot));
  });
  let shown = "";
  return {
    render(model) {
      const html = circleQuizSvg(model);
      if (html !== shown) el.innerHTML = shown = html;
    },
    onSpot(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
