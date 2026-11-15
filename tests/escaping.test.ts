// HTML escaping: hostile text from imported history files, excerpt files or storage reaches the page only as text.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_EXERCISE_OPTIONS } from "../src/exercises/prescriptive";
import { initialRoutine, routineById } from "../src/exercises/routines";
import { scaleExercise } from "../src/exercises/scales";
import { initialSequence } from "../src/exercises/sequence";
import type { Excerpt, ExcerptFeatures } from "../src/exercises/excerpts";
import { initialReading, makeExcerptPrompt } from "../src/exercises/sightReading";
import { parseExport, RECORD_VERSION, type ProgressRecord } from "../src/progress/records";
import { buildKey } from "../src/theory";
import { createAnswerBoard } from "../src/views/answerBoard";
import { columnChartSvg, lineChartSvg } from "../src/views/charts";
import { chordSymbolHtml } from "../src/views/chordName";
import { circleSvg } from "../src/views/circleOfFifths";
import { esc } from "../src/views/html";
import { createProgressView, type ProgressSelection } from "../src/views/progressView";
import { dotsSvg, lineSvg, ringSvg } from "../src/views/roundViz";
import { roundSummaryDisplay, routineDisplay, sequenceDisplay, sightReadingDisplay } from "../src/views/practice";

const HOSTILE = [`<img src=x onerror=alert(1)>`, `"><script>alert(2)</script>`, `' onmouseover='alert(3)`, `&lt;b&gt;`];
const H = HOSTILE.join(" ");

/** No markup or attribute break-out from the hostile strings */
function expectSafe(html: string) {
  expect(html).not.toMatch(/<img/i);
  expect(html).not.toMatch(/<script/i);
  // Every tag the markup really has, outside its (double-quoted) attribute values: no handler or other part of the
  // hostile text, and no stray quotes
  for (const tag of html.match(/<[^>]*>/g) ?? []) {
    const bare = tag.replace(/"[^"]*"/g, '""');
    expect(bare).not.toMatch(/alert|onerror|onmouseover|onload|script|'/i);
  }
  // Already-escaped text is escaped again, so it reads as typed
  expect(html).not.toMatch(/&lt;b&gt;(?!;)/);
}

describe("esc", () => {
  it("escapes markup and both kinds of quote", () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    expect(esc(42)).toBe("42");
  });
});

/** A stand-in element: records what's written to innerHTML; anything queried is another stand-in */
interface FakeEl { innerHTML: string; [k: string]: unknown }
let writes: string[] = [];
function fakeEl(): FakeEl {
  let html = "";
  const el: FakeEl = {
    get innerHTML() { return html; },
    set innerHTML(v: string) { html = v; writes.push(v); },
    clientWidth: 600, clientHeight: 200, offsetWidth: 100, offsetHeight: 40, hidden: false, className: "", textContent: "",
    style: {}, dataset: {},
    querySelector: () => fakeEl(), querySelectorAll: () => [],
    setAttribute() {}, append() {}, replaceChildren() {}, addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 200 }),
    classList: { add() {}, remove() {}, toggle() {} },
  };
  return el;
}

describe("the Progress page", () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, ResizeObserver: g.ResizeObserver };
  beforeEach(() => {
    writes = [];
    g.document = { createElement: () => fakeEl() };
    g.ResizeObserver = class { observe() {} disconnect() {} };
  });
  afterEach(() => { g.document = saved.document; g.ResizeObserver = saved.ResizeObserver; });

  const now = Date.now();
  const meta = (i: number) => ({ id: `id${i}`, v: RECORD_VERSION, at: now - i * 3_600_000, device: H });
  const tempo = { bpm: H, subdivision: H, strictness: H, latencyMs: 0 };
  const raw = [
    { ...meta(1), kind: "drill", drill: "chords", prompt: H, detail: { type: H, key: H }, outcome: "corrected", ms: 1500 },
    { ...meta(2), kind: "drill", drill: "chords", prompt: H, detail: { type: H }, outcome: "firstTry", ms: 900 },
    { ...meta(3), kind: "drill", drill: "chords", prompt: H, detail: {}, outcome: "skipped", ms: 4000 },
    { ...meta(4), kind: "drill", drill: "chordEar", prompt: H, detail: { type: H, guesses: `${H},M` }, outcome: "corrected", ms: 2000 },
    { ...meta(5), kind: "drill", drill: H, prompt: H, detail: { x: H }, outcome: "corrected", ms: 2000 },
    { ...meta(6), kind: "run", exercise: "scales", exerciseId: H, title: H, key: H, tempo, mistakes: 1, durationMs: 9000,
      bpm: 100, evenness: 0.9, timing: { onTime: 0.8, meanOffsetMs: 5, spreadMs: 3, slips: 0, bpm: 100, subdivision: 1 }, routineSession: H },
    { ...meta(7), kind: "run", exercise: H, exerciseId: H, title: H, key: H, tempo: null, mistakes: 0, durationMs: 5000,
      bpm: 90, evenness: 0.7, timing: null, routineSession: null },
    { ...meta(8), kind: "routine", session: H, routine: H, name: H, direction: H, startedAt: now - 9_000_000, durationMs: 60_000,
      finished: true, totalItems: 12, items: [], totalMistakes: 3, tempo },
    { ...meta(9), kind: "round", drill: "chordEar", size: 20, firstTry: 15, setup: H, durationMs: 60_000 },
  ];
  const file = JSON.stringify({ format: "chord-display-history", version: 1, exportedAt: now, records: raw });

  it("shows hostile record fields as text, in every section and filter", () => {
    const parsed = parseExport(file);
    if ("error" in parsed) throw new Error(parsed.error);
    const records: ProgressRecord[] = [...parsed.records].sort((a, b) => a.at - b.at);
    const el = fakeEl();
    const view = createProgressView(el as unknown as HTMLElement, { change() {}, back() {} });
    const selections: ProgressSelection[] = [
      { range: "7", routine: null, exercise: null, drill: null },
      { range: "all", routine: H, exercise: H, drill: "chordEar" },
      { range: "30", routine: H, exercise: H, drill: H as never },
      { range: "90", routine: null, exercise: null, drill: "chords" },
    ];
    for (const sel of selections) {
      writes = [];
      view.render(records, sel, false);
      view.clear();
      const page = el.innerHTML;
      expect(page).toContain(esc(HOSTILE[0]));
      // The routine's name, the exercise's label, the drill prompts
      expect(page.split(esc(HOSTILE[0])).length).toBeGreaterThan(3);
      for (const w of writes) expectSafe(w);
    }
    // The charts were drawn (and checked) too
    expect(writes.some(w => w.startsWith("<svg"))).toBe(true);
  });
});

describe("chart SVG", () => {
  const range = { from: 0, to: 7 * 86_400_000 };
  it("never puts series names, notes or colours into markup unescaped", () => {
    const line = lineChartSvg({
      kind: "line", range, format: v => `${v} ${H}`,
      series: [{ name: H, color: `red" onload="alert(1)`, points: [{ at: 86_400_000, value: 1, note: H }, { at: 2 * 86_400_000, value: 2 }],
                 dots: [{ at: 86_400_000, value: 1 }] }],
    }, 400);
    expectSafe(line.svg);
    expect(line.svg).not.toContain(`" onload`);
    // Tooltip rows are set as textContent by mountChart: the raw text stays raw there
    expect(line.anchors[0].rows[0].name).toBe(`${H} (${H})`);
    const cols = columnChartSvg({ kind: "columns", name: H, color: `x"><script>`, range, days: [{ at: 86_400_000, value: 3 }], format: () => H }, 400);
    expectSafe(cols.svg);
  });
});

describe("practice presenters", () => {
  const FEATURES: ExcerptFeatures = {
    notes: 2, bars: 1, keyAccidentals: 0, chromatic: 0, range: 2, ledger: 0, maxLeap: 2, stepShare: 1, values: 1,
    shortest: 1 / 4, dotted: 0, ties: 0, tuplets: 0, rests: 0, syncopations: 0, compound: false, chord: 1, span: 0, voices: 1,
  };
  const tune: Excerpt = {
    id: H, source: 0, key: 0, time: [2, 4], parts: { voice: FEATURES },
    staves: [{ clef: "treble", voices: [[[{ v: "q", n: [{ p: 60, s: 14 }] }, { v: "q", n: [{ p: 62, s: 16 }] }]]] }],
  };

  it("sight reading: a hostile excerpt title and composer", () => {
    const p = makeExcerptPrompt(tune, { composer: H, title: H, scoreId: H }, "voice", 1, "C:major")!;
    const d = sightReadingDisplay(initialReading(p));
    expectSafe(d.promptHtml);
    expect(d.promptHtml).toContain(esc(HOSTILE[1]));
  });

  it("sequences and routines: a hostile exercise title", () => {
    const ex = { ...scaleExercise(buildKey("C:major")!, "natural", 1), title: H };
    const d = sequenceDisplay(initialSequence(ex), "names");
    expectSafe(d.promptHtml);
    expect(d.promptHtml).toContain(esc(HOSTILE[2]));
    const r = initialRoutine(routineById("scales-circle")!, "sharps", DEFAULT_EXERCISE_OPTIONS);
    const hostile = { ...r, routine: { ...r.routine, name: H }, current: { ...r.current, exercise: { ...r.current.exercise, title: H } } };
    expectSafe(routineDisplay(hostile, "names").promptHtml);
  });

  it("chord symbols escape every part", () => {
    expectSafe(chordSymbolHtml(`C${H}`, H, `E${H}`));
  });

  it("round summary and round viz hold numbers only, even from odd history", () => {
    const d = roundSummaryDisplay({ size: 20, firstTry: 10, durationMs: 1000,
      comparison: { share: 0.5, previous: [Number(H), 0.4], last: 0.4, best: 0.4, average: 0.4 } }, H);
    expectSafe(d.promptHtml);
    const m = { outcomes: ["firstTry", "corrected", "skipped"] as const, average: 0.5 };
    for (const svg of [dotsSvg(m), ringSvg(m), lineSvg(m)]) expectSafe(svg);
  });

  it("circle of fifths escapes its centre text", () => {
    expectSafe(circleSvg({ keyValue: "C:major", center: { text: H, arrow: H } } as Parameters<typeof circleSvg>[0]));
  });
});

describe("answer board", () => {
  it("escapes box ids, labels and details, in attributes and text", () => {
    const el = fakeEl();
    const board = createAnswerBoard(el as unknown as HTMLElement);
    board.render([{ id: H, label: H, key: 1, state: "", detail: H, disabled: false }], { enabled: true });
    expectSafe(el.innerHTML);
    expect(el.innerHTML).toContain(`data-midi-name="${esc(H)}"`);
    board.renderNext(H);
    expectSafe(el.innerHTML);
  });
});
