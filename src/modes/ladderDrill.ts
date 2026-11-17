// A ladder (src/exercises/ladders.ts) on an ear drill: where the player stands, shown while playing and in each
// round's summary; Next round moving up after a round that unlocked a level; the level picker; and a saved level
// that isn't unlocked here (another browser's, or history cleared) pulled back to the highest that is. Shared by the
// drills that climb a ladder (chord qualities, progressions); each says which ladder, whether it's on, and how it
// sets its level.
import { ladderProgress, type Ladder, type LadderProgress } from "../exercises/ladders";
import type { RoundSummary } from "../exercises/rounds";
import { esc } from "../views/html";
import type { LadderPickView } from "../views/ladderPick";
import {
  justUnlocked,
  ladderPlayingText,
  ladderSummaryText,
  type LadderStatus,
  type PracticeDisplay,
} from "../views/practice";
import type { EarDrill } from "./earDrill";

export interface LadderDrill {
  /** Where the player is on the ladder (null off it) */
  status(): LadderStatus | null;
  /** The playing display with the player's level and progress under its label */
  playing(d: PracticeDisplay): PracticeDisplay;
  /** The round summary with what the round did for unlocking; notes the level Next round moves up to, if any */
  summary(summary: RoundSummary, d: PracticeDisplay): PracticeDisplay;
  /** The Next round button's label: "Next round", or "Next round: level 3" after an unlocking round */
  nextLabel(): string;
  /** After each render: the picker, and a level not unlocked here pulled back */
  rendered(summary: RoundSummary | null): void;
  /** Next round: up a level if the round just finished unlocked one (new options start the round), else the same */
  nextRound(): void;
  /** The summary is on screen (Skip is Next round then) */
  showingSummary(): boolean;
  stop(): void;
}

export function createLadderDrill<O>(o: {
  ladder: Ladder<O>;
  /** On the ladder (rather than free choice) */
  enabled(): boolean;
  level(): number;
  /** This round counts towards unlocking */
  counts(): boolean;
  setLevel(level: number): void;
  /** The drill, once made (it's made after this, since its config uses this) */
  drill(): EarDrill<unknown, unknown>;
  picker?: LadderPickView;
}): LadderDrill {
  let promoteTo: number | null = null;
  let showing = false;
  let stopped = false;
  const levels = o.ladder.levels.length;

  /** The rounds played on this ladder so far, oldest first (empty until the history is read) */
  const rounds = () =>
    (o.drill().knownRounds() ?? []).flatMap(r =>
      r.ladder?.id === o.ladder.id ? [{ level: r.ladder.level, share: r.share }] : [],
    );

  function status(): LadderStatus | null {
    if (!o.enabled()) return null;
    return {
      levels: o.ladder.levels,
      level: o.level(),
      progress: ladderProgress(levels, rounds()),
      counts: o.counts(),
    };
  }

  const offPick = o.picker?.onPick(level => o.setLevel(level)) ?? (() => {});

  return {
    status,
    playing(d) {
      const st = status();
      return st
        ? { ...d, promptHtml: d.promptHtml + `<div class="ladderLine">${esc(ladderPlayingText(st))}</div>` }
        : d;
    },
    summary(summary, d) {
      const st = status();
      promoteTo = null;
      // Once the round is among the known ones (its comparison is in): what it did for unlocking
      if (!st || !summary.comparison || !o.drill().knownRounds()) return d;
      const before: LadderProgress = st.counts ? ladderProgress(levels, rounds().slice(0, -1)) : st.progress;
      promoteTo = justUnlocked(st, before);
      const text = ladderSummaryText(st, before, summary.firstTry / summary.size);
      return { ...d, promptHtml: d.promptHtml + `<div class="roundLadder">${esc(text)}</div>` };
    },
    nextLabel: () => (promoteTo != null ? `Next round: level ${promoteTo + 1}` : "Next round"),
    rendered(summary) {
      showing = !!summary;
      if (!summary) promoteTo = null;
      const st = status();
      if (!st || !o.drill().knownRounds()) return;
      o.picker?.render(st.levels, st.progress.unlocked, st.level);
      if (st.level > st.progress.unlocked) {
        const to = st.progress.unlocked;
        queueMicrotask(() => {
          if (!stopped && o.level() > to) o.setLevel(to);
        });
      }
    },
    nextRound() {
      if (showing && promoteTo != null) {
        const to = promoteTo;
        promoteTo = null;
        o.setLevel(to);
      } else o.drill().nextRound();
    },
    showingSummary: () => showing,
    stop() {
      stopped = true;
      offPick();
    },
  };
}
