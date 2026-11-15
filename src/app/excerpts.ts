// The sight-reading excerpts, served next to the page, one file per part (reading/lieder-voice.json for melodies,
// -rh, -lh and -both for the piano part): only the part chosen is fetched, once, when first needed.
import { checkExcerptFile, excerptFileName, type ExcerptFile, type ReadingPart } from "../exercises/excerpts";

/** Which file a part's excerpts come from: one each */
export type ExcerptLibrary = ReadingPart;

/** Opened as a local file: the browser won't fetch the songs next to it */
export const servedFromFile = () => typeof location !== "undefined" && location.protocol === "file:";

const files = new Map<ExcerptLibrary, Promise<ExcerptFile>>();

/** A part's excerpts; a failed load isn't kept, so asking again tries again */
export function loadExcerpts(part: ExcerptLibrary): Promise<ExcerptFile> {
  let file = files.get(part);
  if (!file) {
    file = (
      servedFromFile() ? Promise.reject(new Error("opened as a local file")) : fetch(`reading/${excerptFileName(part)}`)
    )
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<unknown>;
      })
      .then(f => checkExcerptFile(f, part))
      .catch(e => {
        files.delete(part);
        throw e;
      });
    files.set(part, file);
  }
  return file;
}
