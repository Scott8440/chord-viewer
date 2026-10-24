// The sight-reading excerpts (public/reading/lieder.json, served next to the page): fetched once, when first needed.
import type { ExcerptFile } from "../exercises/excerpts";

let file: Promise<ExcerptFile> | null = null;

/** The excerpts; a failed load isn't kept, so asking again tries again */
export function loadExcerpts(): Promise<ExcerptFile> {
  file ??= fetch("reading/lieder.json")
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<ExcerptFile>; })
    .then(f => { if (f.version !== 1 || !Array.isArray(f.excerpts)) throw new Error("unknown excerpt file"); return f; })
    .catch(e => { file = null; throw e; });
  return file;
}
