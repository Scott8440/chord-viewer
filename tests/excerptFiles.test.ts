// The sight-reading excerpt files, one per part: splitting the excerpts as cut into them (scripts/corpus/parts.ts),
// the committed files in public/reading, and loading a part's file in the app (src/app/excerpts.ts).
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { measure } from "../scripts/corpus/excerpts";
import { splitByPart } from "../scripts/corpus/parts";
import {
  checkExcerptFile,
  EXCERPT_FILE_VERSION,
  excerptFileName,
  excerptSteps,
  partStaves,
  EXCERPT_PARTS,
  readingLevel,
  type Excerpt,
  type ExcerptFile,
  type ExcerptStaff,
  type ReadingPart,
} from "../src/exercises/excerpts";
import { readingLoadingDisplay } from "../src/views/practice";

const q = (p: number, s: number) => ({ v: "q" as const, n: [{ p, s }] });
const treble: ExcerptStaff = { clef: "treble", voices: [[[q(64, 18), q(65, 13), q(67, 15), q(65, 13)]]] };
const bass: ExcerptStaff = {
  clef: "bass",
  voices: [
    [
      [
        {
          v: "h",
          n: [
            { p: 48, s: 14 },
            { p: 55, s: 15 },
          ],
        },
        q(43, 15),
        q(48, 14),
      ],
    ],
  ],
};
const time: [number, number] = [4, 4];
const SOURCES = [
  { composer: "A", title: "One", scoreId: "1" },
  { composer: "B", title: "Two", scoreId: "2" },
];
const melody: Excerpt = {
  id: "1:1-1",
  source: 0,
  key: 0,
  time,
  staves: [treble],
  parts: { voice: measure([treble], 0, time) },
};
const pianoCut: Excerpt = {
  id: "2:1-1",
  source: 1,
  key: 0,
  time,
  staves: [treble, bass],
  parts: { rh: measure([treble], 0, time), lh: measure([bass], 0, time), both: measure([treble, bass], 0, time) },
};
const arranged: Excerpt = {
  id: "1:1-1+bass",
  source: 0,
  key: 0,
  time,
  staves: [treble, bass],
  parts: { both: measure([treble, bass], 0, time) },
  arranged: "bass",
};

describe("splitting excerpts into one file per part", () => {
  const files = splitByPart("credit", [
    { sources: SOURCES, excerpts: [melody] },
    { sources: SOURCES, excerpts: [pianoCut, arranged] },
  ]);

  it("puts each excerpt in the file of every part it can be read as, with only that part's staves and features", () => {
    expect(files.voice.excerpts.map(e => e.id)).toEqual(["1:1-1"]);
    expect(files.rh.excerpts.map(e => e.id)).toEqual(["2:1-1"]);
    expect(files.lh.excerpts.map(e => e.id)).toEqual(["2:1-1"]);
    expect(files.both.excerpts.map(e => e.id)).toEqual(["2:1-1", "1:1-1+bass"]);
    expect(files.rh.excerpts[0].staves).toEqual([treble]);
    expect(files.lh.excerpts[0].staves).toEqual([bass]);
    expect(files.both.excerpts[0].staves).toEqual([treble, bass]);
    for (const part of EXCERPT_PARTS) {
      for (const e of files[part].excerpts) expect(Object.keys(e.parts)).toEqual([part]);
    }
    expect(files.both.excerpts[1].arranged).toBe("bass");
    expect(files.rh.excerpts[0].arranged).toBeUndefined();
  });

  it("reads back the same staves, steps and level as before splitting", () => {
    const before: [Excerpt, ReadingPart][] = [
      [melody, "voice"],
      [pianoCut, "rh"],
      [pianoCut, "lh"],
      [pianoCut, "both"],
      [arranged, "both"],
    ];
    for (const [e, part] of before) {
      const after = files[part].excerpts.find(x => x.id === e.id)!;
      expect(partStaves(after, part)).toEqual(partStaves(e, part));
      expect(excerptSteps(partStaves(after, part), after.time)).toEqual(excerptSteps(partStaves(e, part), e.time));
      expect(readingLevel(after.parts[part]!, part)).toBe(readingLevel(e.parts[part]!, part));
    }
  });

  it("keeps the credit and the version, and only the songs each file uses, numbered as first used", () => {
    for (const part of EXCERPT_PARTS) {
      expect(files[part]).toMatchObject({ version: EXCERPT_FILE_VERSION, part, credit: "credit" });
    }
    expect(files.rh.sources).toEqual([SOURCES[1]]);
    expect(files.rh.excerpts[0].source).toBe(0);
    expect(files.both.sources).toEqual([SOURCES[1], SOURCES[0]]);
    expect(files.both.excerpts.map(e => files.both.sources[e.source].title)).toEqual(["Two", "One"]);
  });

  it("is strict about the file: this version, this part", () => {
    const ok: ExcerptFile = files.lh;
    expect(checkExcerptFile(ok, "lh")).toBe(ok);
    expect(() => checkExcerptFile(ok, "rh")).toThrow();
    expect(() => checkExcerptFile({ ...ok, version: 2 }, "lh")).toThrow();
    expect(() => checkExcerptFile({ version: 2, credit: "", sources: [], excerpts: [] }, "voice")).toThrow();
    expect(() => checkExcerptFile({ ...ok, excerpts: undefined }, "lh")).toThrow();
    expect(() => checkExcerptFile(null, "lh")).toThrow();
  });
});

describe("the committed excerpt files", () => {
  // Levels 1–5 of each part, as they were before the files were split (CLAUDE.md, "Levels")
  const COUNTS: Record<ReadingPart, number[]> = {
    voice: [140, 1291, 3445, 4320, 2669],
    rh: [12, 317, 1604, 2049, 2881],
    lh: [51, 728, 1355, 1665, 2754],
    both: [508, 116, 828, 1604, 4429],
  };
  const STAVES: Record<ReadingPart, number> = { voice: 1, rh: 1, lh: 1, both: 2 };

  for (const part of EXCERPT_PARTS) {
    it(`${excerptFileName(part)}: only the ${part} part, every level as before`, () => {
      const file = checkExcerptFile(JSON.parse(readFileSync(`public/reading/${excerptFileName(part)}`, "utf8")), part);
      expect(file.credit).toMatch(/OpenScore Lieder/);
      const levels = [0, 0, 0, 0, 0];
      const used = new Set<number>();
      file.excerpts.forEach((e, i) => {
        expect(Object.keys(e.parts)).toEqual([part]);
        expect(e.staves.length).toBe(STAVES[part]);
        if (part === "lh") expect(e.staves[0].clef).toBe("bass");
        if (part === "rh") expect(e.staves[0].clef).toBe("treble");
        if (e.arranged) expect(part).toBe("both");
        expect(file.sources[e.source]).toBeDefined();
        used.add(e.source);
        levels[readingLevel(e.parts[part]!, part) - 1]++;
        // A sample drawn and judged: the steps are the strikes measured
        if (i % 97 === 0) expect(excerptSteps(partStaves(e, part), e.time).steps.length).toBe(e.parts[part]!.notes);
      });
      expect(levels).toEqual(COUNTS[part]);
      expect(used.size).toBe(file.sources.length);
      expect(file.excerpts.filter(e => e.arranged).length).toBe(part === "both" ? 508 : 0);
    });
  }
});

describe("loading a part's excerpts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  const good = (part: ReadingPart): ExcerptFile => ({
    version: EXCERPT_FILE_VERSION,
    part,
    credit: "c",
    sources: [],
    excerpts: [],
  });
  const respond = (body: unknown, ok = true) =>
    Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve(body) });

  it("fetches only the part's file, once", async () => {
    const fetch = vi.fn((url: string) => respond(good(url.includes("-lh") ? "lh" : "rh")));
    vi.stubGlobal("fetch", fetch);
    const { loadExcerpts } = await import("../src/app/excerpts");
    expect((await loadExcerpts("lh")).part).toBe("lh");
    await loadExcerpts("lh");
    expect(fetch.mock.calls.map(c => c[0])).toEqual(["reading/lieder-lh.json"]);
  });

  it("refuses a file of another version or part, and tries again when asked again", async () => {
    const fetch = vi
      .fn()
      .mockReturnValueOnce(respond({ ...good("voice"), version: 2 }))
      .mockReturnValueOnce(respond(good("voice"), false))
      .mockReturnValueOnce(respond(good("voice")));
    vi.stubGlobal("fetch", fetch);
    const { loadExcerpts } = await import("../src/app/excerpts");
    await expect(loadExcerpts("voice")).rejects.toThrow();
    await expect(loadExcerpts("voice")).rejects.toThrow("HTTP 404");
    expect((await loadExcerpts("voice")).part).toBe("voice");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("opened as a local file: doesn't fetch, and says the songs need the online version", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("location", { protocol: "file:" });
    const { loadExcerpts } = await import("../src/app/excerpts");
    await expect(loadExcerpts("both")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(readingLoadingDisplay(true).label).toBe("Songs need the online version (GitHub Pages) or a local server");
    expect(readingLoadingDisplay(false).label).toBe("Loading songs…");
    vi.stubGlobal("location", { protocol: "https:" });
    expect(readingLoadingDisplay(true).label).toBe("Couldn't load the songs");
  });
});
