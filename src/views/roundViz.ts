// The round's score while it's played, three ways to compare (TEMPORARY: the switcher goes once one is chosen):
// dots, one per prompt (green right first time, amber right after a miss, grey skipped, hollow to come); a ring
// filling with the share right first time so far, with a tick at the average of earlier rounds; a running line of
// the share after each prompt, against a dashed line at that average.
import { ROUND_SIZE, runningShares, type PromptOutcome } from "../exercises/rounds";

export interface RoundVizModel {
  outcomes: readonly PromptOutcome[];
  /** Earlier rounds' average share right first time, null if none */
  average: number | null;
}

export const ROUND_VIZ_STYLES = ["dots", "ring", "line", "all", "off"] as const;
export type RoundVizStyle = (typeof ROUND_VIZ_STYLES)[number];

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 1. A row of ROUND_SIZE dots */
export function dotsSvg(m: RoundVizModel): string {
  const r = 7,
    gap = 6,
    w = ROUND_SIZE * (2 * r + gap) - gap;
  const dots = Array.from({ length: ROUND_SIZE }, (_, i) => {
    const o = m.outcomes[i];
    return `<circle class="dot ${o ?? "todo"}${i === m.outcomes.length ? " next" : ""}" cx="${r + i * (2 * r + gap)}" cy="${r + 2}" r="${r}"/>`;
  }).join("");
  return (
    `<svg class="rvDots" viewBox="-2 0 ${w + 4} ${2 * r + 4}" width="${w + 4}" height="${2 * r + 4}" role="img" ` +
    `aria-label="${m.outcomes.filter(o => o === "firstTry").length} of ${m.outcomes.length} right first time, ${ROUND_SIZE - m.outcomes.length} to go">${dots}</svg>`
  );
}

/** 2. A ring filling with the share right first time so far, a tick at the earlier average, the share in the middle */
export function ringSvg(m: RoundVizModel): string {
  const n = m.outcomes.length,
    right = m.outcomes.filter(o => o === "firstTry").length;
  const share = n ? right / n : 0,
    R = 34,
    C = 2 * Math.PI * R;
  // Angles from the top, clockwise
  const at = (f: number, rad: number) => [Math.sin(f * 2 * Math.PI) * rad, -Math.cos(f * 2 * Math.PI) * rad];
  let tick = "";
  if (m.average != null) {
    const [x1, y1] = at(m.average, R - 8),
      [x2, y2] = at(m.average, R + 8);
    tick = `<line class="avg" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return (
    `<svg class="rvRing" viewBox="-46 -46 92 92" width="92" height="92" role="img" aria-label="${pct(share)} right first time so far` +
    (m.average != null ? `, against an average of ${pct(m.average)}` : "") +
    `">` +
    `<circle class="track" r="${R}"/>` +
    (n
      ? `<circle class="fill" r="${R}" stroke-dasharray="${(share * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90)"/>`
      : "") +
    tick +
    `<text class="share" y="-1">${n ? pct(share) : "–"}</text><text class="count" y="14">${n} / ${ROUND_SIZE}</text></svg>`
  );
}

/** 3. The share after each prompt, across the round, against a dashed line at the earlier average */
export function lineSvg(m: RoundVizModel): string {
  const W = 240,
    H = 64,
    pad = 4;
  const x = (i: number) => pad + (i / (ROUND_SIZE - 1)) * (W - 2 * pad),
    y = (v: number) => pad + (1 - v) * (H - 2 * pad);
  const shares = runningShares(m.outcomes);
  const avg =
    m.average != null
      ? `<line class="avg" x1="${pad}" x2="${W - pad}" y1="${y(m.average).toFixed(1)}" y2="${y(m.average).toFixed(1)}"/>`
      : "";
  const line =
    shares.length > 1
      ? `<polyline class="run" points="${shares.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`
      : "";
  const end = shares.length
    ? `<circle class="end" cx="${x(shares.length - 1).toFixed(1)}" cy="${y(shares[shares.length - 1]).toFixed(1)}" r="4"/>`
    : "";
  return (
    `<svg class="rvLine" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Share right first time after each prompt` +
    (m.average != null ? `, against an average of ${pct(m.average)}` : "") +
    `">` +
    `<line class="base" x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}"/>${avg}${line}${end}</svg>`
  );
}

export interface RoundVizView {
  /** Show the round's score (null hides it: not an ear mode) */
  render(model: RoundVizModel | null): void;
}

const STORAGE = "chordDisplay.debugRoundViz";

/** `el` holds the chart; `picker` is the temporary switcher (a select), shown with it */
export function createRoundVizView(el: HTMLElement, picker: HTMLSelectElement): RoundVizView {
  let style: RoundVizStyle = "all";
  try {
    const saved = localStorage.getItem(STORAGE);
    if ((ROUND_VIZ_STYLES as readonly string[]).includes(saved ?? "")) style = saved as RoundVizStyle;
  } catch {}
  let last: RoundVizModel | null = null;
  picker.value = style;
  picker.onchange = () => {
    picker.blur();
    style = picker.value as RoundVizStyle;
    try {
      localStorage.setItem(STORAGE, style);
    } catch {}
    draw();
  };
  function draw() {
    const pickerRow = picker.closest<HTMLElement>("label");
    if (pickerRow) pickerRow.hidden = !last;
    el.hidden = !last || style === "off";
    if (!last || style === "off") {
      el.innerHTML = "";
      return;
    }
    const m = last;
    const parts =
      style === "all"
        ? [dotsSvg(m), ringSvg(m), lineSvg(m)]
        : [{ dots: dotsSvg, ring: ringSvg, line: lineSvg }[style](m)];
    const legend =
      m.average != null && style !== "dots" ? `<span class="rvNote">Mark: your average, ${pct(m.average)}</span>` : "";
    el.innerHTML = parts.map(p => `<div class="rvPart">${p}</div>`).join("") + legend;
  }
  return {
    render(model) {
      last = model;
      draw();
    },
  };
}
