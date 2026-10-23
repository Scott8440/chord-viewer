// Time charts for the Progress view: a line chart (series of points over days, with optional faint per-run dots
// behind each line) and a column chart (a value per day). The SVG is built by pure functions from a model and a
// width; `mountChart` shows it, redraws it to the container's width, and adds the hover layer: a crosshair that
// snaps to the nearest day with every series' value at it (columns: the column under the pointer lifts).
import { esc } from "./html";

export interface ChartPoint { at: number; value: number }

export interface LineSeries {
  name: string;
  /** CSS colour (a series token) */
  color: string;
  /** The line: one point per day, usually the day's median */
  points: (ChartPoint & { note?: string })[];
  /** Faint context dots behind the line: every run, say */
  dots?: ChartPoint[];
}

export interface TimeRange { from: number; to: number }

export interface LineChartModel {
  kind: "line";
  series: LineSeries[];
  range: TimeRange;
  /** Axis and tooltip format for values */
  format(v: number): string;
  /** The y axis always includes these (e.g. 0 and 1 for a share) */
  yInclude?: number[];
}

export interface ColumnChartModel {
  kind: "columns";
  name: string;
  color: string;
  /** One value per day: `at` is the day's midday */
  days: ChartPoint[];
  range: TimeRange;
  format(v: number): string;
}

export type ChartModel = LineChartModel | ColumnChartModel;

/** Where the hover layer reads from: an x position and what to show there */
export interface HoverAnchor { x: number; title: string; rows: { name: string; color: string; value: string }[]; mark?: number }

const H = 200, PAD = { top: 12, right: 14, bottom: 26, left: 44 };
const DAY = 86_400_000;

/** Round tick values covering [lo, hi], about `n` of them */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (hi <= lo) hi = lo + 1;
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw)!;
  const ticks = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
  if (ticks[ticks.length - 1] < hi) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function frame(range: TimeRange, values: number[], width: number, include: number[] = [0]) {
  const lo = Math.min(...include, ...values), hi = Math.max(...include, ...values);
  const ticks = niceTicks(lo, hi);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const w = width - PAD.left - PAD.right, h = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - range.from) / (range.to - range.from)) * w;
  const y = (v: number) => PAD.top + h - ((v - y0) / (y1 - y0 || 1)) * h;
  return { ticks, x, y, w, h };
}

function axes(f: ReturnType<typeof frame>, range: TimeRange, width: number, format: (v: number) => string): string {
  const grid = f.ticks.map(t => `<line class="grid" x1="${PAD.left}" x2="${width - PAD.right}" y1="${f.y(t).toFixed(1)}" y2="${f.y(t).toFixed(1)}"/>` +
    `<text class="ytick" x="${PAD.left - 6}" y="${f.y(t).toFixed(1)}">${esc(format(t))}</text>`).join("");
  // Date ticks on whole days, spaced so labels never crowd (about one per 70 px)
  const days = Math.max(1, Math.round((range.to - range.from) / DAY));
  const every = [1, 2, 3, 7, 14, 30, 60, 91, 182, 365].find(d => (days / d) * 70 <= f.w) ?? 365;
  const first = new Date(range.from); first.setHours(12, 0, 0, 0);
  const xt: string[] = [];
  for (let t = first.getTime(), i = 0; t <= range.to; t += DAY, i++) {
    if (i % every) continue;
    xt.push(`<text class="xtick" x="${f.x(t).toFixed(1)}" y="${H - 8}">${esc(shortDate(t))}</text>`);
  }
  return grid + `<line class="base" x1="${PAD.left}" x2="${width - PAD.right}" y1="${PAD.top + f.h}" y2="${PAD.top + f.h}"/>` + xt.join("");
}

export function lineChartSvg(m: LineChartModel, width: number): { svg: string; anchors: HoverAnchor[] } {
  const values = m.series.flatMap(s => [...s.points, ...(s.dots ?? [])].map(p => p.value));
  const f = frame(m.range, values, width, m.yInclude);
  let body = axes(f, m.range, width, m.format);
  for (const s of m.series) {
    body += (s.dots ?? []).map(p => `<circle class="dot" cx="${f.x(p.at).toFixed(1)}" cy="${f.y(p.value).toFixed(1)}" r="3.5" fill="${s.color}"/>`).join("");
    if (s.points.length > 1) {
      body += `<polyline class="line" stroke="${s.color}" points="${s.points.map(p => `${f.x(p.at).toFixed(1)},${f.y(p.value).toFixed(1)}`).join(" ")}"/>`;
    }
    body += s.points.map(p => `<circle class="marker" cx="${f.x(p.at).toFixed(1)}" cy="${f.y(p.value).toFixed(1)}" r="4" fill="${s.color}"/>`).join("");
  }
  // Hover: one anchor per day that has a point in any series, listing every series there
  const days = [...new Set(m.series.flatMap(s => s.points.map(p => p.at)))].sort((a, b) => a - b);
  const anchors = days.map(at => ({
    x: f.x(at), title: shortDate(at),
    rows: m.series.flatMap(s => {
      const p = s.points.find(q => q.at === at);
      return p ? [{ name: s.name + (p.note ? ` (${p.note})` : ""), color: s.color, value: m.format(p.value) }] : [];
    }),
  }));
  return { svg: `<svg class="chart" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" role="img">${body}<line class="cross" y1="${PAD.top}" y2="${PAD.top + f.h}" visibility="hidden"/></svg>`, anchors };
}

export function columnChartSvg(m: ColumnChartModel, width: number): { svg: string; anchors: HoverAnchor[] } {
  const f = frame(m.range, m.days.map(d => d.value), width);
  const band = f.w / Math.max(1, Math.round((m.range.to - m.range.from) / DAY));
  const bw = Math.max(2, Math.min(24, band * 0.7)), base = f.y(0);
  const bars = m.days.map((d, i) => {
    const x = f.x(d.at) - bw / 2, top = f.y(d.value), r = Math.min(4, bw / 2, base - top);
    // 4px rounded data end, square at the baseline
    const path = `M${x.toFixed(1)},${base}V${(top + r).toFixed(1)}Q${x.toFixed(1)},${top.toFixed(1)} ${(x + r).toFixed(1)},${top.toFixed(1)}` +
      `H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)},${top.toFixed(1)} ${(x + bw).toFixed(1)},${(top + r).toFixed(1)}V${base}Z`;
    return `<path class="bar" data-i="${i}" d="${path}" fill="${m.color}"/>`;
  }).join("");
  const anchors = m.days.map((d, i) => ({ x: f.x(d.at), title: shortDate(d.at), rows: [{ name: m.name, color: m.color, value: m.format(d.value) }], mark: i }));
  return { svg: `<svg class="chart" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" role="img">${axes(f, m.range, width, m.format)}${bars}</svg>`, anchors };
}

/** Shows a chart in `el` at its width, redrawn on resize, with the hover layer. Returns stop. */
export function mountChart(el: HTMLElement, model: ChartModel, label: string): () => void {
  let anchors: HoverAnchor[] = [];
  const tip = document.createElement("div");
  tip.className = "chartTip";
  tip.hidden = true;
  function draw() {
    const width = Math.max(240, Math.floor(el.clientWidth));
    const out = model.kind === "line" ? lineChartSvg(model, width) : columnChartSvg(model, width);
    anchors = out.anchors;
    el.innerHTML = out.svg;
    el.querySelector("svg")!.setAttribute("aria-label", label);
    el.append(tip);
  }
  function hover(e: PointerEvent) {
    const svg = el.querySelector("svg");
    if (!svg || !anchors.length) return;
    const x = e.clientX - svg.getBoundingClientRect().left;
    const a = anchors.reduce((best, c) => Math.abs(c.x - x) < Math.abs(best.x - x) ? c : best);
    const cross = svg.querySelector<SVGLineElement>(".cross");
    if (cross) { cross.setAttribute("x1", String(a.x)); cross.setAttribute("x2", String(a.x)); cross.setAttribute("visibility", "visible"); }
    svg.querySelectorAll(".bar.hot").forEach(b => b.classList.remove("hot"));
    if (a.mark != null) svg.querySelector(`.bar[data-i="${a.mark}"]`)?.classList.add("hot");
    // Values lead, names follow; text only (names could one day come from imported data)
    tip.replaceChildren();
    const title = document.createElement("div");
    title.className = "tipTitle";
    title.textContent = a.title;
    tip.append(title);
    for (const r of a.rows) {
      const row = document.createElement("div");
      row.className = "tipRow";
      const key = document.createElement("span");
      key.className = "tipKey";
      key.style.background = r.color;
      const value = document.createElement("strong");
      value.textContent = r.value;
      const name = document.createElement("span");
      name.textContent = r.name;
      row.append(key, value, name);
      tip.append(row);
    }
    tip.hidden = false;
    // Beside the crosshair (flipping to its left near the right edge) and level with the pointer, so it never sits
    // on the stretch of line being read
    const right = a.x + 12 + tip.offsetWidth <= el.clientWidth;
    tip.style.left = `${Math.max(0, right ? a.x + 12 : a.x - 12 - tip.offsetWidth)}px`;
    const y = e.clientY - el.getBoundingClientRect().top;
    tip.style.top = `${Math.max(0, Math.min(y + 14, el.clientHeight - tip.offsetHeight))}px`;
  }
  function leave() {
    tip.hidden = true;
    el.querySelector<SVGLineElement>(".cross")?.setAttribute("visibility", "hidden");
    el.querySelectorAll(".bar.hot").forEach(b => b.classList.remove("hot"));
  }
  el.addEventListener("pointermove", hover);
  el.addEventListener("pointerleave", leave);
  const ro = new ResizeObserver(() => draw());
  ro.observe(el);
  draw();
  return () => { ro.disconnect(); el.removeEventListener("pointermove", hover); el.removeEventListener("pointerleave", leave); };
}
