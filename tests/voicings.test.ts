// Regression corpus: every voicing in voicings.json, run against the pure theory module.
import { describe, expect, it } from "vitest";
import { analyze, buildKey } from "../src/theory";
import cases from "./voicings.json";

describe("voicings", () => {
  it.each(cases.map(c => [`${c.key || "-"} ${JSON.stringify(c.notes)} → ${c.expect}`, c] as const))("%s", (_, c) => {
    const r = analyze(c.notes, buildKey(c.key));
    expect(r?.text).toBe(c.expect);
    if ("roman" in c && c.roman) expect(r?.roman).toBe(c.roman);
  });
});
