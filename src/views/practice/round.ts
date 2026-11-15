// Ear training in rounds: the score while a round is on, and its summary at the end, compared with earlier rounds.
import { ROUND_SIZE, type Counters, type RoundSummary } from "../../exercises/rounds";
import type { PracticeDisplay } from "./view";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const clock = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** "Round: 7 / 20 · 5 right first time" */
export const roundScore = (p: Counters) => `Round: ${p.answered} / ${ROUND_SIZE}` + (p.answered ? ` · ${p.firstTry} right first time` : "");

/** Earlier rounds as small bars (oldest first, muted) and this one (accent), 0–100% */
function roundBars(previous: readonly number[], share: number): string {
  const all = [...previous, share], w = 14, gap = 6, h = 56;
  const bars = all.map((v, i) => {
    const bh = Math.max(2, v * h), x = i * (w + gap);
    return `<rect class="${i === all.length - 1 ? "now" : "then"}" x="${x}" y="${h - bh}" width="${w}" height="${bh}" rx="3"/>`;
  }).join("");
  const width = all.length * (w + gap) - gap;
  return `<svg class="roundBars" viewBox="0 0 ${width} ${h + 2}" width="${width}" height="${h + 2}" role="img" ` +
    `aria-label="Right first time in your last ${all.length} rounds, this one last">${bars}` +
    `<line x1="0" x2="${width}" y1="${h + 1}" y2="${h + 1}"/></svg>`;
}

/** The round's end: how it went, against earlier rounds played the same way; Skip becomes Next round */
export function roundSummaryDisplay(s: RoundSummary, label: string): PracticeDisplay {
  const share = s.firstTry / s.size, c = s.comparison;
  let compare: string;
  if (!c) compare = "";
  else if (c.last == null) compare = "Your first round played this way: the next ones will be compared with it.";
  else {
    const diff = Math.round((share - c.last) * 100);
    compare = (diff > 0 ? `▲ ${diff} points on your last round` : diff < 0 ? `▼ ${-diff} points on your last round` : "Level with your last round") +
      ` · best ${pct(c.best!)} · average ${pct(c.average!)} over your last ${c.previous.length} round${c.previous.length > 1 ? "s" : ""}`;
  }
  return {
    label: `${label}: round complete`,
    promptHtml: `<div class="roundSummary"><div class="roundShare">${pct(share)}</div>` +
      `<div class="roundOf">${s.firstTry} of ${s.size} right first time · ${clock(s.durationMs)}</div>` +
      (c && c.previous.length ? roundBars(c.previous, share) : "") + `</div>`,
    size: "sequence", sub: compare, status: c && c.average != null && share < c.average ? "waiting" : "correct",
    feedback: "", score: "", skipLabel: "Next round",
  };
}
