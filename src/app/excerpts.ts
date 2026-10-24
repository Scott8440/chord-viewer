// The sight-reading excerpts, served next to the page: the songs' melodies (reading/lieder.json) and their piano
// parts (reading/lieder-piano.json, bigger, so only fetched when piano is chosen). Each is fetched once, when first
// needed.
import type { ExcerptFile } from "../exercises/excerpts";

export type ExcerptLibrary = "melody" | "piano";
const FILES: Record<ExcerptLibrary, string> = { melody: "reading/lieder.json", piano: "reading/lieder-piano.json" };

const files = new Map<ExcerptLibrary, Promise<ExcerptFile>>();

/** A library of excerpts; a failed load isn't kept, so asking again tries again */
export function loadExcerpts(which: ExcerptLibrary): Promise<ExcerptFile> {
  let file = files.get(which);
  if (!file) {
    file = fetch(FILES[which])
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<ExcerptFile>; })
      .then(f => { if (f.version !== 2 || !Array.isArray(f.excerpts)) throw new Error("unknown excerpt file"); return f; })
      .catch(e => { files.delete(which); throw e; });
    files.set(which, file);
  }
  return file;
}
