// The Progress view: a filter row (date range, routine, exercise), summary tiles, and chart cards worked out from the
// practice history (src/progress/stats.ts). Each chart has a table underneath for the exact values.
import type { ProgressRecord } from "../progress/records";
import {
  DRILLS, dailyMedian, dayStart, dayOf, drillsPerDay, exerciseOptions, exerciseRuns, practicePerDay, routineOptions,
  routineSessions, since, summary, weakestPrompts,
} from "../progress/stats";
import { prettyAcc } from "../theory";
import { mountChart, type ChartModel, type TimeRange } from "./charts";
import { esc } from "./html";

export const RANGES = ["7", "30", "90", "all"] as const;
export type RangeChoice = typeof RANGES[number];

export interface ProgressSelection {
  range: RangeChoice;
  /** Routine id, or null for the most played */
  routine: string | null;
  /** Exercise id, or null for the most played */
  exercise: string | null;
}

export interface ProgressView {
  render(records: readonly ProgressRecord[], selection: ProgressSelection, saved: boolean): void;
  /** Stops redrawing charts on resize */
  clear(): void;
}

/** Series colours: the reference palette's first four dark steps, in its fixed order */
const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const DAY = 86_400_000;

const minutes = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const clock = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const longDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const DRILL_NAMES = { notes: "Notes", chords: "Chords", progressions: "Progressions", ear: "Ear training" } as const;

function table(head: string[], rows: string[][]): string {
  if (!rows.length) return "";
  return `<details class="pvTable"><summary>Table</summary><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
}

export function createProgressView(el: HTMLElement, actions: {
  /** A new range, routine or exercise was picked */
  change(selection: ProgressSelection): void;
  /** Back to practising */
  back(): void;
}): ProgressView {
  const change = actions.change;
  let unmount: (() => void)[] = [];
  const clear = () => { unmount.forEach(f => f()); unmount = []; };

  return {
    clear,
    render(all, sel, saved) {
      clear();
      const now = Date.now(), today = dayOf(now);
      const end = dayStart(today) + DAY;
      const firstDay = all.length ? dayStart(dayOf(all[0].at)) : dayStart(today);
      const from = sel.range === "all" ? Math.min(firstDay, end - 7 * DAY) : end - Number(sel.range) * DAY;
      const range: TimeRange = { from, to: end };
      const records = since(all, from);
      const sum = summary(records);

      const routines = routineOptions(records), routine = routines.find(r => r.id === sel.routine) ?? routines[0];
      const exercises = exerciseOptions(records), exercise = exercises.find(x => x.exerciseId === sel.exercise) ?? exercises[0];

      const charts: { id: string; model: ChartModel; label: string }[] = [];
      const card = (title: string, sub: string, body: string, wide = false) =>
        `<section class="pvCard${wide ? " wide" : ""}"><h3>${esc(title)}</h3>${sub ? `<div class="pvSub">${esc(sub)}</div>` : ""}${body}</section>`;
      const chart = (id: string, model: ChartModel, label: string, title = "") => {
        charts.push({ id, model, label });
        return `${title ? `<h4>${esc(title)}</h4>` : ""}<div class="pvChart" id="${id}"></div>`;
      };
      const empty = (text: string) => `<div class="pvEmpty">${esc(text)}</div>`;

      // Practice time per day
      const perDay = practicePerDay(records);
      const practice = card("Practice time per day", "", perDay.length
        ? chart("pvPractice", { kind: "columns", name: "Practice", color: SERIES[0], range,
            days: perDay.map(d => ({ at: dayStart(d.day) + DAY / 2, value: d.ms / 60_000 })), format: v => `${Math.round(v)} min` }, "Practice minutes per day") +
          table(["Day", "Practice"], perDay.map(d => [longDate(dayStart(d.day)), minutes(d.ms)]))
        : empty("No practice recorded in this range yet."), true);

      // Routine: time to complete and mistakes, per finished session
      let routineCard: string;
      if (routine) {
        const sessions = routineSessions(records, routine.id);
        const point = (value: (s: typeof sessions[number]) => number) => sessions.map(s => ({ at: s.at, value: value(s), note: s.bpm ? `${s.bpm} BPM` : undefined }));
        routineCard = card(routine.name, `${sessions.length} finished session${sessions.length === 1 ? "" : "s"}`,
          `<div class="pvPair"><div>${chart("pvRoutineTime", { kind: "line", range, format: v => clock(v * 60_000),
              series: [{ name: "Time", color: SERIES[0], points: point(s => s.durationMs / 60_000) }] }, "Time to complete each session", "Time to complete")}</div>` +
          `<div>${chart("pvRoutineMistakes", { kind: "line", range, format: v => String(Math.round(v)),
              series: [{ name: "Mistakes", color: SERIES[0], points: point(s => s.mistakes) }] }, "Mistakes per session", "Mistakes")}</div></div>` +
          table(["Date", "Time", "Mistakes", "Direction", "Metronome"],
            sessions.map(s => [longDate(s.at), clock(s.durationMs), String(s.mistakes), s.direction === "sharps" ? "↻ sharps" : "↺ flats", s.bpm ? `${s.bpm} BPM` : "off"])));
      } else routineCard = card("Routines", "", empty("Finish a routine to see your time and mistakes here."));

      // Exercise: mistakes per run, and timing (or evenness), with each run faint behind the daily median
      let exerciseCard: string;
      if (exercise) {
        const rs = exerciseRuns(records, exercise.exerciseId);
        const timed = rs.some(r => r.onTime != null);
        const steady = (r: typeof rs[number]) => timed ? r.onTime : r.evenness;
        const med = (value: (r: typeof rs[number]) => number | null) => dailyMedian(rs, value).map(d => ({ at: d.at, value: d.value, note: d.n > 1 ? `median of ${d.n}` : undefined }));
        const dots = (value: (r: typeof rs[number]) => number | null) => rs.flatMap(r => { const v = value(r); return v == null ? [] : [{ at: r.at, value: v }]; });
        exerciseCard = card(prettyAcc(exercise.label), `${rs.length} run${rs.length === 1 ? "" : "s"} · each run a faint dot, the line the day's median`,
          `<div class="pvPair"><div>${chart("pvExMistakes", { kind: "line", range, format: v => String(Math.round(v * 10) / 10),
              series: [{ name: "Mistakes", color: SERIES[0], points: med(r => r.mistakes), dots: dots(r => r.mistakes) }] }, "Mistakes per run", "Mistakes")}</div>` +
          `<div>${chart("pvExSteady", { kind: "line", range, format: pct, yInclude: [0, 1],
              series: [{ name: timed ? "On time" : "Evenness", color: SERIES[0], points: med(steady), dots: dots(steady) }] },
              timed ? "Share of steps on time, metronome runs" : "Evenness per run", timed ? "On time (metronome runs)" : "Evenness")}</div></div>` +
          table(["Date", "Mistakes", "On time", "Evenness", "Metronome", "In a routine"],
            rs.map(r => [longDate(r.at), String(r.mistakes), r.onTime == null ? "–" : pct(r.onTime), pct(r.evenness), r.tempo ?? "off", r.inRoutine ? "yes" : ""])));
      } else exerciseCard = card("Exercises", "", empty("Finish a scale or diatonic chords run to see it here."));

      // Drills: right first time per day, per drill, and the prompts that trip you up most
      const perDrill = drillsPerDay(records);
      const drillSeries = DRILLS.map((k, i) => ({ name: DRILL_NAMES[k], color: SERIES[i], points: perDrill[k].map(d => ({ at: d.at, value: d.firstTry, note: `${d.n} prompt${d.n === 1 ? "" : "s"}` })) }))
        .filter(s => s.points.length);
      const weak = weakestPrompts(records);
      const drillCard = card("Drills: right first time", "Skips count as not right first time", drillSeries.length
        ? (drillSeries.length > 1 ? `<div class="pvLegend">${drillSeries.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>` : "") +
          chart("pvDrills", { kind: "line", range, format: pct, yInclude: [0, 1], series: drillSeries }, "Share of drill prompts right first time per day") +
          table(["Day", ...drillSeries.map(s => s.name)], [...new Set(drillSeries.flatMap(s => s.points.map(p => p.at)))].sort((a, b) => a - b)
            .map(at => [longDate(at), ...drillSeries.map(s => { const p = s.points.find(q => q.at === at); return p ? `${pct(p.value)} (${p.note})` : "–"; })])) +
          (weak.length ? `<h4>Trickiest prompts</h4><table class="pvWeak"><thead><tr><th>Prompt</th><th>Drill</th><th>Asked</th><th>First try</th><th>Typical time</th></tr></thead><tbody>` +
            weak.map(w => `<tr><td>${esc(prettyAcc(w.prompt))}</td><td>${esc(DRILL_NAMES[w.drill])}</td><td>${w.asked}</td><td>${pct(w.firstTry)}</td><td>${(w.medianMs / 1000).toFixed(1)} s</td></tr>`).join("") +
            `</tbody></table>` : "")
        : empty("Answer some note, chord, progression or ear-training prompts to see them here."));

      const tiles = [
        ["Days practised", String(sum.daysPractised)], ["Practice time", minutes(sum.practiceMs)],
        ["Exercise runs", `${sum.runs}`, sum.runs ? `${sum.cleanRuns} clean` : ""], ["Routines finished", String(sum.routinesFinished)],
        ["Drill prompts", String(sum.drillPrompts)],
      ].map(([label, value, note]) => `<div class="pvTile"><div class="pvTileLabel">${esc(label)}</div><div class="pvTileValue">${esc(value)}</div>${note ? `<div class="pvTileNote">${esc(note)}</div>` : ""}</div>`).join("");

      const option = (value: string, text: string, selected: boolean) => `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(text)}</option>`;
      el.innerHTML =
        `<div class="pvFilters"><button class="link" id="pvBack">← Back to practice</button>` +
          `<label class="pick">Range <select id="pvRange">${RANGES.map(r => option(r, r === "all" ? "All time" : `Last ${r} days`, r === sel.range)).join("")}</select></label>` +
          (routines.length ? `<label class="pick">Routine <select id="pvRoutine">${routines.map(r => option(r.id, r.name, r === routine)).join("")}</select></label>` : "") +
          (exercises.length ? `<label class="pick">Exercise <select id="pvExercise">${exercises.map(x => option(x.exerciseId, prettyAcc(x.label), x === exercise)).join("")}</select></label>` : "") +
          `<span class="pvCount">${all.length} record${all.length === 1 ? "" : "s"}${saved ? "" : " · not saved in this browser"}</span>` +
        `</div>` +
        `<div class="pvTiles">${tiles}</div>` +
        `<div class="pvGrid">${practice}${routineCard}${exerciseCard}${drillCard}</div>`;

      for (const c of charts) unmount.push(mountChart(el.querySelector<HTMLElement>(`#${c.id}`)!, c.model, c.label));
      const pick = (id: string, f: (v: string) => ProgressSelection) => {
        const s = el.querySelector<HTMLSelectElement>(`#${id}`);
        if (s) s.onchange = () => { s.blur(); change(f(s.value)); };
      };
      el.querySelector<HTMLButtonElement>("#pvBack")!.onclick = () => actions.back();
      pick("pvRange", v => ({ ...sel, range: v as RangeChoice }));
      pick("pvRoutine", v => ({ ...sel, routine: v }));
      pick("pvExercise", v => ({ ...sel, exercise: v }));
    },
  };
}
