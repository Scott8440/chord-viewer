// One file per reading part: the importer cuts melodies (one staff, part "voice") and piano excerpts (both staves,
// read as whichever of "rh", "lh" and "both" have enough to play); the app fetches only the chosen part's file, so
// each holds only what that part needs: its staves, its features, and the songs they come from.
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import {
  EXCERPT_FILE_VERSION, excerptFileName, partStaves, EXCERPT_PARTS, type Excerpt, type ExcerptFile, type ExcerptSource, type ReadingPart,
} from "../../src/exercises/excerpts.ts";

/** Excerpts as cut, before splitting: `source` indexes `sources` */
export interface ExcerptCollection {
  sources: readonly ExcerptSource[];
  excerpts: readonly Excerpt[];
}

/** Each part's file, from any number of collections: every excerpt goes into the file of each part it can be read
 *  as (an arranged piece has only "both"), with that part's staves and features; sources renumbered per file, in
 *  the order they're first used; excerpts in their order */
export function splitByPart(credit: string, collections: readonly ExcerptCollection[]): Record<ReadingPart, ExcerptFile> {
  const file = (part: ReadingPart): ExcerptFile => ({ version: EXCERPT_FILE_VERSION, part, credit, sources: [], excerpts: [] });
  const out: Record<ReadingPart, ExcerptFile> = { voice: file("voice"), rh: file("rh"), lh: file("lh"), both: file("both") };
  const index = new Map<ReadingPart, Map<ExcerptSource, number>>(EXCERPT_PARTS.map(p => [p, new Map()]));
  for (const c of collections) {
    for (const e of c.excerpts) {
      const source = c.sources[e.source];
      if (!source) throw new Error(`${e.id}: no source ${e.source}`);
      for (const part of EXCERPT_PARTS) {
        const features = e.parts[part];
        if (!features) continue;
        const to = out[part], seen = index.get(part)!;
        if (!seen.has(source)) seen.set(source, to.sources.push(source) - 1);
        to.excerpts.push({
          id: e.id, source: seen.get(source)!, key: e.key, time: e.time, staves: partStaves(e, part),
          parts: { [part]: features }, ...(e.arranged ? { arranged: e.arranged } : {}),
        });
      }
    }
  }
  return out;
}

/** Writes each part's file into the folder (reading/lieder-<part>.json), saying how big each is */
export function writeParts(dir: string, files: Record<ReadingPart, ExcerptFile>) {
  mkdirSync(dir, { recursive: true });
  for (const part of EXCERPT_PARTS) {
    const file = files[part], json = JSON.stringify(file), out = `${dir}/${excerptFileName(part)}`;
    writeFileSync(out, json);
    console.log(`${out}: ${file.excerpts.length} excerpts from ${file.sources.length} songs ` +
      `(${(json.length / 1024 / 1024).toFixed(1)} MB, ${(gzipSync(json).length / 1024 / 1024).toFixed(2)} MB gzipped)`);
  }
}
