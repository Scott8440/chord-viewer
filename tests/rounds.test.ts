// Ear training in rounds: progress, the end of a round, and the comparison with earlier rounds.
import { describe, expect, it } from "vitest";
import { compareRound, ROUND_SIZE, roundDone, roundProgress } from "../src/exercises/rounds";
import { createRoundKeeper } from "../src/modes/rounds";
import { RECORD_VERSION, upgradeRecord, type ProgressRecord, type RecordBody } from "../src/progress/records";
import { createMemoryStore } from "../src/progress/store";
import { roundScore, roundSummaryDisplay } from "../src/views/practice";

describe("rounds", () => {
  it("count from where the round began", () => {
    const start = { answered: 40, firstTry: 30 };
    expect(roundProgress(start, { answered: 47, firstTry: 35 })).toEqual({ answered: 7, firstTry: 5 });
    expect(roundDone(start, { answered: 40 + ROUND_SIZE - 1, firstTry: 0 })).toBe(false);
    expect(roundDone(start, { answered: 40 + ROUND_SIZE, firstTry: 0 })).toBe(true);
    expect(roundScore({ answered: 7, firstTry: 5 })).toBe(`Round: 7 / ${ROUND_SIZE} · 5 right first time`);
    expect(roundScore({ answered: 0, firstTry: 0 })).toBe(`Round: 0 / ${ROUND_SIZE}`);
  });

  it("compare with the last round, the best and the average of the last ten", () => {
    expect(compareRound(0.8, [])).toEqual({ share: 0.8, previous: [], last: null, best: null, average: null });
    const earlier = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.5, 0.6, 0.7];
    const c = compareRound(0.75, earlier);
    expect(c.previous).toEqual(earlier.slice(-10));
    expect(c).toMatchObject({ last: 0.7, best: 0.9 });
    expect(c.average).toBeCloseTo(0.6);
  });
});

describe("the round keeper", () => {
  const record = (body: RecordBody, at: number) => ({ ...body, id: `r${at}`, v: RECORD_VERSION, at, device: "d" }) as ProgressRecord;
  const round = (firstTry: number, setup = "types:M,m", drill = "chordEar") =>
    ({ kind: "round", drill, size: 20, firstTry, setup, durationMs: 60_000 }) as RecordBody;

  it("ends a round after ROUND_SIZE prompts, records it, and compares it with rounds played the same way", async () => {
    const store = createMemoryStore([record(round(10), 1), record(round(14), 2), record(round(19, "types:M,m,dim"), 3), record(round(20, "types:M,m", "ear"), 4)]);
    const recorded: RecordBody[] = [];
    let changes = 0;
    const keeper = createRoundKeeper({ drill: "chordEar", setup: () => "types:M,m", history: Promise.resolve(store),
      recorder: { record: b => recorded.push(b), onRecorded: () => () => {} }, changed: () => changes++ });
    keeper.next({ answered: 5, firstTry: 3 });
    expect(keeper.check({ answered: 24, firstTry: 18 })).toBe(false);
    expect(keeper.check({ answered: 25, firstTry: 19 })).toBe(true);
    expect(keeper.summary()).toMatchObject({ size: 20, firstTry: 16, comparison: null });
    await new Promise(r => setTimeout(r, 0));
    expect(changes).toBe(1);
    // Only the two earlier rounds of this drill with these options count
    expect(keeper.summary()!.comparison).toMatchObject({ share: 0.8, previous: [0.5, 0.7], last: 0.7, best: 0.7 });
    expect(recorded).toEqual([{ kind: "round", drill: "chordEar", size: 20, firstTry: 16, setup: "types:M,m", durationMs: expect.any(Number) }]);
    // Still over until the next round begins
    expect(keeper.check({ answered: 26, firstTry: 20 })).toBe(true);
    keeper.next({ answered: 26, firstTry: 20 });
    expect(keeper.summary()).toBeNull();
    expect(keeper.progress({ answered: 27, firstTry: 21 })).toEqual({ answered: 1, firstTry: 1 });
  });

  it("round records survive reading back", () => {
    const r = record(round(12), 5);
    expect(upgradeRecord(r)).toEqual(r);
  });
});

describe("the round's summary", () => {
  it("the share, then how it compares (first round, up, down)", () => {
    const first = roundSummaryDisplay({ size: 20, firstTry: 15, durationMs: 125_000, comparison: compareRound(0.75, []) }, "Chord qualities");
    expect(first).toMatchObject({ label: "Chord qualities: round complete", skipLabel: "Next round", score: "" });
    expect(first.promptHtml).toContain(">75%<");
    expect(first.promptHtml).toContain("15 of 20 right first time · 2:05");
    expect(first.sub).toBe("Your first round played this way: the next ones will be compared with it.");
    const up = roundSummaryDisplay({ size: 20, firstTry: 17, durationMs: 1, comparison: compareRound(0.85, [0.6, 0.75]) }, "X");
    expect(up.sub).toBe("▲ 10 points on your last round · best 75% · average 68% over your last 2 rounds");
    expect(up.promptHtml).toContain('class="roundBars"');
    const down = roundSummaryDisplay({ size: 20, firstTry: 10, durationMs: 1, comparison: compareRound(0.5, [0.6]) }, "X");
    expect(down).toMatchObject({ sub: "▼ 10 points on your last round · best 60% · average 60% over your last 1 round", status: "waiting" });
    // While the earlier rounds are being read
    expect(roundSummaryDisplay({ size: 20, firstTry: 10, durationMs: 1, comparison: null }, "X").sub).toBe("");
  });
});
