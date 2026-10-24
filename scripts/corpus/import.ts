// Builds the sight-reading excerpts from the OpenScore Lieder corpus (CC0) and prints how they spread across the
// difficulty measures. Run from the project root, with the corpus fetched into corpus/lieder (see CLAUDE.md):
//   node scripts/corpus/import.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { fitsLevel, READING_LEVELS, readingLevel, type Excerpt, type ExcerptFile, type ExcerptSource } from "../../src/exercises/excerpts.ts";
import { cutExcerpts } from "./excerpts.ts";
import { readMscx } from "./mscx.ts";

const ROOT = "corpus/lieder/scores";
const OUT = "public/reading/lieder.json";

function* scores(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* scores(path);
    else if (entry.name.endsWith(".mscx")) yield path;
  }
}

/** "Schubert,_Franz" → "Franz Schubert" */
const composerName = (folder: string) => {
  const [last, first] = folder.replace(/_/g, " ").split(",").map(s => s.trim());
  return first ? `${first} ${last}` : last;
};

const sources: ExcerptSource[] = [];
const excerpts: Excerpt[] = [];
const skipped = new Map<string, number>();
const problems = new Map<string, number>();
const seen = new Set<string>();
let duplicates = 0;
const skip = (why: string) => skipped.set(why, (skipped.get(why) ?? 0) + 1);

for (const path of scores(ROOT)) {
  const parts = relative(ROOT, path).split(sep);
  const scoreId = parts[parts.length - 1].replace(/^lc|\.mscx$/g, "");
  let line;
  try { line = readMscx(readFileSync(path, "utf8"), scoreId); } catch (err) { skip(`unreadable: ${(err as Error).message.slice(0, 40)}`); continue; }
  if (!line) { skip("no voice part"); continue; }
  for (const bar of line.bars) for (const p of new Set(bar.problems)) problems.set(p, (problems.get(p) ?? 0) + 1);
  const cut = cutExcerpts(line);
  if (!cut.length) { skip("no clean excerpt"); continue; }
  const source = sources.push({ composer: composerName(parts[0]), title: line.title || parts[parts.length - 2].replace(/_/g, " "), scoreId }) - 1;
  for (const e of cut) {
    // The same music again (a strophic song's next verse, a repeat): once is enough
    const sig = JSON.stringify([e.key, e.time, e.clef, e.bars]);
    if (seen.has(sig)) { duplicates++; continue; }
    seen.add(sig);
    excerpts.push({ ...e, source });
  }
}

const file: ExcerptFile = {
  version: 1,
  credit: "Excerpts from the OpenScore Lieder Corpus (CC0), https://github.com/OpenScore/Lieder",
  sources, excerpts,
};
mkdirSync("public/reading", { recursive: true });
const json = JSON.stringify(file);
writeFileSync(OUT, json);

/* ------------------------------------------------------------------ report */
const pct = (n: number, of: number) => `${(100 * n / of).toFixed(1)}%`;
const count = <T>(xs: readonly T[], key: (x: T) => string | number) => {
  const m = new Map<string | number, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].sort((a, b) => (typeof a[0] === "number" && typeof b[0] === "number" ? a[0] - b[0] : String(a[0]).localeCompare(String(b[0]))));
};
const show = (title: string, rows: [string | number, number][]) =>
  console.log(`\n${title}\n` + rows.map(([k, n]) => `  ${String(k).padEnd(10)} ${String(n).padStart(6)}  ${pct(n, excerpts.length).padStart(6)}`).join("\n"));
const bucket = (v: number, edges: number[]) => { const i = edges.findIndex(e => v <= e); return i < 0 ? `>${edges[edges.length - 1]}` : `<=${edges[i]}`; };
const f = excerpts.map(e => e.features);

console.log(`Scores: ${sources.length} with excerpts; skipped ${[...skipped].map(([k, n]) => `${n} ${k}`).join(", ")}`);
console.log(`Bar problems: ${[...problems].map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`Excerpts: ${excerpts.length}, after ${duplicates} duplicates (${(json.length / 1024 / 1024).toFixed(1)} MB, ` +
  `${(gzipSync(json).length / 1024 / 1024).toFixed(1)} MB gzipped) → ${OUT}`);
show("Level", count(f, x => {
  const level = readingLevel(x);
  return `${level} ${READING_LEVELS[level - 1].name}`;
}));
// What holds excerpts back from the easy levels: the limit each one fails, among those failing only one
for (const level of [0, 1, 2]) {
  const limits = READING_LEVELS[level].limits;
  const single = new Map<string, number>();
  for (const x of f) {
    const failed = (Object.keys(limits) as (keyof typeof limits)[]).filter(k => !fitsLevel(x, { ...READING_LEVELS[4].limits, [k]: limits[k] }));
    if (failed.length === 1) single.set(failed[0], (single.get(failed[0]) ?? 0) + 1);
  }
  console.log(`\nLevel ${level + 1}: excerpts held back by just one limit: ` +
    [...single].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", "));
}
show("Clef", count(excerpts, e => e.clef));
show("Bars", count(f, x => x.bars));
show("Notes to play", count(f, x => bucket(x.notes, [4, 8, 12, 16, 24])));
show("Key signature (sharps or flats)", count(f, x => x.keyAccidentals));
show("Time signature", count(excerpts, e => e.time.join("/")).sort((a, b) => b[1] - a[1]).slice(0, 10));
show("Chromatic notes", count(f, x => bucket(x.chromatic, [0, 1, 2, 4])));
show("Range (semitones)", count(f, x => bucket(x.range, [5, 7, 9, 12, 16])));
show("Ledger-line notes", count(f, x => bucket(x.ledger, [0, 1, 3])));
show("Widest leap (semitones)", count(f, x => bucket(x.maxLeap, [2, 4, 7, 9, 12])));
show("Share of steps", count(f, x => bucket(Math.round(x.stepShare * 100), [25, 50, 75, 100])));
show("Note values used", count(f, x => x.values));
show("Shortest value", count(f, x => `1/${Math.round(1 / x.shortest)}`));
show("Dotted notes", count(f, x => bucket(x.dotted, [0, 1, 3])));
show("Ties", count(f, x => bucket(x.ties, [0, 1])));
show("Tuplet notes", count(f, x => bucket(x.tuplets, [0, 3])));
show("Rests inside", count(f, x => bucket(x.rests, [0, 1])));
show("Syncopations", count(f, x => bucket(x.syncopations, [0, 1, 2])));
