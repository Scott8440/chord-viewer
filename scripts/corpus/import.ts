// Builds the sight-reading excerpts from the OpenScore Lieder corpus (CC0) and prints how they spread across the
// difficulty measures: the melodies (public/reading/lieder.json) and the piano parts (public/reading/lieder-piano.json,
// a separate file since it's bigger and only needed when reading piano). Run from the project root, with the corpus
// fetched into corpus/lieder (see CLAUDE.md):
//   node scripts/corpus/import.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";
import {
  fitsLevel, levelsFor, readingLevel, type Excerpt, type ExcerptFeatures, type ExcerptFile, type ExcerptSource,
  type ReadingPart,
} from "../../src/exercises/excerpts.ts";
import { bassFor } from "./arrange.ts";
import { asMelody, cutExcerpts, cutPianoExcerpts, measure } from "./excerpts.ts";
import { readMscx } from "./mscx.ts";

const ROOT = "corpus/lieder/scores";
const CREDIT = "Excerpts from the OpenScore Lieder Corpus (CC0), https://github.com/OpenScore/Lieder";

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

/** One output file: its sources (each song once, numbered as it's first used) and excerpts (each piece of music once) */
function collection() {
  const sources: ExcerptSource[] = [], excerpts: Excerpt[] = [];
  const sourceIndex = new Map<string, number>(), seen = new Set<string>();
  let duplicates = 0;
  return {
    sources, excerpts,
    get duplicates() { return duplicates; },
    add(source: ExcerptSource, cut: Omit<Excerpt, "source">[]) {
      for (const e of cut) {
        // The same music again (a strophic song's next verse, a repeat): once is enough
        const sig = JSON.stringify([e.key, e.time, e.staves]);
        if (seen.has(sig)) { duplicates++; continue; }
        seen.add(sig);
        if (!sourceIndex.has(source.scoreId)) sourceIndex.set(source.scoreId, sources.push(source) - 1);
        excerpts.push({ ...e, source: sourceIndex.get(source.scoreId)! });
      }
    },
  };
}

const melodies = collection(), piano = collection();
const skipped = new Map<string, number>();
const problems = new Map<string, number>();
const skip = (why: string) => skipped.set(why, (skipped.get(why) ?? 0) + 1);
const tally = (bars: { problems: string[] }[], prefix: string) => {
  for (const bar of bars) for (const p of new Set(bar.problems)) problems.set(`${prefix}${p}`, (problems.get(`${prefix}${p}`) ?? 0) + 1);
};

for (const path of scores(ROOT)) {
  const parts = relative(ROOT, path).split(sep);
  const scoreId = parts[parts.length - 1].replace(/^lc|\.mscx$/g, "");
  let song;
  try { song = readMscx(readFileSync(path, "utf8"), scoreId); } catch (err) { skip(`unreadable: ${(err as Error).message.slice(0, 40)}`); continue; }
  if (!song?.voice) { skip("no voice part"); continue; }
  if (!song.piano) skip("no piano part");
  const source = { composer: composerName(parts[0]), title: song.title || parts[parts.length - 2].replace(/_/g, " "), scoreId };
  const melody = asMelody(song.voice);
  tally(melody, "voice: ");
  if (song.piano) { tally(song.piano[0], "right hand: "); tally(song.piano[1], "left hand: "); }
  const cut = cutExcerpts(melody, scoreId);
  if (!cut.length) skip("no clean melody excerpt");
  melodies.add(source, cut);
  piano.add(source, cutPianoExcerpts(song));
  // Easy both-hands pieces: a melody with a simple bass added, kept when it comes out at piano level 1 (the songs'
  // own accompaniments are rarely that easy)
  piano.add(source, cut.flatMap(e => {
    const lh = bassFor(e);
    if (!lh) return [];
    const staves = [e.staves[0], lh];
    const both = measure(staves, e.key, e.time);
    return readingLevel(both, "both") === 1 ? [{ id: `${e.id}+bass`, key: e.key, time: e.time, staves, parts: { both }, arranged: "bass" as const }] : [];
  }));
}

mkdirSync("public/reading", { recursive: true });
function write(out: string, c: ReturnType<typeof collection>) {
  const file: ExcerptFile = { version: 2, credit: CREDIT, sources: c.sources, excerpts: c.excerpts };
  const json = JSON.stringify(file);
  writeFileSync(out, json);
  console.log(`${out}: ${c.excerpts.length} excerpts from ${c.sources.length} songs, after ${c.duplicates} duplicates ` +
    `(${(json.length / 1024 / 1024).toFixed(1)} MB, ${(gzipSync(json).length / 1024 / 1024).toFixed(1)} MB gzipped)`);
}
write("public/reading/lieder.json", melodies);
write("public/reading/lieder-piano.json", piano);

/* ------------------------------------------------------------------ report */
console.log(`Skipped: ${[...skipped].map(([k, n]) => `${n} ${k}`).join(", ")}`);
console.log(`Bar problems: ${[...problems].sort().map(([k, n]) => `${k} ${n}`).join(", ")}`);

const pct = (n: number, of: number) => `${(100 * n / of).toFixed(1)}%`;
const count = <T>(xs: readonly T[], key: (x: T) => string | number) => {
  const m = new Map<string | number, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].sort((a, b) => (typeof a[0] === "number" && typeof b[0] === "number" ? a[0] - b[0] : String(a[0]).localeCompare(String(b[0]))));
};
const bucket = (v: number, edges: number[]) => { const i = edges.findIndex(e => v <= e); return i < 0 ? `>${edges[edges.length - 1]}` : `<=${edges[i]}`; };

function report(name: string, part: ReadingPart, excerpts: Excerpt[]) {
  const f = excerpts.flatMap(e => e.parts[part] ? [e.parts[part]!] : []);
  const show = (title: string, rows: [string | number, number][]) =>
    console.log(`  ${title}: ` + rows.map(([k, n]) => `${k} ${n} (${pct(n, f.length)})`).join(", "));
  console.log(`\n${name}: ${f.length} excerpts`);
  const levels = levelsFor(part);
  show("Level", count(f, x => readingLevel(x, part)));
  // What holds excerpts back from the easy levels: the limit each one fails, among those failing only one
  for (const level of [0, 1, 2]) {
    const limits = levels[level].limits;
    const single = new Map<string, number>();
    for (const x of f) {
      const failed = (Object.keys(limits) as (keyof typeof limits)[]).filter(k => !fitsLevel(x, { ...levels[4].limits, [k]: limits[k] }));
      if (failed.length === 1) single.set(failed[0], (single.get(failed[0]) ?? 0) + 1);
    }
    console.log(`  Level ${level + 1}, held back by one limit only: ` +
      [...single].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(", "));
  }
  const g = (title: string, key: (x: ExcerptFeatures) => string | number) => show(title, count(f, key));
  g("Notes struck", x => bucket(x.notes, [4, 8, 16, 32]));
  g("Chord", x => x.chord);
  g("Span", x => bucket(x.span, [0, 7, 12, 16]));
  g("Voices", x => x.voices);
  g("Range", x => bucket(x.range, [7, 9, 12, 16, 24]));
  g("Widest leap", x => bucket(x.maxLeap, [4, 7, 9, 12]));
  g("Shortest value", x => `1/${Math.round(1 / x.shortest)}`);
  g("Note values", x => x.values);
  g("Ledger lines", x => x.ledger);
  g("Strikes a bar", x => bucket(x.notes / x.bars, [4, 6, 8, 12, 16]));
}
report("Melody", "voice", melodies.excerpts);
report("Right hand", "rh", piano.excerpts);
report("Left hand", "lh", piano.excerpts);
report("Both hands", "both", piano.excerpts);
