// Rounds for the ear-training modes: counts a round's prompts from the mode's own counters, and when the round's size
// (ROUND_SIZE, or the drill's own) are done, records the round and compares it with earlier rounds of the same drill played the same way (read from the
// practice history once per mode session, then kept up to date here). The mode then waits for "Next round". The last
// answer stays on screen for a moment (SUMMARY_DELAY_MS) before the summary replaces it.
import {
  compareRound,
  ROUND_SIZE,
  roundDone,
  roundProgress,
  type Counters,
  type PromptOutcome,
  type RoundSummary,
} from "../exercises/rounds";
import type { Recorder } from "../progress/recorder";
import type { DrillKind, RoundBody } from "../progress/records";
import type { ProgressStore } from "../progress/store";

/** How long the round's last answer stays on screen before the summary (none when the round ended on a skip) */
export const SUMMARY_DELAY_MS = 1000;

export interface RoundKeeper {
  /** Prompts finished and right first time in this round */
  progress(now: Counters): Counters;
  /** After each answer or skip (`skipped` for a skip): true when the round is over (it's then recorded, and its
   *  summary shows after SUMMARY_DELAY_MS) */
  check(now: Counters, skipped?: boolean): boolean;
  /** The round is over: no more answers until the next (its summary may not be showing yet) */
  over(): boolean;
  /** Show the summary now, without waiting (Next pressed during the delay) */
  reveal(): void;
  /** The mode stops: no summary appears after it, and `changed` isn't called again (reading the earlier rounds can
   *  finish later, and would otherwise redraw a mode that has gone) */
  dispose(): void;
  /** How each prompt of this round went so far, in order */
  outcomes(): readonly PromptOutcome[];
  /** The average share right first time of earlier rounds played the same way (the last ten), null if none or not
   *  read yet */
  average(): number | null;
  /** The finished round, once it's showing (after the delay), while the mode waits for the next */
  summary(): RoundSummary | null;
  /** Start a round from these counters (Next round, or new options) */
  next(now: Counters): void;
  /** Prompts per round */
  size: number;
  /** This drill's rounds so far, oldest first, once read from the history (null until then); a finished round is in
   *  it by the time its comparison shows */
  known(): readonly KnownRound[] | null;
}

/** A finished round of the drill, as the keeper keeps it */
export interface KnownRound {
  setup: string;
  share: number;
  ladder?: { id: string; level: number };
}

export function createRoundKeeper(o: {
  drill: DrillKind;
  /** The options that make rounds comparable, as a key */
  setup(): string;
  /** Prompts per round: ROUND_SIZE unless the drill's prompts are long (progressions) */
  size?: number;
  /** The ladder and level a round is played on, if it is (kept on its record) */
  ladder?(): { id: string; level: number } | null;
  recorder: Recorder;
  history: Promise<ProgressStore> | null;
  /** Called when the summary has its comparison, to show it */
  changed(): void;
}): RoundKeeper {
  let start: Counters = { answered: 0, firstTry: 0 };
  let startedAt = Date.now();
  let summary: RoundSummary | null = null;
  let outcomes: PromptOutcome[] = [];
  /** The counters at the last check, to tell what the latest prompt's outcome was */
  let last: Counters = start;
  let average: number | null = null;
  /** The summary is on screen (the last answer had its moment) */
  let shown = false;
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const changed = () => {
    if (!disposed) o.changed();
  };
  function reveal() {
    clearTimeout(revealTimer);
    if (!summary || shown) return;
    shown = true;
    changed();
  }

  /** This drill's rounds so far (the earlier ones from the history, then each one finished here), read once per
   *  keeper: reading the history costs more the longer it gets, and a round finishes every few minutes. Null if the
   *  read failed (then tried again when next needed). */
  let rounds: Promise<KnownRound[] | null> | null = null;
  /** The list once read, for `known` */
  let read: KnownRound[] | null = null;
  function drillRounds() {
    rounds ??= (async () => {
      if (!o.history) return (read = []);
      const kept = await (await o.history).ofKind("round");
      return (read = kept.flatMap(r =>
        r.drill === o.drill && r.size
          ? [{ setup: r.setup, share: r.firstTry / r.size, ...(r.ladder ? { ladder: r.ladder } : {}) }]
          : [],
      ));
    })().catch(e => {
      console.error("Couldn't read earlier rounds", e);
      rounds = null;
      return null;
    });
    return rounds;
  }
  /** Earlier rounds of this drill played this way, as shares right first time, oldest first */
  const sharesOf = (list: KnownRound[] | null, setup: string) =>
    list ? list.flatMap(r => (r.setup === setup ? [r.share] : [])) : [];
  /** Reads the earlier rounds' average for the round starting now (shown while it's played) */
  function loadAverage() {
    const setup = o.setup();
    average = null;
    void drillRounds().then(list => {
      if (setup !== o.setup()) return;
      average = compareRound(0, sharesOf(list, setup)).average;
      changed();
    });
  }
  loadAverage();

  return {
    progress: now => roundProgress(start, now),
    check(now, skipped = false) {
      if (summary) return true;
      if (now.answered > last.answered) {
        outcomes.push(now.firstTry > last.firstTry ? "firstTry" : skipped ? "skipped" : "corrected");
        last = { ...now };
      }
      if (!roundDone(start, now, o.size)) return false;
      const p = roundProgress(start, now),
        setup = o.setup(),
        ladder = o.ladder?.() ?? null;
      const done: RoundSummary = {
        size: p.answered,
        firstTry: p.firstTry,
        durationMs: Date.now() - startedAt,
        comparison: null,
      };
      summary = done;
      shown = false;
      revealTimer = setTimeout(reveal, skipped ? 0 : SUMMARY_DELAY_MS);
      const body: RoundBody = {
        kind: "round",
        drill: o.drill,
        size: done.size,
        firstTry: done.firstTry,
        setup,
        durationMs: done.durationMs,
        ...(ladder ? { ladder } : {}),
      };
      // Earlier rounds first, then this one is recorded and added to the list (so it isn't compared with itself)
      void (async () => {
        const list = await drillRounds(),
          earlier = sharesOf(list, setup);
        o.recorder.record(body);
        list?.push({ setup, share: done.firstTry / done.size, ...(ladder ? { ladder } : {}) });
        if (summary === done) {
          summary = { ...done, comparison: compareRound(done.firstTry / done.size, earlier) };
          if (shown) changed();
        }
      })();
      return true;
    },
    summary: () => (shown ? summary : null),
    over: () => !!summary,
    reveal,
    dispose() {
      disposed = true;
      clearTimeout(revealTimer);
    },
    outcomes: () => outcomes,
    average: () => average,
    known: () => read,
    size: o.size ?? ROUND_SIZE,
    next(now) {
      start = { answered: now.answered, firstTry: now.firstTry };
      last = start;
      startedAt = Date.now();
      summary = null;
      shown = false;
      clearTimeout(revealTimer);
      outcomes = [];
      // The round just finished (or other options) may change the average to beat
      loadAverage();
    },
  };
}
