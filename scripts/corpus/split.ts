// One-off: splits the version 2 excerpt files (public/reading/lieder.json, melodies; lieder-piano.json, piano) into
// one file per part, as import.ts now writes them, and removes the old two. For when the corpus isn't at hand:
//   node scripts/corpus/split.ts
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import type { ExcerptSource } from "../../src/exercises/excerpts.ts";
import { splitByPart, writeParts, type ExcerptCollection } from "./parts.ts";

const DIR = "public/reading";
const OLD = [`${DIR}/lieder.json`, `${DIR}/lieder-piano.json`];

const old = OLD.map(path => {
  const f = JSON.parse(readFileSync(path, "utf8")) as ExcerptCollection & {
    version: number;
    credit: string;
    sources: ExcerptSource[];
  };
  if (f.version !== 2) throw new Error(`${path}: version ${f.version}, not 2`);
  return f;
});
if (old[0].credit !== old[1].credit) throw new Error("the two files' credits differ");
writeParts(DIR, splitByPart(old[0].credit, old));
for (const path of OLD) if (existsSync(path)) unlinkSync(path);
