// The scale-degree circle (ear training): the seven degrees of the major scale round a circle, 1 at the top, clockwise.
// The degrees on offer are solid, the rest faint. A ping is a ring spreading out from a degree: when the app plays it
// (introducing the key) or when the player plays one, green if right and red if wrong. Notes outside the scale ping
// between their neighbours (♭3 between 2 and 3), with their name shown briefly. It never shows note names: only degrees.
import { degreeName, EAR_DEGREES } from "../exercises/earTraining";
import { prettyAcc } from "../theory";

export type PingKind = "hear" | "correct" | "wrong";

export interface DegreeCircleView {
  /** Draws the circle with these degrees on offer ("1", "5", …) */
  render(offered: readonly string[]): void;
  /** A ping from the degree this many semitones above the tonic (any octave) */
  ping(semitones: number, kind: PingKind): void;
}

const SIZE = 300, C = SIZE / 2, RADIUS = 104, NODE_R = 24;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Where each semitone above the tonic sits, in degree steps round the circle: scale notes on their node, the
 *  others halfway between their neighbours */
const SEMITONE_STEP = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];

/** A semitone's point on the circle, in viewBox units */
export function degreePoint(semitones: number): { x: number; y: number } {
  const step = SEMITONE_STEP[((semitones % 12) + 12) % 12];
  const angle = (step / 7) * 2 * Math.PI - Math.PI / 2;
  return { x: C + RADIUS * Math.cos(angle), y: C + RADIUS * Math.sin(angle) };
}

/** The circle as SVG markup: pure */
export function degreeCircleSvg(offered: readonly string[]): string {
  const nodes = EAR_DEGREES.map(d => {
    const { x, y } = degreePoint(d.semitones);
    const on = offered.includes(d.id);
    return `<g class="node${on ? " on" : ""}" data-semitones="${d.semitones}">` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${NODE_R}"/>` +
      `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${d.label}</text></g>`;
  }).join("");
  return `<svg class="degrees" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Scale degrees">` +
    `<circle class="ring" cx="${C}" cy="${C}" r="${RADIUS}"/>${nodes}<g class="pings"></g></svg>`;
}

export function createDegreeCircle(el: HTMLElement): DegreeCircleView {
  let shown = "";
  return {
    render(offered) {
      const key = offered.join(",");
      if (key === shown) return;   // keep pings in flight
      shown = key;
      el.innerHTML = degreeCircleSvg(offered);
    },
    ping(semitones, kind) {
      const svg = el.querySelector("svg");
      if (!svg) return;
      const pc = ((semitones % 12) + 12) % 12;
      const { x, y } = degreePoint(pc);
      const pings = svg.querySelector(".pings")!;
      const ring = document.createElementNS(SVG_NS, "circle");
      ring.setAttribute("class", `ping ${kind}`);
      ring.setAttribute("cx", x.toFixed(1));
      ring.setAttribute("cy", y.toFixed(1));
      ring.setAttribute("r", String(NODE_R));
      ring.addEventListener("animationend", () => ring.remove());
      pings.append(ring);
      const node = svg.querySelector<SVGGElement>(`.node[data-semitones="${pc}"]`);
      if (node) {
        // Restart the flash if it's already running
        node.classList.remove("hear", "correct", "wrong");
        void node.getBoundingClientRect();
        node.classList.add(kind);
      } else {
        // Not a scale degree: a passing node with its name, between the neighbours
        const g = document.createElementNS(SVG_NS, "g");
        g.setAttribute("class", `node passing ${kind}`);
        g.innerHTML = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${NODE_R * 0.8}"/>` +
          `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${prettyAcc(degreeName(pc))}</text>`;
        g.addEventListener("animationend", () => g.remove());
        pings.append(g);
      }
    },
  };
}
